import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const allowedPath = /^\/api\//;
const numericTiming = /(?:^|,)\s*(total|auth|user_sync|db|db_queries|ai|ai_calls);(?:dur|desc)="?([0-9]+(?:\.[0-9]+)?)"?/g;

function templatePath(path) {
  return path
    .replace(/\/sessions\/[^/]+(?=\/next-exercise)/g, "/sessions/{id}")
    .replace(/\/exercises\/[^/]+(?=\/word-hints)/g, "/exercises/{id}");
}

function safeServerTiming(header) {
  const timings = {};
  for (const match of header.matchAll(numericTiming)) timings[match[1]] = Number(match[2]);
  return timings;
}

export function captureMetrics(page, platform = "web") {
  const requests = [];
  const pending = [];
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (!allowedPath.test(pathname)) return;
    pending.push((async () => {
      let bytes = Number(response.headers()["content-length"] ?? 0);
      if (!bytes) {
        try { bytes = (await response.body()).byteLength; } catch { bytes = 0; }
      }
      await response.finished().catch(() => undefined);
      const elapsed = response.request().timing().responseEnd;
      requests.push({
        path: templatePath(pathname), status: response.status(), bytes,
        request_ms: elapsed >= 0 ? Math.round(elapsed) : null,
        server_timing: safeServerTiming(response.headers()["server-timing"] ?? ""),
      });
    })());
  });
  return async (label) => {
    await Promise.allSettled(pending);
    const ui = await page.evaluate(() => performance.getEntriesByType("measure")
      .filter((entry) => entry.name.startsWith("serbotalk:ui:"))
      .map((entry) => ({ name: entry.name.slice("serbotalk:ui:".length), ms: Math.round(entry.duration) })));
    const documentLoad = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null;
    });
    const chromiumVersion = await page.evaluate(() => Number(navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/)?.[1] ?? 0));
    const dir = join(process.cwd(), "test-results", "metrics");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${label}.json`), JSON.stringify({
      label, platform, chromium_major: chromiumVersion || null, ui, documentLoad, requests,
    }, null, 2));
  };
}
