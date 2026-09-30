import { _android, expect } from "@playwright/test";
import { captureMetrics } from "./metrics.mjs";
import { installSyntheticMicrophone, loginTestlab, runPracticeFlow } from "./flow.mjs";

// Experimental Playwright Android WebView API; requires an installed debug testlab flavor.
const packageName = "com.serbiantalk.trainer.testlab";
const devices = await _android.devices();
const device = process.env.TESTLAB_ANDROID_SERIAL
  ? devices.find((candidate) => candidate.serial() === process.env.TESTLAB_ANDROID_SERIAL)
  : devices.length === 1 ? devices[0] : undefined;
if (!device) throw new Error("Specify one connected Android device with TESTLAB_ANDROID_SERIAL");

try {
  await device.shell(`am force-stop ${packageName}`);
  await device.shell(`pm clear ${packageName}`);
  await device.shell(`monkey -p ${packageName} 1`);
  const webView = await device.webView({ pkg: packageName }, { timeout: 30_000 });
  const page = await webView.page();
  const authEvents = [];
  const apiEvents = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/auth/v1/token") authEvents.push(`status ${response.status()}`);
    if (path.startsWith("/api/")) apiEvents.push(`${path.replace(/\/(sessions|exercises)\/[^/]+/g, "/$1/{id}")}:${response.status()}`);
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/auth/v1/token") authEvents.push(`network ${request.failure()?.errorText ?? "unknown"}`);
  });
  await installSyntheticMicrophone(page);
  const saveMetrics = captureMetrics(page, "android-webview");
  try { await loginTestlab(page, null); }
  catch { throw new Error(`Android testlab login failed: ${authEvents.join(", ") || "no auth response"}; page ${new URL(page.url()).pathname}; API ${apiEvents.join(", ")}`); }
  let stage = "initial";
  // Android WebView can expose different layout and visual viewports after editing.
  // Use a real device touch mapped from observed WebView bounds, never forced DOM clicks.
  const tapButton = async (name) => {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await button.scrollIntoViewIfNeeded();
    const point = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      if (!viewport) throw new Error("Visual viewport is unavailable");
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !element.contains(hit)) throw new Error("Button is covered");
      if (x < viewport.offsetLeft || y < viewport.offsetTop || x >= viewport.offsetLeft + viewport.width || y >= viewport.offsetTop + viewport.height) {
        throw new Error("Button is outside the visible viewport");
      }
      return { x: x - viewport.offsetLeft, y: y - viewport.offsetTop, width: viewport.width, height: viewport.height };
    });
    const { bounds } = await device.info({ clazz: "android.webkit.WebView", pkg: packageName });
    await device.input.tap({ x: Math.round(bounds.x + point.x * bounds.width / point.width),
      y: Math.round(bounds.y + point.y * bounds.height / point.height) });
  };
  try {
    await runPracticeFlow(page, {
      topic: /Собеседование/,
      transcript: "Radim kao računovođa u maloj firmi.",
      native: true,
      afterEdit: async () => { await device.input.press("Back"); },
      activateButton: tapButton,
      onStage: (current) => { stage = current; },
    });
  } catch (error) {
    const form = await page.evaluate(() => {
      const answer = document.querySelector("#android-serbian-answer");
      const submit = document.querySelector('.android-answer button[type="submit"]');
      const rect = submit?.getBoundingClientRect();
      const hit = rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
      return {
        answer_chars: answer?.value.length ?? 0, submit_present: Boolean(submit), submit_disabled: submit?.disabled ?? null,
        button_rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
        viewport: { width: window.innerWidth, height: window.innerHeight, scale: window.visualViewport?.scale, visualWidth: window.visualViewport?.width }, hit_tag: hit?.tagName ?? null,
      };
    }).catch(() => ({}));
    const reason = error instanceof Error ? error.message.split("\n").slice(0, 8).join(" | ") : "unknown";
    throw new Error(`Android practice flow failed at ${stage}; API statuses: ${apiEvents.join(", ")}; form ${JSON.stringify(form)}; reason ${reason}`);
  }
  await saveMetrics("local-android");
  process.stdout.write("Android testlab practice flow passed.\n");
} finally {
  // End only the dedicated fixture app and Playwright instrumentation before disconnecting.
  // This also releases the Android instrument shell stream used by the experimental API.
  await device.shell(`am force-stop ${packageName}`);
  await device.shell("am force-stop com.microsoft.playwright.androiddriver");
  await device.close();
}
