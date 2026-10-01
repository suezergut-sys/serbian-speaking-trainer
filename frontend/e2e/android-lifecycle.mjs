import { _android, expect } from "@playwright/test";
import { loginTestlab } from "./flow.mjs";

const packageName = "com.serbiantalk.trainer.testlab";
const expectedVersion = process.env.TESTLAB_ANDROID_VERSION ?? "1.17";
if (!process.env.TESTLAB_EMAIL || !process.env.TESTLAB_PASSWORD) throw new Error("TESTLAB_EMAIL and TESTLAB_PASSWORD are required");

const devices = await _android.devices();
const serial = process.env.TESTLAB_ANDROID_SERIAL;
const device = serial
  ? devices.find((candidate) => candidate.serial() === serial)
  : devices.length === 1 ? devices[0] : undefined;
if (!device) throw new Error("Specify one test device with TESTLAB_ANDROID_SERIAL");

let releaseHintSave;
let hintRouteSettled;
let closeHintRoute;
let stage = "version check";
let page;
const apiStatuses = [];
try {
  const packageDetails = await device.shell(`dumpsys package ${packageName}`);
  if (!packageDetails.includes(`versionName=${expectedVersion}`)) {
    throw new Error(`Installed testlab package is not version ${expectedVersion}`);
  }

  stage = "testlab app launch";
  await device.shell(`am force-stop ${packageName}`);
  await device.shell(`pm clear ${packageName}`);
  await device.shell(`monkey -p ${packageName} 1`);
  stage = "open Android WebView";
  const webView = await device.webView({ pkg: packageName }, { timeout: 30_000 });
  page = await webView.page();
  await installSyntheticMedia(page);
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/")) apiStatuses.push(`${path.replace(/\/(sessions|exercises)\/[^/]+/g, "/$1/{id}")}:${response.status()}`);
  });
  stage = "testlab login";
  await loginTestlab(page, null);

  stage = "install and verify synthetic media";
  await page.evaluate(() => {
    if (!window.__androidSyntheticMediaInstalled) throw new Error("Synthetic media init script did not run");
  });
  await page.evaluate(installSyntheticMediaInPage);
  await page.evaluate(() => {
    if (!window.__androidSyntheticMediaInstalled || typeof window.__androidMediaCounts?.trackStopCount !== "number") {
      throw new Error("Synthetic media fixture is unavailable");
    }
  });

  stage = "start training session";
  // Match the existing Android runner: select a topic through the WebView, then use native taps for practice controls.
  await page.getByRole("button", { name: /Собеседование/ }).first().click();
  await expect(page.locator(".android-training-page .interactive-phrase")).toBeVisible();

  stage = "native app lifecycle listener";
  await page.evaluate(async () => {
    const plugin = window.Capacitor?.Plugins?.App;
    if (!plugin?.addListener) throw new Error("Native Capacitor App plugin is unavailable");
    window.__androidLifecycleEvents = { inactiveCount: 0, activeCount: 0 };
    await plugin.addListener("appStateChange", ({ isActive }) => {
      if (isActive) window.__androidLifecycleEvents.activeCount += 1;
      else window.__androidLifecycleEvents.inactiveCount += 1;
    });
  });
  let transcriptionRequestCount = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/transcriptions") transcriptionRequestCount += 1;
  });

  stage = "start initial synthetic recording";
  await page.getByRole("button", { name: "Ответить голосом", exact: true }).click();
  stage = "finish initial synthetic recording";
  await page.getByRole("button", { name: "Завершить запись", exact: true }).click();
  stage = "wait for synthetic transcript";
  const answer = page.getByLabel("Ваш ответ");
  await expect(answer).toBeVisible();
  stage = "edit draft and close keyboard";
  const draft = "Sačuvaj ovaj odgovor.";
  await answer.fill(draft);
  await device.input.press("Back");

  stage = "background while recording";
  await page.getByRole("button", { name: "Ответить голосом", exact: true }).click();
  await expect(page.getByRole("button", { name: "Завершить запись" })).toBeVisible();
  const beforeHome = await page.evaluate(() => ({
    ...window.__androidMediaCounts,
    ...window.__androidLifecycleEvents,
  }));
  await device.shell("input keyevent KEYCODE_HOME");
  const transcriptionsBeforeResume = transcriptionRequestCount;

  stage = "resume and recover draft";
  await device.shell(`monkey -p ${packageName} 1`);
  await expect.poll(() => page.evaluate(() => window.__androidLifecycleEvents.activeCount), { timeout: 30_000 }).toBeGreaterThan(beforeHome.activeCount);
  await expect.poll(() => page.evaluate(() => window.__androidLifecycleEvents.inactiveCount), { timeout: 30_000 }).toBeGreaterThan(beforeHome.inactiveCount);
  await expect.poll(() => page.evaluate(() => window.__androidMediaCounts.recorderStopCount), { timeout: 30_000 }).toBe(beforeHome.recorderStopCount + 1);
  await expect.poll(() => page.evaluate(() => window.__androidMediaCounts.trackStopCount), { timeout: 30_000 }).toBe(beforeHome.trackStopCount + 1);
  await expect(page.getByRole("button", { name: "Ответить голосом" })).toBeVisible({ timeout: 30_000 });
  await expect(answer).toHaveValue(draft);
  await expect(page.getByRole("alert")).toContainText("Запись прервана. Текущая фраза и текст ответа сохранены.");
  expect(transcriptionRequestCount).toBe(transcriptionsBeforeResume);

  stage = "retry recording";
  await page.getByRole("button", { name: "Ответить голосом", exact: true }).click();
  await page.getByRole("button", { name: "Завершить запись", exact: true }).click();
  await expect(answer).toHaveValue(/.+/);
  await answer.fill("Radim kao računovođa u maloj firmi.");
  await device.input.press("Back");

  stage = "install blocked hint-save route";
  const hintSavePending = new Promise((resolve) => { releaseHintSave = resolve; });
  hintRouteSettled = new Promise((resolve) => { closeHintRoute = resolve; });
  let hintRequests = 0;
  await page.route("**/api/exercises/*/word-hints", async (route) => {
    hintRequests += 1;
    try {
      await hintSavePending;
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Synthetic delayed save failure"}' });
    } catch { /* A page teardown or request cancellation must not log response contents. */ }
    finally { closeHintRoute(); }
  });
  const phrase = page.locator(".android-training-page .interactive-phrase");
  const previousPhrase = await phrase.getAttribute("aria-label");
  stage = "open word hint";
  await tapLocator(page, device, page.locator(".android-training-page .interactive-phrase .word-token").first());
  const tooltip = page.locator(".word-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).not.toContainText("Загружаем");
  await expect.poll(() => hintRequests).toBe(1);

  stage = "score while hint save is pending";
  await tapButton(page, device, "Проверить");
  const feedback = page.locator(".android-training-page .feedback");
  await expect(feedback).toBeVisible();
  await expect(feedback.locator(".feedback__score")).toContainText("92%");

  stage = "advance while hint save is pending";
  await tapButton(page, device, "Следующая");
  await expect(phrase).toBeVisible();
  await expect(phrase).not.toHaveAttribute("aria-label", previousPhrase);

  stage = "release hint save and verify flow";
  releaseHintSave();
  await hintRouteSettled;
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(hintRequests).toBe(1);
  process.stdout.write(`Android testlab ${expectedVersion} lifecycle and hint-race smoke passed.\n`);
} catch (error) {
  const statuses = apiStatuses.slice(-12).join(", ") || "no API responses";
  const reason = error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "unknown error";
  throw new Error(`Android testlab ${expectedVersion} smoke failed at ${stage}; API statuses: ${statuses}; ${reason}`);
} finally {
  releaseHintSave?.();
  if (hintRouteSettled && !closeHintRoute) closeHintRoute = () => undefined;
  await device.shell(`am force-stop ${packageName}`).catch(() => undefined);
  await device.shell("am force-stop com.microsoft.playwright.androiddriver").catch(() => undefined);
  await device.close();
}

async function installSyntheticMedia(targetPage) {
  await targetPage.addInitScript(installSyntheticMediaInPage);
}

function installSyntheticMediaInPage() {
    window.__androidMediaCounts = { recorderStartCount: 0, recorderStopCount: 0, trackStopCount: 0 };
    window.__androidSyntheticMediaInstalled = true;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => {
        let stopped = false;
        const track = { stop() { if (!stopped) { stopped = true; window.__androidMediaCounts.trackStopCount += 1; } } };
        return { getTracks: () => [track] };
      } },
    });
    class SyntheticRecorder extends EventTarget {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/webm";
      start() { this.state = "recording"; window.__androidMediaCounts.recorderStartCount += 1; }
      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        window.__androidMediaCounts.recorderStopCount += 1;
        // Synthetic test bytes stay in memory and are discarded by the app lifecycle.
        this.dispatchEvent(new BlobEvent("dataavailable", { data: new Blob([new Uint8Array(64)], { type: "audio/webm" }) }));
        this.dispatchEvent(new Event("stop"));
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: SyntheticRecorder });
}

async function tapButton(targetPage, targetDevice, accessibleName) {
  await tapLocator(targetPage, targetDevice, targetPage.getByRole("button", { name: accessibleName, exact: true }));
}

async function tapLocator(targetPage, targetDevice, locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  await locator.scrollIntoViewIfNeeded();
  const point = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    if (!viewport) throw new Error("Visual viewport is unavailable");
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === element || element.contains(hit))) throw new Error("Target is covered");
    if (x < viewport.offsetLeft || y < viewport.offsetTop || x >= viewport.offsetLeft + viewport.width || y >= viewport.offsetTop + viewport.height) {
      throw new Error("Target is outside the visible viewport");
    }
    return { x: x - viewport.offsetLeft, y: y - viewport.offsetTop, width: viewport.width, height: viewport.height };
  });
  const { bounds } = await targetDevice.info({ clazz: "android.webkit.WebView", pkg: packageName });
  await targetDevice.input.tap({
    x: Math.round(bounds.x + point.x * bounds.width / point.width),
    y: Math.round(bounds.y + point.y * bounds.height / point.height),
  });
}
