import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test, { after, before } from "node:test";

const frontendDirectory = process.cwd();
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let previewPort;
let preview;
let chrome;
let profileDirectory;
let cdp;
let nextCommandId = 0;
const pendingCommands = new Map();
const apiRequestCounts = new Map();
let mockedSessionResponse = {
  status: 401,
  body: { error: { code: "AUTHENTICATION_REQUIRED", message: "Please sign in." } }
};
let mockedLoginResponse = {
  status: 401,
  body: { error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials or account not activated." } }
};
const mockCatalogProducts = [
  {
    id: "c90780ee-a8a8-4ed1-8a35-45e8f39e6501",
    name: "Classic Cotton Shirt",
    description: "Cotton shirt for browser testing.",
    status: "ACTIVE",
    category: { id: "16acb735-46b4-437a-8a9e-07f455ee5901", name: "Clothing", parentId: null },
    brand: { id: "63d0943a-09a4-4a43-92d4-946e15138f01", name: "Demo Brand" },
    shop: { id: "0451c204-7e6c-4c65-870b-e17e2f5ee501", name: "Demo Shop", status: "ACTIVE" },
    images: [],
    variants: [{ id: "ba9e5d38-7c5c-4eb6-bd5a-836a2f6d5f01", price: 799, discountPrice: null, stock: 4 }]
  },
  {
    id: "a28459de-4af6-4d05-81b5-48a5db49a502",
    name: "Leather Wallet",
    description: "Wallet for browser testing.",
    status: "ACTIVE",
    category: { id: "16acb735-46b4-437a-8a9e-07f455ee5901", name: "Clothing", parentId: null },
    brand: { id: "63d0943a-09a4-4a43-92d4-946e15138f01", name: "Demo Brand" },
    shop: { id: "0451c204-7e6c-4c65-870b-e17e2f5ee501", name: "Demo Shop", status: "ACTIVE" },
    images: [],
    variants: [{ id: "91bc1f2c-4d25-4988-9100-4b2dcfa1df02", price: 499, discountPrice: null, stock: 2 }]
  }
];

function mockedCatalogResponse(url) {
  const parsedUrl = new URL(url);
  const productMatch = parsedUrl.pathname.match(/\/products\/([^/]+)$/);
  if (productMatch) {
    const product = mockCatalogProducts.find(({ id }) => id === productMatch[1]);
    return product ? { product } : { error: { code: "NOT_FOUND", message: "Product not found." } };
  }
  if (parsedUrl.pathname.endsWith("/categories")) {
    return { items: [
      { id: "16acb735-46b4-437a-8a9e-07f455ee5901", name: "Clothing", parentId: null },
      { id: "c2fc3df4-9155-44bc-838b-ddaf509d5902", name: "Shirts", parentId: "16acb735-46b4-437a-8a9e-07f455ee5901" }
    ] };
  }
  if (parsedUrl.pathname.endsWith("/brands")) {
    return { items: [{ id: "63d0943a-09a4-4a43-92d4-946e15138f01", name: "Demo Brand" }] };
  }
  if (parsedUrl.pathname.endsWith("/shops")) {
    return { items: [{ id: "0451c204-7e6c-4c65-870b-e17e2f5ee501", code: "DEMO-SHOP", name: "Demo Shop" }], page: 1, limit: 24, total: 1, pages: 1 };
  }
  const query = (parsedUrl.searchParams.get("q") || "").toLowerCase();
  const categoryId = parsedUrl.searchParams.get("categoryId");
  const subcategoryId = parsedUrl.searchParams.get("subcategoryId");
  const brandId = parsedUrl.searchParams.get("brandId");
  const shopId = parsedUrl.searchParams.get("shopId");
  let products = mockCatalogProducts.filter((product) =>
    (!query || `${product.name} ${product.description} ${product.shop.name} ${product.brand.name}`.toLowerCase().includes(query)) &&
    (!categoryId || product.category.id === categoryId || categoryId === "16acb735-46b4-437a-8a9e-07f455ee5901") &&
    (!subcategoryId || subcategoryId === "c2fc3df4-9155-44bc-838b-ddaf509d5902") &&
    (!brandId || product.brand.id === brandId) &&
    (!shopId || product.shop.id === shopId)
  );
  const sort = parsedUrl.searchParams.get("sort");
  if (sort === "name_asc") products = [...products].sort((left, right) => left.name.localeCompare(right.name));
  if (sort === "name_desc") products = [...products].sort((left, right) => right.name.localeCompare(left.name));
  if (sort === "price_asc") products = [...products].sort((left, right) => left.variants[0].price - right.variants[0].price);
  if (sort === "price_desc") products = [...products].sort((left, right) => right.variants[0].price - left.variants[0].price);
  const page = Number(parsedUrl.searchParams.get("page") || 1);
  const limit = Number(parsedUrl.searchParams.get("limit") || 24);
  return {
    items: products.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: products.length,
    pages: Math.ceil(products.length / limit)
  };
}

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitFor(check, description, timeoutMs = 15_000) {
  const expiresAt = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < expiresAt) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

function command(method, params = {}) {
  const id = ++nextCommandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error(`Chrome DevTools command timed out: ${method}`));
    }, 10_000);
    pendingCommands.set(id, { resolve, reject, timer });
    cdp.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Browser evaluation failed.");
  }
  return response.result?.value;
}

async function navigate(route) {
  await command("Page.navigate", { url: `http://127.0.0.1:${previewPort}${route}` });
  await waitFor(async () => evaluate("document.readyState === 'complete'"), `page load for ${route}`);
  await waitFor(async () => evaluate("document.querySelector('#root')?.children.length > 0"), `React render for ${route}`);
}

before(async () => {
  previewPort = await availablePort();
  preview = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js", "preview", "--configLoader", "runner",
    "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"
  ], { cwd: frontendDirectory, stdio: "ignore", windowsHide: true });
  await waitFor(async () => {
    if (preview.exitCode !== null) throw new Error(`Vite preview exited with ${preview.exitCode}`);
    const response = await fetch(`http://127.0.0.1:${previewPort}/`);
    return response.ok;
  }, "Vite preview server");

  profileDirectory = await mkdtemp(path.join(os.tmpdir(), "eshop-browser-test-"));
  const debugPort = await availablePort();
  chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--disable-extensions", "--disable-background-networking",
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDirectory}`, "about:blank"
  ], { stdio: "ignore", windowsHide: true });
  const target = await waitFor(async () => {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with ${chrome.exitCode}`);
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) return null;
    const targets = await response.json();
    return targets.find(({ type }) => type === "page");
  }, "Chrome DevTools endpoint");

  cdp = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    cdp.addEventListener("open", resolve, { once: true });
    cdp.addEventListener("error", reject, { once: true });
  });
  cdp.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Fetch.requestPaused") {
      const { method } = message.params.request;
      const isPreflight = method === "OPTIONS";
      const requestUrl = message.params.request.url;
      const requestPath = new URL(requestUrl).pathname;
      const requestKey = `${method} ${requestPath}`;
      apiRequestCounts.set(requestKey, (apiRequestCounts.get(requestKey) || 0) + 1);
      const isCatalogRequest = requestUrl.startsWith("http://localhost:4000/api/catalog/");
      const response = isCatalogRequest
        ? { status: 200, body: mockedCatalogResponse(requestUrl) }
        : requestPath === "/api/auth/csrf"
          ? { status: 200, body: { csrfToken: "browser-test-csrf-token" } }
          : requestPath === "/api/auth/login"
            ? mockedLoginResponse
            : mockedSessionResponse;
      const body = isPreflight ? "" : Buffer.from(JSON.stringify(response.body)).toString("base64");
      const responseHeaders = [
        { name: "content-type", value: "application/json" },
        { name: "access-control-allow-origin", value: `http://127.0.0.1:${previewPort}` },
        { name: "access-control-allow-credentials", value: "true" },
        { name: "access-control-allow-methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
        { name: "access-control-allow-headers", value: "content-type, x-csrf-token, x-eshop-portal" },
        { name: "access-control-expose-headers", value: "Retry-After" }
      ];
      if (requestPath === "/api/auth/login" && response.status === 429) {
        responseHeaders.push({ name: "retry-after", value: "120" });
      }
      cdp.send(JSON.stringify({
        id: ++nextCommandId,
        method: "Fetch.fulfillRequest",
        params: {
          requestId: message.params.requestId,
          responseCode: isPreflight ? 204 : response.status,
          responseHeaders,
          body
        }
      }));
      return;
    }
    const pending = pendingCommands.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingCommands.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result || {});
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
  await command("Network.enable");
  await command("Fetch.enable", { patterns: [
    { urlPattern: "http://localhost:4000/api/auth/me*", requestStage: "Request" },
    { urlPattern: "http://localhost:4000/api/auth/csrf*", requestStage: "Request" },
    { urlPattern: "http://localhost:4000/api/auth/login*", requestStage: "Request" },
    { urlPattern: "http://localhost:4000/api/catalog/*", requestStage: "Request" }
  ] });
});

after(async () => {
  if (cdp?.readyState === WebSocket.OPEN) {
    try { await command("Browser.close"); } catch {}
    cdp.close();
  }
  if (chrome && chrome.exitCode === null) {
    try { await Promise.race([once(chrome, "exit"), delay(3000)]); } catch {}
    if (chrome.exitCode === null) chrome.kill();
  }
  preview?.kill();
  for (const pending of pendingCommands.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Browser test finished."));
  }
  pendingCommands.clear();
  if (profileDirectory) {
    try { await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
});

test("customer storefront, Admin and Owner login routes render in Chromium", async () => {
  apiRequestCounts.clear();
  await navigate("/");
  await waitFor(async () => /Shop your/i.test(await evaluate("document.body.innerText")), "customer catalog heading");
  assert.equal(await evaluate("Boolean(document.querySelector('.vite-error-overlay'))"), false);
  assert.equal(await evaluate("document.querySelectorAll('.catalog-toolbar select').length"), 5);
  assert.equal(await evaluate("Boolean(document.querySelector('.store-nav-links'))"), true);
  await waitFor(async () => evaluate("document.querySelectorAll('.store-product-card').length === 2"), "catalog product cards");
  assert.equal(apiRequestCounts.get("GET /api/catalog/categories"), 1);
  assert.equal(apiRequestCounts.get("GET /api/catalog/brands"), 1);
  assert.equal(apiRequestCounts.get("GET /api/catalog/shops"), 1);
  assert.equal(apiRequestCounts.get("GET /api/catalog/products"), 1);
  await evaluate(`(() => {
    const input = document.querySelector('.market-search input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'cotton');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.market-search button').click();
  })()`);
  await waitFor(async () => evaluate("new URLSearchParams(location.search).get('q') === 'cotton'"), "customer catalog search URL");
  await waitFor(async () => evaluate("document.querySelector('.catalog-result-line')?.textContent.includes('1 product')"), "filtered catalog search results");
  assert.equal(await evaluate("document.querySelector('.store-product-card .store-product-name')?.textContent"), "Classic Cotton Shirt");
  assert.equal(apiRequestCounts.get("GET /api/catalog/products"), 2);
  assert.equal(apiRequestCounts.get("GET /api/catalog/categories"), 1);
  assert.equal(apiRequestCounts.get("GET /api/catalog/brands"), 1);
  assert.equal(apiRequestCounts.get("GET /api/catalog/shops"), 1);
  await navigate("/categories");
  await waitFor(async () => /BROWSE BY CATEGORY/.test(await evaluate("document.body.innerText")), "Customer Categories route");
  assert.equal(await evaluate("document.querySelectorAll('.category-card').length"), 1);
  assert.equal(await evaluate("Boolean(document.querySelector('.store-nav-links'))"), true);
  await navigate("/shops");
  await waitFor(async () => evaluate("document.querySelectorAll('.shop-directory-card').length === 1"), "Customer Shops route");
  assert.equal(await evaluate("document.querySelector('.shop-directory-card h3')?.textContent"), "Demo Shop");
  assert.match(await evaluate("document.querySelector('.shop-directory-card a')?.getAttribute('href')"), /^\/\?shopId=/);
  await navigate("/admin/login");
  await waitFor(async () => /Platform sign in/.test(await evaluate("document.body.innerText")), "Admin login screen");
  assert.equal(await evaluate("document.querySelector('form')?.checkValidity()"), false);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await navigate("/shop/login");
  await waitFor(async () => /SHOP OWNER ACCESS|Welcome back/.test(await evaluate("document.body.innerText")), "Owner login screen");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await command("Emulation.setDeviceMetricsOverride", { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
});

test("protected Admin and Owner deep links redirect to their login route", async () => {
  for (const [route, login, label] of [
    ["/admin/dashboard", "/admin/login", "Admin dashboard"],
    ["/admin/shops", "/admin/login", "Admin CRUD"],
    ["/admin/data-requests", "/admin/login", "Admin approvals"],
    ["/shop/products", "/shop/login", "Owner products"],
    ["/shop/employees", "/shop/login", "Owner employees"],
    ["/shop/orders", "/shop/login", "Owner orders"]
  ]) {
    await navigate(route);
    await waitFor(async () => (await evaluate("location.pathname")) === login, `${label} login redirect`);
  }
});

test("focused portal refresh replaces stale user state after a shared-session identity change", async () => {
  mockedSessionResponse = {
    status: 200,
    body: { user: { id: "admin-a", role: "SUPER_ADMIN", name: "Admin One", email: "admin@example.test" } }
  };
  await navigate("/admin/dashboard");
  await waitFor(async () => evaluate("document.querySelector('.topbar-user')?.textContent === 'Admin One'"), "first Admin identity");
  await delay(350);

  mockedSessionResponse = {
    status: 200,
    body: { user: { id: "admin-b", role: "SUPER_ADMIN", name: "Admin Two", email: "admin-two@example.test" } }
  };
  const requestCountBeforeFocus = apiRequestCounts.get("GET /api/auth/me") || 0;
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await delay(250);
  const requestCountAfterFocus = apiRequestCounts.get("GET /api/auth/me") || 0;
  assert.ok(
    requestCountAfterFocus > requestCountBeforeFocus,
    `focus should request /me (before ${requestCountBeforeFocus}, after ${requestCountAfterFocus}, visibility ${await evaluate("document.visibilityState")})`
  );
  await waitFor(async () => evaluate("document.querySelector('.topbar-user')?.textContent === 'Admin Two'"), "updated same-role identity");
  await delay(100);

  mockedSessionResponse = {
    status: 200,
    body: { user: { id: "owner-a", role: "SHOP_OWNER", name: "Shop Owner", email: "owner@example.test" } }
  };
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor(async () => (await evaluate("location.pathname")) === "/admin/login", "role-correct Admin login redirect");
  assert.doesNotMatch(await evaluate("document.body.innerText"), /Admin Two/);
  mockedSessionResponse = {
    status: 401,
    body: { error: { code: "AUTHENTICATION_REQUIRED", message: "Please sign in." } }
  };
});

test("StrictMode startup and simultaneous lifecycle events coalesce customer session refreshes", async () => {
  apiRequestCounts.clear();
  await navigate("/");
  await waitFor(async () => apiRequestCounts.get("GET /api/auth/me") === 1, "initial Customer session refresh");
  await delay(1050);
  assert.equal(apiRequestCounts.get("GET /api/auth/me"), 1, "StrictMode startup sends one /me request");

  await evaluate(`(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await waitFor(async () => apiRequestCounts.get("GET /api/auth/me") === 2, "one coalesced lifecycle refresh");
  await delay(250);
  assert.equal(apiRequestCounts.get("GET /api/auth/me"), 2, "lifecycle events do not create a refresh loop");
});

test("login forms validate required fields and remain usable at desktop and mobile widths", async () => {
  for (const route of ["/admin/login", "/shop/login"]) {
    await navigate(route);
    await evaluate(`(() => [...document.querySelectorAll('button')].find((item) => /secure sign in|sign in/i.test(item.innerText))?.click())()`);
    await waitFor(async () => evaluate("Boolean(document.querySelector('[role=dialog] form'))"), `${route} sign-in form`);
    assert.equal(await evaluate("document.querySelector('[role=dialog] form')?.checkValidity()"), false);
    await evaluate("document.querySelector('form input[type=email]') && (document.querySelector('form input[type=email]').value='not-an-email')");
    assert.equal(await evaluate("document.querySelector('form')?.checkValidity()"), false);
    for (const [width, height, mobile] of [[1440, 900, false], [390, 844, true]]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, `${route} at ${width}px`);
    }
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
});

test("customer sign-in dialog opens and closes, and browser history returns to the prior route", async () => {
  await navigate("/");
  await waitFor(async () => evaluate("Boolean([...document.querySelectorAll('button')].find((item) => /^sign in$/i.test(item.innerText.trim())))"), "customer sign-in button");
  await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((item) => /^sign in$/i.test(item.innerText.trim())); button?.click(); return Boolean(button); })()`);
  await waitFor(async () => evaluate("Boolean(document.querySelector('[role=dialog]'))"), "customer sign-in dialog");
  assert.equal(await evaluate("document.querySelector('[role=dialog] form')?.checkValidity()"), false);
  await evaluate("document.querySelector('[role=dialog] button[aria-label*=Close]')?.click()");
  await waitFor(async () => !await evaluate("Boolean(document.querySelector('[role=dialog]'))"), "dialog close");
  await navigate("/wishlist");
  await evaluate("history.back()");
  await waitFor(async () => (await evaluate("location.pathname")) === "/", "browser back navigation");
  await evaluate("history.forward()");
  await waitFor(async () => (await evaluate("location.pathname")) === "/wishlist", "browser forward navigation");
});

test("one customer login submission sends one request and displays Retry-After guidance", async () => {
  apiRequestCounts.clear();
  mockedLoginResponse = {
    status: 429,
    body: { error: { code: "TOO_MANY_LOGIN_ATTEMPTS", message: "Too many login attempts. Please try again later." } }
  };
  await navigate("/");
  await waitFor(async () => evaluate("Boolean([...document.querySelectorAll('button')].find((item) => /^sign in$/i.test(item.innerText.trim())))"), "Customer Sign in trigger");
  await evaluate(`(() => [...document.querySelectorAll('button')].find((item) => /^sign in$/i.test(item.innerText.trim()))?.click())()`);
  await waitFor(async () => evaluate("Boolean(document.querySelector('.customer-auth-backdrop form'))"), "Customer sign-in form");
  await evaluate(`(() => {
    const setValue = (input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setValue(document.querySelector('#customer-email'), 'browser-test@example.test');
    setValue(document.querySelector('#customer-password'), 'not-a-real-password');
    document.querySelector('.customer-auth-backdrop form button[type=submit]').click();
  })()`);
  await waitFor(async () => evaluate("document.querySelector('.customer-auth-backdrop [role=alert]')?.textContent.includes('2 minutes')"), "server retry guidance");
  assert.equal(await evaluate("document.querySelector('.customer-auth-backdrop form button[type=submit]')?.disabled"), true);
  await evaluate("document.querySelector('.customer-auth-backdrop form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))");
  await delay(250);
  assert.equal(apiRequestCounts.get("POST /api/auth/login"), 1);
  assert.equal(apiRequestCounts.get("GET /api/auth/csrf"), 1);
  assert.match(await evaluate("document.querySelector('.customer-auth-backdrop [role=alert]')?.textContent"), /Too many login attempts.*2 minutes/);
  assert.doesNotMatch(await evaluate("document.querySelector('.customer-auth-backdrop [role=alert]')?.textContent"), /incorrect password|invalid credentials/i);
  mockedLoginResponse = {
    status: 401,
    body: { error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials or account not activated." } }
  };
});

test("Shop Owner and Super Admin login forms also honor Retry-After without duplicate submits", async () => {
  mockedLoginResponse = {
    status: 429,
    body: { error: { code: "TOO_MANY_LOGIN_ATTEMPTS", message: "Too many login attempts. Please try again later." } }
  };
  for (const portal of [
    { route: "/shop/login", email: "#owner-email", password: "#owner-password", trigger: /owner sign in/i },
    { route: "/admin/login", email: "#admin-email", password: "#admin-password", trigger: /secure sign in/i }
  ]) {
    apiRequestCounts.clear();
    await navigate(portal.route);
    await evaluate(`(() => [...document.querySelectorAll('button')].find((item) => ${portal.trigger}.test(item.innerText.trim()))?.click())()`);
    await waitFor(async () => evaluate("Boolean(document.querySelector('[role=dialog] form'))"), `${portal.route} login form`);
    await evaluate(`(() => {
      const setValue = (input, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setValue(document.querySelector('${portal.email}'), 'browser-test@example.test');
      setValue(document.querySelector('${portal.password}'), 'not-a-real-password');
      document.querySelector('[role=dialog] form button:not([type=button])').click();
    })()`);
    await waitFor(async () => evaluate("document.querySelector('[role=dialog] [role=alert]')?.textContent.includes('2 minutes')"), `${portal.route} Retry-After guidance`);
    assert.equal(await evaluate("document.querySelector('[role=dialog] form button:not([type=button])')?.disabled"), true);
    await evaluate("document.querySelector('[role=dialog] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))");
    await delay(150);
    assert.equal(apiRequestCounts.get("POST /api/auth/login"), 1, `${portal.route} only submits once while blocked`);
  }
  mockedLoginResponse = {
    status: 401,
    body: { error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials or account not activated." } }
  };
});

test("customer sign-in modal covers sticky navigation, fits each viewport, and manages keyboard focus", async () => {
  for (const [width, height, mobile] of [[1440, 900, false], [1024, 768, false], [768, 900, false], [390, 844, true]]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await navigate("/");
    await waitFor(async () => evaluate("Boolean([...document.querySelectorAll('button')].find((item) => /^sign in$/i.test(item.innerText.trim())))"), "Customer Sign in trigger");
    await evaluate(`(() => {
      const trigger = [...document.querySelectorAll('button')].find((item) => /^sign in$/i.test(item.innerText.trim()));
      trigger.focus();
      trigger.click();
      return document.activeElement === trigger;
    })()`);
    await waitFor(async () => evaluate("Boolean(document.querySelector('.customer-auth-backdrop [role=dialog]'))"), "Customer login modal");

    const geometry = await evaluate(`(() => {
      const backdrop = document.querySelector('.customer-auth-backdrop');
      const dialog = backdrop.querySelector('[role=dialog]');
      const header = document.querySelector('.portal-nav');
      const nav = document.querySelector('.store-nav-links');
      const rect = (element) => {
        const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
        backdrop: rect(backdrop),
        backdropPosition: getComputedStyle(backdrop).position,
        backdropZ: Number(getComputedStyle(backdrop).zIndex),
        dialog: rect(dialog),
        dialogPosition: getComputedStyle(dialog).position,
        dialogZ: Number(getComputedStyle(dialog).zIndex),
        dialogOverflow: getComputedStyle(dialog).overflowY,
        header: rect(header),
        headerZ: Number(getComputedStyle(header).zIndex),
        nav: rect(nav),
        navZ: Number(getComputedStyle(nav).zIndex),
        portalParent: backdrop.parentElement === document.body
      };
    })()`);
    assert.equal(geometry.backdropPosition, "fixed", `fixed backdrop at ${width}px`);
    assert.equal(geometry.portalParent, true, `Customer modal portal at ${width}px`);
    assert.ok(geometry.backdropZ > geometry.headerZ && geometry.backdropZ > geometry.navZ, `backdrop above sticky chrome at ${width}px`);
    assert.ok(geometry.dialog.top >= 0 && geometry.dialog.bottom <= height, `dialog fits visible viewport at ${width}px`);
    assert.ok(Math.abs((geometry.dialog.top + geometry.dialog.bottom) / 2 - height / 2) <= 2, `dialog vertically centered at ${width}px`);
    assert.ok(geometry.dialog.left >= 0 && geometry.dialog.right <= width, `dialog horizontally centered in viewport at ${width}px`);
    assert.ok(geometry.viewport.scrollWidth <= width, `no page horizontal overflow at ${width}px`);
    assert.ok(geometry.dialogOverflow === "auto" || geometry.dialogOverflow === "scroll", `dialog content is scrollable at ${width}px`);
    await waitFor(async () => evaluate("document.activeElement?.id === 'customer-email'"), `initial focus moves into modal at ${width}px`);
    assert.equal(await evaluate("document.activeElement?.id"), "customer-email", `initial focus moves into modal at ${width}px`);

    await evaluate(`(() => {
      const dialog = document.querySelector('.customer-auth-backdrop [role=dialog]');
      const last = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')].at(-1);
      const first = dialog.querySelector('a[href], button:not([disabled]), input:not([disabled])');
      last.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      return document.activeElement === first;
    })()`);
    assert.equal(await evaluate("document.activeElement?.closest('[role=dialog]') !== null"), true, `Tab stays within modal at ${width}px`);
    assert.equal(await evaluate("document.activeElement?.textContent.trim()"), "Customer", `Tab wraps to first modal control at ${width}px`);
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
    await waitFor(async () => !await evaluate("Boolean(document.querySelector('.customer-auth-backdrop'))"), `Escape closes modal at ${width}px`);
    assert.equal(await evaluate("document.activeElement?.innerText.trim()"), "Sign in", `focus returns to trigger at ${width}px`);
    assert.equal(await evaluate("document.body.style.overflow"), "", `page scrolling restored at ${width}px`);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
});

test("nested route refresh works and customer layout fits a mobile viewport", async () => {
  await navigate("/products/not-a-real-id");
  await command("Page.reload", { ignoreCache: true });
  await waitFor(async () => evaluate("document.readyState === 'complete'"), "nested route reload");
  const refreshedResponse = await fetch(`http://127.0.0.1:${previewPort}/products/not-a-real-id`);
  assert.equal(refreshedResponse.status, 200);
  assert.match(await refreshedResponse.text(), /id="root"/);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await waitFor(async () => evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile page without horizontal overflow");
});

test("customer marketplace category navigation, product details and responsive layouts work", async () => {
  await navigate("/categories");
  await waitFor(async () => evaluate("document.querySelectorAll('.category-card').length === 1"), "loaded category cards");
  const categoryHref = await evaluate("document.querySelector('.category-parent-link')?.getAttribute('href')");
  assert.match(categoryHref, /^\/\?categoryId=/);
  const subcategoryHref = await evaluate("document.querySelector('.category-subcategories a')?.getAttribute('href')");
  assert.match(subcategoryHref, /^\/\?categoryId=[^&]+&subcategoryId=/);
  await evaluate("document.querySelector('.category-subcategories a')?.click()");
  await waitFor(async () => new URLSearchParams(await evaluate("location.search")).has("subcategoryId"), "category subcategory link");
  await navigate("/categories");
  await waitFor(async () => evaluate("Boolean(document.querySelector('.category-parent-link'))"), "category route after direct subcategory");
  await evaluate("document.querySelector('.category-parent-link')?.click()");
  await waitFor(async () => (await evaluate("location.pathname")) === "/", "category product listing");
  await waitFor(async () => evaluate("document.querySelector('.catalog-toolbar select')?.value === new URLSearchParams(location.search).get('categoryId')"), "selected category filter");

  const subcategoryId = "c2fc3df4-9155-44bc-838b-ddaf509d5902";
  await evaluate(`(() => {
    const select = document.querySelectorAll('.catalog-toolbar select')[1];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, '${subcategoryId}');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(async () => new URLSearchParams(await evaluate("location.search")).get("subcategoryId") === subcategoryId, "subcategory filter URL");
  await command("Page.reload", { ignoreCache: true });
  await waitFor(async () => evaluate("document.querySelectorAll('.catalog-toolbar select')[1]?.value === new URLSearchParams(location.search).get('subcategoryId')"), "subcategory filter after refresh");
  await evaluate("history.back()");
  await waitFor(async () => !new URLSearchParams(await evaluate("location.search")).has("subcategoryId"), "category browser back");
  await evaluate("history.forward()");
  await waitFor(async () => new URLSearchParams(await evaluate("location.search")).get("subcategoryId") === subcategoryId, "subcategory browser forward");

  await navigate("/");
  await waitFor(async () => evaluate("document.querySelectorAll('.store-product-card').length === 2"), "customer product cards");
  assert.equal(await evaluate("Boolean(document.querySelector('.hero-art'))"), true);
  assert.equal(await evaluate("Boolean(document.querySelector('.hero-art img'))"), false);
  assert.equal(await evaluate("Boolean(document.querySelector('.hero-storefront'))"), true);
  assert.equal(await evaluate("document.querySelector('.hero-cta')?.textContent.trim().startsWith('Shop now')"), true);
  assert.equal(await evaluate("document.querySelectorAll('.store-product-card').length"), 2, "do not duplicate live products");
  assert.equal(await evaluate("document.querySelectorAll('.store-product-card .store-product-image').length"), 2);
  assert.equal(await evaluate("document.querySelectorAll('.store-product-card .favourite-button').length"), 2);
  assert.equal(await evaluate("document.querySelectorAll('.store-product-card .store-product-info .btn').length"), 2);
  assert.equal(await evaluate("Boolean(document.querySelector('.market-footer a[href=\"/categories\"]'))"), true);
  assert.equal(await evaluate("Boolean(document.querySelector('.market-footer a[href=\"/shops\"]'))"), true);

  await evaluate("document.querySelector('.store-product-card .favourite-button')?.click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('[role=dialog]'))"), "favourite prompts for customer sign-in");
  await evaluate("document.querySelector('[role=dialog] button[aria-label*=Close]')?.click()");
  await evaluate("document.querySelector('.store-product-card .store-product-info .btn')?.click()");
  await waitFor(async () => evaluate("Boolean(document.querySelector('[role=dialog]'))"), "Add to Cart prompts for customer sign-in");
  await evaluate("document.querySelector('[role=dialog] button[aria-label*=Close]')?.click()");

  for (const [width, height, mobile] of [[1440, 900, false], [1024, 900, false], [768, 900, false], [390, 844, true]]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    const layout = await evaluate(`(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heroHeight: document.querySelector('.store-hero')?.getBoundingClientRect().height,
      firstCardTop: document.querySelector('.store-product-card')?.getBoundingClientRect().top,
      gridColumns: getComputedStyle(document.querySelector('.store-product-grid')).gridTemplateColumns.split(' ').length,
      imageHeight: document.querySelector('.store-product-image')?.getBoundingClientRect().height,
      navPosition: getComputedStyle(document.querySelector('.portal-nav')).position,
      linksPosition: getComputedStyle(document.querySelector('.store-nav-links')).position
    }))()`);
    assert.ok(layout.scrollWidth <= layout.width, `no horizontal overflow at ${width}px`);
    assert.ok(layout.heroHeight <= 300, `compact hero at ${width}px`);
    assert.ok(layout.firstCardTop < height, `product cards begin in the initial viewport at ${width}px`);
    assert.ok(layout.imageHeight <= 300, `reasonable product image height at ${width}px`);
    assert.ok(layout.gridColumns >= (width > 1024 ? 4 : width > 480 ? 2 : 2), `responsive product columns at ${width}px`);
    assert.equal(layout.navPosition, "sticky", `sticky header at ${width}px`);
    if (width > 390) assert.equal(layout.linksPosition, "sticky", `sticky customer navigation at ${width}px`);
  }

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('.store-product-name')?.click()");
  await waitFor(async () => /^\/products\//.test(await evaluate("location.pathname")), "product details route");
  await waitFor(async () => evaluate("document.querySelector('.detail-copy h1')?.textContent === 'Classic Cotton Shirt'"), "realistic product details content");
  assert.equal(await evaluate("Boolean(document.querySelector('.vite-error-overlay'))"), false);
});

test("customer error/loading states remain visible when API requests fail", async () => {
  await command("Network.setBlockedURLs", { urls: ["http://localhost:4000/api/*"] });
  await navigate("/");
  await waitFor(async () => /unavailable|failed to fetch/i.test(await evaluate("document.body.innerText")), "catalog API error state");
  assert.ok(await evaluate("document.querySelector('#root')?.children.length > 0"));
  await command("Network.setBlockedURLs", { urls: [] });
});
