const FIXTURE_HOST = "10.0.2.2";
const LOOPBACK_HOST = "127.0.0.1";
const FIXTURE_PORTS = new Set(["8765", "8766"]);
const MAX_TIMEOUT_MS = 30_000;
const REQUEST_HEADERS_TO_DROP = new Set([
  "connection", "content-length", "cookie", "host", "proxy-authorization", "transfer-encoding",
]);
const RESPONSE_HEADERS_TO_DROP = new Set(["content-encoding", "content-length", "set-cookie", "transfer-encoding"]);

function fixtureUrl(rawUrl) {
  try {
    // URL canonicalization accepts numeric aliases for IPv4; require the literal fixture origin.
    if (!/^http:\/\/10\.0\.2\.2:(?:8765|8766)(?:[/?#]|$)/.test(rawUrl)) return null;
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" || url.hostname !== FIXTURE_HOST || !FIXTURE_PORTS.has(url.port) || url.username || url.password) return null;
    url.hostname = LOOPBACK_HOST;
    return url;
  } catch {
    return null;
  }
}

function forwardedRequestHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !REQUEST_HEADERS_TO_DROP.has(name.toLowerCase())));
}

function fulfilledResponseHeaders(headers) {
  return Object.fromEntries([...headers].filter(([name]) => !RESPONSE_HEADERS_TO_DROP.has(name.toLowerCase())));
}

/** Install an opt-in local-fixture proxy for an Android WebView test page. */
export async function installAndroidFixtureTransport(page, {
  mode = process.env.TESTLAB_ANDROID_TRANSPORT ?? "direct",
  fetchImpl = globalThis.fetch,
  timeoutMs = MAX_TIMEOUT_MS,
} = {}) {
  if (mode !== "direct" && mode !== "host-proxy") throw new Error("TESTLAB_ANDROID_TRANSPORT must be direct or host-proxy");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw new Error("Fixture transport timeout must be 1..30000 ms");

  let offline = false;
  const control = {
    hostProxy: mode === "host-proxy",
    setOffline(value) {
      if (typeof value !== "boolean") throw new TypeError("Fixture transport offline state must be boolean");
      offline = value;
    },
  };
  if (!control.hostProxy) return control;

  await page.route("**/*", async (route) => {
    const request = route.request();
    const target = fixtureUrl(request.url());
    if (!target) {
      await route.fallback();
      return;
    }
    if (offline) {
      await route.abort("internetdisconnected").catch(() => {});
      return;
    }

    const controller = new AbortController();
    let timer;
    try {
      const method = request.method();
      let body = method === "GET" || method === "HEAD" ? undefined : request.postDataBuffer() ?? undefined;
      const work = async () => {
        const response = await fetchImpl(target, {
          method,
          headers: forwardedRequestHeaders(request.headers()),
          body,
          redirect: "manual",
          signal: controller.signal,
        });
        body = undefined;
        return {
          status: response.status,
          headers: fulfilledResponseHeaders(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        };
      };
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Fixture transport timed out"));
        }, timeoutMs);
      });
      const response = await Promise.race([work(), deadline]);
      await route.fulfill(response);
    } catch {
      // Requests and responses can contain fixture credentials or synthetic audio.
      await route.abort("failed").catch(() => {});
    } finally {
      clearTimeout(timer);
    }
  });
  return control;
}
