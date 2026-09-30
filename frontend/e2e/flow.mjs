import { expect } from "@playwright/test";

export async function installSyntheticMicrophone(page) {
  await page.addInitScript(() => {
    const fakeTrack = { stop() {} };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [fakeTrack] }) },
    });
    class SyntheticRecorder extends EventTarget {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/webm";
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        // This is synthetic test data held in memory only; no user audio exists.
        this.dispatchEvent(new BlobEvent("dataavailable", { data: new Blob([new Uint8Array(1024)], { type: "audio/webm" }) }));
        this.dispatchEvent(new Event("stop"));
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: SyntheticRecorder });
  });
}

export async function runPracticeFlow(page, { topic, transcript, firstPhrase, expectedScore, native = false, afterEdit = async () => undefined, activateButton = async (name) => page.getByRole("button", { name }).click(), onStage = () => undefined }) {
  onStage("topic");
  await expect(page.getByRole("button", { name: topic }).first()).toBeVisible();
  await page.getByRole("button", { name: topic }).first().click();
  const phrase = page.locator(native ? ".android-training-page .interactive-phrase" : ".practice-stage .interactive-phrase");
  onStage("first phrase");
  await expect(phrase).toBeVisible();
  if (firstPhrase) await expect(phrase).toHaveAttribute("aria-label", firstPhrase);
  const previousPhrase = await phrase.getAttribute("aria-label");
  onStage("recording");
  await page.getByRole("button", { name: "Ответить голосом" }).click();
  await page.getByRole("button", { name: "Завершить запись" }).click();
  const answer = page.getByLabel("Ваш ответ");
  onStage("transcript");
  await expect(answer).toBeVisible();
  await answer.fill(transcript);
  await afterEdit();
  onStage("check");
  await activateButton(native ? "Проверить" : "Проверить ответ");
  onStage("feedback");
  const feedback = page.locator(native ? ".android-training-page .feedback" : ".practice-stage .feedback");
  await expect(feedback).toBeVisible();
  await expect(feedback.locator(".feedback__score")).toContainText(/\d+%/);
  if (expectedScore) await expect(feedback.locator(".feedback__score")).toContainText(expectedScore);
  onStage("next phrase");
  await activateButton(native ? "Следующая" : "Следующая фраза");
  await expect(phrase).toBeVisible();
  await expect(phrase).not.toHaveAttribute("aria-label", previousPhrase);
  await expect(phrase).toBeInViewport();
  await page.waitForFunction(() => performance.getEntriesByName("serbotalk:ui:next_phrase", "measure").length > 0);
}

export async function loginTestlab(page, loginUrl = "/testlab.html") {
  const email = process.env.TESTLAB_EMAIL;
  const password = process.env.TESTLAB_PASSWORD;
  if (!email || !password) throw new Error("TESTLAB_EMAIL and TESTLAB_PASSWORD are required");
  if (loginUrl === null) await page.waitForURL(/\/testlab\.html(?:\?|$)/);
  else await page.goto(loginUrl);
  await page.getByLabel("Email").fill(email);
  await page.evaluate((value) => {
    const input = document.querySelector('input[name="password"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("Testlab password field is unavailable");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, password);
  await page.getByRole("button", { name: "Войти в тестовую среду" }).click();
  await expect(page).toHaveURL(/\?perf(?:=|$)/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Собеседование/ }).first()).toBeVisible({ timeout: 30_000 });
}
