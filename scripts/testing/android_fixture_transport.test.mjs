import assert from "node:assert/strict";
import test from "node:test";
import { installAndroidFixtureTransport } from "../../frontend/e2e/android-fixture-transport.mjs";

function fakePage() {
  const page = {
    registrations: [],
    async route(pattern, handler) { this.registrations.push({ pattern, handler }); },
  };
  return page;
}

function fakeRoute(url, { method = "GET", headers = {}, body = null } = {}) {
  const calls = [];
  return {
    calls,
    request() {
      return {
        url: () => url,
        method: () => method,
        headers: () => headers,
        postDataBuffer: () => body,
      };
    },
    async fallback() { calls.push({ action: "fallback" }); },
    async abort(code) { calls.push({ action: "abort", code }); },
    async fulfill(response) { calls.push({ action: "fulfill", response }); },
  };
}

test("direct transport is a no-op and still exposes the control contract", async () => {
  const page = fakePage();
  const transport = await installAndroidFixtureTransport(page, { mode: "direct", fetchImpl: () => assert.fail("unexpected fetch") });
  assert.equal(transport.hostProxy, false);
  transport.setOffline(true);
  assert.deepEqual(page.registrations, []);
  assert.throws(() => transport.setOffline("true"), TypeError);
});

test("host proxy allows only the two exact HTTP fixture endpoints", async () => {
  const page = fakePage();
  const fetched = [];
  await installAndroidFixtureTransport(page, {
    mode: "host-proxy",
    fetchImpl: async (url) => {
      fetched.push(url.href);
      return new Response("ok");
    },
  });
  assert.equal(page.registrations[0].pattern, "**/*");
  const handle = page.registrations[0].handler;
  for (const url of [
    "http://10.0.2.2:8765/api/health?x=1",
    "http://10.0.2.2:8766/auth/v1/settings",
  ]) {
    const route = fakeRoute(url);
    await handle(route);
    assert.equal(route.calls[0].action, "fulfill");
  }
  assert.deepEqual(fetched, [
    "http://127.0.0.1:8765/api/health?x=1",
    "http://127.0.0.1:8766/auth/v1/settings",
  ]);
  for (const url of [
    "https://10.0.2.2:8765/api/health",
    "http://10.0.2.2:8767/api/health",
    "http://10.0.2.3:8765/api/health",
    "http://0xa000202:8765/api/health",
    "http://user:pass@10.0.2.2:8765/api/health",
    "http://example.test/api/health",
  ]) {
    const route = fakeRoute(url);
    await handle(route);
    assert.deepEqual(route.calls, [{ action: "fallback" }]);
  }
  assert.equal(fetched.length, 2);
});

test("forwarding keeps synthetic body and auth in memory while filtering transport headers", async () => {
  const page = fakePage();
  const upload = Buffer.from([0, 1, 2, 3]);
  let forwarded;
  await installAndroidFixtureTransport(page, {
    mode: "host-proxy",
    fetchImpl: async (_url, init) => {
      forwarded = init;
      return new Response("fixture result", {
        status: 201,
        headers: {
          "access-control-allow-origin": "*",
          "content-encoding": "gzip",
          "content-length": "999",
          "content-type": "application/json",
          "set-cookie": "fixture=private",
          "transfer-encoding": "chunked",
        },
      });
    },
  });
  const route = fakeRoute("http://10.0.2.2:8765/api/transcriptions", {
    method: "POST",
    headers: {
      Authorization: "Bearer fixture-token",
      Cookie: "private=1",
      HOST: "10.0.2.2:8765",
      "Content-Length": "4",
      "Content-Type": "audio/webm",
    },
    body: upload,
  });
  await page.registrations[0].handler(route);
  assert.equal(forwarded.body, upload);
  assert.equal(forwarded.headers.Authorization, "Bearer fixture-token");
  assert.equal(forwarded.headers["Content-Type"], "audio/webm");
  assert.equal(forwarded.headers.Cookie, undefined);
  assert.equal(forwarded.headers.HOST, undefined);
  assert.equal(forwarded.headers["Content-Length"], undefined);
  assert.equal(forwarded.redirect, "manual");
  const { response } = route.calls[0];
  assert.equal(response.status, 201);
  assert.equal(response.body.toString(), "fixture result");
  assert.equal(response.headers["access-control-allow-origin"], "*");
  assert.equal(response.headers["content-type"], "application/json");
  assert.equal(response.headers["content-encoding"], undefined);
  assert.equal(response.headers["content-length"], undefined);
  assert.equal(response.headers["set-cookie"], undefined);
  assert.equal(response.headers["transfer-encoding"], undefined);
});

test("offline switch aborts only fixture requests and can be cleared", async () => {
  const page = fakePage();
  let fetchCount = 0;
  const transport = await installAndroidFixtureTransport(page, {
    mode: "host-proxy",
    fetchImpl: async () => { fetchCount += 1; return new Response("ok"); },
  });
  assert.equal(transport.hostProxy, true);
  transport.setOffline(true);
  const fixture = fakeRoute("http://10.0.2.2:8765/api/health");
  await page.registrations[0].handler(fixture);
  assert.deepEqual(fixture.calls, [{ action: "abort", code: "internetdisconnected" }]);
  const unrelated = fakeRoute("https://example.test/page");
  await page.registrations[0].handler(unrelated);
  assert.deepEqual(unrelated.calls, [{ action: "fallback" }]);
  assert.equal(fetchCount, 0);
  transport.setOffline(false);
  await page.registrations[0].handler(fakeRoute("http://10.0.2.2:8765/api/health"));
  assert.equal(fetchCount, 1);
});

test("slow or failed fixture requests abort safely within the configured deadline", async () => {
  const page = fakePage();
  let observedAbort = false;
  await installAndroidFixtureTransport(page, {
    mode: "host-proxy",
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { observedAbort = true; reject(new Error("synthetic failure")); });
    }),
  });
  const route = fakeRoute("http://10.0.2.2:8765/api/health");
  await page.registrations[0].handler(route);
  assert.equal(observedAbort, true);
  assert.deepEqual(route.calls, [{ action: "abort", code: "failed" }]);
  await assert.rejects(installAndroidFixtureTransport(page, { mode: "host-proxy", timeoutMs: 30_001 }), /timeout/);
});
