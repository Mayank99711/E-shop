export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export function resolveMediaUrl(url) {
  if (!url) return "";
  const resolved = new URL(url, `${apiBaseUrl.replace(/\/+$/, "")}/`);
  return ["http:", "https:"].includes(resolved.protocol)
    ? resolved.toString()
    : "";
}

const inFlightRequests = new Map();
let requestGeneration = 0;
export function resetInFlightRequests() {
  requestGeneration += 1;
  inFlightRequests.clear();
}

function getRetryAfterSeconds(response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt)
    ? undefined
    : Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

function retryGuidance(seconds) {
  if (seconds < 60) return `Try again in about ${seconds} seconds.`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60)
    return `Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
  const hours = Math.ceil(minutes / 60);
  return `Try again in about ${hours} ${hours === 1 ? "hour" : "hours"}.`;
}

function currentPortal() {
  const { pathname, search } = window.location;
  if (pathname.startsWith("/admin")) return "super-admin";
  if (pathname.startsWith("/shop")) return "shop-owner";
  if (pathname === "/login") {
    const requestedPortal = new URLSearchParams(search).get("portal");
    if (requestedPortal === "shop-owner" || requestedPortal === "super-admin")
      return requestedPortal;
  }
  return "customer";
}

async function readResponsePayload(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const isJson = /application\/json|text\/json/i.test(contentType);

  if (isJson) {
    try {
      return await response.json();
    } catch {
      // Fall through to text handling for malformed JSON.
    }
  }

  let text = "";
  try {
    text = await response.text();
  } catch {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("<")) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return { message: trimmed };
  }
}

export async function apiRequest(
  path,
  { method = "GET", body, portal = currentPortal(), signal } = {},
) {
  const normalizedMethod = method.toUpperCase();
  const isSafeMethod = ["GET", "HEAD"].includes(normalizedMethod);
  const requestKey =
    isSafeMethod && !signal
      ? `${portal} ${normalizedMethod} ${path}#${requestGeneration}`
      : null;

  if (requestKey && inFlightRequests.has(requestKey)) {
    return inFlightRequests.get(requestKey);
  }

  const requestPromise = (async () => {
    const headers = {};
    const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(normalizedMethod);
    const isFormData = body instanceof FormData;

    if (unsafeMethod) {
      const csrfResponse = await fetch(`${apiBaseUrl}/api/auth/csrf`, {
        credentials: "include",
        headers: { "x-eshop-portal": portal },
      });
      const csrfPayload = await readResponsePayload(csrfResponse);
      if (!csrfResponse.ok) {
        const retryAfter =
          csrfResponse.status === 429
            ? getRetryAfterSeconds(csrfResponse)
            : undefined;
        const message =
          csrfPayload?.error?.message ||
          csrfPayload?.message ||
          "Unable to start a secure request.";
        const csrfError = new Error(
          retryAfter === undefined
            ? message
            : `${message} ${retryGuidance(retryAfter)}`,
        );
        csrfError.status = csrfResponse.status;
        csrfError.code = csrfPayload?.error?.code;
        if (retryAfter !== undefined) csrfError.retryAfter = retryAfter;
        throw csrfError;
      }
      if (!csrfPayload?.csrfToken) {
        throw new Error("Unable to start a secure request.");
      }
      headers["x-csrf-token"] = csrfPayload.csrfToken;
    }
    headers["x-eshop-portal"] = portal;
    if (body !== undefined && !isFormData)
      headers["Content-Type"] = "application/json";

    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: normalizedMethod,
      credentials: "include",
      headers,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
      signal,
    });

    const payload = await readResponsePayload(response);
    if (response.status === 204) return null;

    if (!response.ok) {
      const retryAfter = getRetryAfterSeconds(response);
      let message;
      if (response.status === 429) {
        message =
          payload?.error?.message ||
          payload?.message ||
          "Too many requests. Please try again later.";
      } else {
        message =
          payload?.error?.message ||
          payload?.message ||
          (response.status >= 500
            ? "An unexpected server error occurred."
            : "The request could not be completed.");
      }

      const error = new Error(
        response.status === 429 && retryAfter !== undefined
          ? `${message} ${retryGuidance(retryAfter)}`
          : message,
      );
      error.status = response.status;
      error.code = payload?.error?.code;
      error.details = payload?.error?.details || [];
      if (retryAfter !== undefined) error.retryAfter = retryAfter;
      if (
        response.status === 401 &&
        path !== "/api/auth/login" &&
        path !== "/api/auth/me"
      ) {
        window.dispatchEvent(
          new CustomEvent("eshop:session-invalid", { detail: { portal } }),
        );
      }
      throw error;
    }

    return payload;
  })();

  if (requestKey) {
    inFlightRequests.set(requestKey, requestPromise);
    requestPromise.then(
      () => inFlightRequests.delete(requestKey),
      () => inFlightRequests.delete(requestKey),
    );
  }

  return requestPromise;
}
