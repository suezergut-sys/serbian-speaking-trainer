import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FeedbackSettings } from "../FeedbackSettings";
import { setLanguage } from "../i18n";
import { sendFeedback, transcribeFeedback } from "../api/training";

const voice = vi.hoisted(() => ({ stop: vi.fn(), available: true }));
vi.mock("../api/training", () => ({ sendFeedback: vi.fn(), transcribeFeedback: vi.fn() }));
vi.mock("../voiceRecorder", () => ({
  supportsVoiceRecording: () => voice.available,
  VoiceRecorder: class {
    start = async () => {};
    finish = async () => ({ audio: new Blob(["synthetic"], { type: "audio/webm" }) });
    stop = voice.stop;
  },
}));
afterEach(() => { cleanup(); setLanguage("ru"); vi.resetAllMocks(); voice.available = true; });

it.each(["ru", "en"] as const)("edits a voice transcript and submits text only in %s", async language => {
  setLanguage(language); const en = language === "en";
  vi.mocked(transcribeFeedback).mockResolvedValue({ text: "Синтетический отзыв" });
  vi.mocked(sendFeedback).mockResolvedValue({ id: "test", created_at: "2026-10-17T10:00:00Z" });
  render(<FeedbackSettings />);
  fireEvent.click(screen.getByRole("button", { name: en ? "Write or record feedback" : "Написать или записать отзыв" }));
  expect(screen.getByRole("button", { name: en ? "Send feedback" : "Отправить обратную связь" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: en ? "Record feedback" : "Записать голосом" }));
  fireEvent.click(await screen.findByRole("button", { name: en ? "Finish recording" : "Завершить запись" }));
  const textbox = screen.getByRole("textbox", { name: en ? "Your feedback" : "Ваша обратная связь" });
  await waitFor(() => expect(textbox).toHaveValue("Синтетический отзыв"));
  expect(sendFeedback).not.toHaveBeenCalled();
  fireEvent.change(textbox, { target: { value: "Исправленный отзыв" } });
  fireEvent.click(screen.getByRole("button", { name: en ? "Send feedback" : "Отправить обратную связь" }));
  await screen.findByText(en ? "Thank you! Your feedback has been sent." : "Спасибо! Обратная связь отправлена.");
  expect(sendFeedback).toHaveBeenCalledWith("Исправленный отзыв", expect.any(AbortSignal));
});

it.each(["ru", "en"] as const)("retains text after failed submission and supports retry in %s", async language => {
  setLanguage(language); const en = language === "en";
  voice.available = false;
  vi.mocked(sendFeedback).mockRejectedValueOnce(new Error("offline"));
  render(<FeedbackSettings />);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft" } });
  expect(screen.getByRole("button", { name: en ? "Record feedback" : "Записать голосом" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: en ? "Send feedback" : "Отправить обратную связь" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(en ? "Your text is still in the form" : "Текст сохранён в форме");
  expect(screen.getByRole("textbox")).toHaveValue("draft");
});

it("releases microphone on close and ignores a late transcript", async () => {
  let complete!: (value: { text: string }) => void;
  vi.mocked(transcribeFeedback).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  render(<FeedbackSettings />);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(screen.getByRole("button", { name: "Записать голосом" }));
  fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
  await waitFor(() => expect(transcribeFeedback).toHaveBeenCalled());
  const signal = vi.mocked(transcribeFeedback).mock.calls[0][1];
  fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
  expect(signal?.aborted).toBe(true);
  await act(async () => complete({ text: "late" }));
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("textbox")).toHaveValue("");
});

it("stops the microphone when settings unmount", async () => {
  const view = render(<FeedbackSettings />);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(screen.getByRole("button", { name: "Записать голосом" }));
  await screen.findByRole("button", { name: "Завершить запись" });
  view.unmount();
  expect(voice.stop).toHaveBeenCalled();
});
