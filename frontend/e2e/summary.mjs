import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dir = join(process.cwd(), "test-results", "metrics");
const files = (await readdir(dir)).filter((name) => name.endsWith(".json") && !name.startsWith("summary"));
const allRows = await Promise.all(files.map(async (name) => JSON.parse(await readFile(join(dir, name), "utf8"))));
const platformIndex = process.argv.indexOf("--platform");
const platform = platformIndex >= 0 ? process.argv[platformIndex + 1] : undefined;
const rows = platform ? allRows.filter((row) => row.platform === platform) : allRows;
if (!rows.length) throw new Error("No measurements for the selected platform");
if (new Set(rows.map((row) => row.platform)).size !== 1) {
  throw new Error("Do not aggregate web and Android timings: specify --platform web or --platform android-webview");
}
const percentile = (values, p) => values.length ? values.sort((a, b) => a - b)[Math.ceil(p * values.length) - 1] : null;
const keys = [...new Set(rows.flatMap((row) => row.ui.map((entry) => entry.name)))];
const summary = {
  samples: rows.length,
  platforms: [...new Set(rows.map((row) => row.platform))],
  chromium_majors: [...new Set(rows.map((row) => row.chromium_major))],
  document_load_ms: {
    p50: percentile(rows.map((row) => row.documentLoad).filter((value) => value !== null), 0.5),
    p95: percentile(rows.map((row) => row.documentLoad).filter((value) => value !== null), 0.95),
  },
  per_run: {
    request_count: { p50: percentile(rows.map((row) => row.requests.length), 0.5), p95: percentile(rows.map((row) => row.requests.length), 0.95) },
    response_bytes: { p50: percentile(rows.map((row) => row.requests.reduce((sum, request) => sum + request.bytes, 0)), 0.5),
      p95: percentile(rows.map((row) => row.requests.reduce((sum, request) => sum + request.bytes, 0)), 0.95) },
  },
  ui: Object.fromEntries(keys.map((key) => {
    const values = rows.flatMap((row) => row.ui.filter((entry) => entry.name === key).map((entry) => entry.ms));
    return [key, { n: values.length, p50_ms: percentile([...values], 0.5), p95_ms: percentile([...values], 0.95) }];
  })),
  requests: rows.reduce((result, row) => {
    for (const request of row.requests) {
      const key = `${request.path} ${request.status}`;
      result[key] ??= { count: 0, response_bytes: 0 };
      result[key].count += 1;
      result[key].response_bytes += request.bytes;
    }
    return result;
  }, {}),
};
for (const [key, item] of Object.entries(summary.requests)) {
  const samples = rows.flatMap((row) => row.requests.filter((request) => `${request.path} ${request.status}` === key));
  const requestTimes = samples.map((request) => request.request_ms).filter((value) => value !== null);
  item.request_ms = { p50: percentile([...requestTimes], 0.5), p95: percentile([...requestTimes], 0.95) };
  const perRun = rows.map((row) => row.requests.filter((request) => `${request.path} ${request.status}` === key));
  item.count_per_run = { p50: percentile(perRun.map((run) => run.length), 0.5), p95: percentile(perRun.map((run) => run.length), 0.95) };
  item.response_bytes_per_run = { p50: percentile(perRun.map((run) => run.reduce((sum, request) => sum + request.bytes, 0)), 0.5),
    p95: percentile(perRun.map((run) => run.reduce((sum, request) => sum + request.bytes, 0)), 0.95) };
  const names = [...new Set(samples.flatMap((request) => Object.keys(request.server_timing)))];
  item.server_timing = Object.fromEntries(names.map((name) => {
    const values = samples.flatMap((request) => name in request.server_timing ? [request.server_timing[name]] : []);
    return [name, { p50: percentile([...values], 0.5), p95: percentile([...values], 0.95) }];
  }));
}
await writeFile(join(dir, platform ? `summary-${platform}.json` : "summary.json"), JSON.stringify(summary, null, 2));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
