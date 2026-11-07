import rateLimit from "express-rate-limit";

const API_WINDOW_MS = 15 * 60 * 1000;
const API_LIMIT = 300;

function createLimiter({ windowMs, limit, handler, skip }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    ...(handler ? { handler } : {}),
    ...(skip ? { skip } : {})
  });
}

export function createApiRateLimiters({
  windowMs = API_WINDOW_MS,
  apiLimit = API_LIMIT,
  authLimit = API_LIMIT
} = {}) {
  return {
    apiLimiter: createLimiter({
      windowMs,
      limit: apiLimit,
      skip: (request) => request.path === "/auth" || request.path.startsWith("/auth/")
    }),
    authApiLimiter: createLimiter({
      windowMs,
      limit: authLimit
    })
  };
}

export function createLoginRateLimiter({ windowMs = API_WINDOW_MS, limit = 10 } = {}) {
  return createLimiter({
    windowMs,
    limit,
    handler: (request, response, _next, options) => {
      response.status(options?.statusCode || 429).json({
        error: {
          code: "TOO_MANY_LOGIN_ATTEMPTS",
          message: "Too many login attempts. Please try again later."
        }
      });
    }
  });
}
