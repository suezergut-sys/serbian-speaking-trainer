import { SettingsIcon } from "./SettingsIcon";
import { useEffect, useRef, useState } from "react";
import { sendFeedback, transcribeFeedback } from "./api/training";
import { t } from "./i18n";
import { supportsVoiceRecording, VoiceRecorder } from "./voiceRecorder";

export function FeedbackSettings() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "connecting" | "recording" | "transcribing" | "sending">("idle");
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);
  const recorder = useRef<VoiceRecorder | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const epoch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function stop() {
    epoch.current += 1;
    recorder.current?.stop();
    recorder.current = undefined;
    controller.current?.abort();
    clearTimeout(timer.current);
  }
  useEffect(() => {
    function suspend() {
      if (document.hidden) { stop(); setState("idle"); }
    }
    function leave() { stop(); setState("idle"); }
    document.addEventListener("visibilitychange", suspend);
    window.addEventListener("pagehide", leave);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", suspend);
      window.removeEventListener("pagehide", leave);
    };
  }, []);

  async function startRecording() {
    const current = ++epoch.current;
    setError(false); setSent(false); setState("connecting");
    const voice = new VoiceRecorder();
    recorder.current = voice;
    try {
      await voice.start();
      if (current !== epoch.current) return;
      setState("recording");
      timer.current = setTimeout(() => { stop(); setState("idle"); setError(true); }, 60_000);
    } catch {
      if (current === epoch.current) { stop(); setState("idle"); setError(true); }
    }
  }

  async function finishRecording() {
    const current = epoch.current;
    clearTimeout(timer.current);
    setState("transcribing");
    const abort = new AbortController(); controller.current = abort;
    try {
      const recording = await recorder.current!.finish();
      recorder.current = undefined;
      if (current !== epoch.current) return;
      const transcript = await transcribeFeedback(recording.audio, abort.signal);
      if (current === epoch.current) {
        setContent(previous => `${previous}${previous ? "\n" : ""}${transcript.text}`.slice(0, 5000));
      }
    } catch {
      if (current === epoch.current) setError(true);
    } finally {
      if (current === epoch.current) { recorder.current?.stop(); recorder.current = undefined; setState("idle"); }
    }
  }

  async function submit() {
    const current = ++epoch.current;
    const abort = new AbortController(); controller.current = abort;
    setError(false); setSent(false); setState("sending");
    try {
      await sendFeedback(content.trim(), abort.signal);
      if (current === epoch.current) { setSent(true); setContent(""); setOpen(false); }
    } catch {
      if (current === epoch.current) setError(true);
    } finally {
      if (current === epoch.current) setState("idle");
    }
  }

  const busy = state !== "idle";
  return <section className="feedback-settings settings-section" aria-labelledby="feedback-settings-title">
    <h2 id="feedback-settings-title">{t("Оставить обратную связь")}</h2>
    {!open && <button className="settings-card settings-action" type="button" onClick={() => { setOpen(true); setSent(false); setError(false); }}><SettingsIcon name="feedback" /><strong>{t("Написать или записать отзыв")}</strong></button>}
    {sent && <p role="status">{t("Спасибо! Обратная связь отправлена.")}</p>}
    {open && <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label htmlFor="feedback-content">{t("Ваша обратная связь")}</label>
      <textarea id="feedback-content" maxLength={5000} rows={5} value={content} disabled={busy} onChange={event => setContent(event.target.value)} />
      <p>{t("Напишите отзыв или запишите голосом до 60 секунд. Расшифровку можно исправить перед отправкой. Аудио не сохраняется.")}</p>
      <div className="feedback-settings__actions">
        <button type="button" disabled={!supportsVoiceRecording() || (busy && state !== "recording")} onClick={() => void (state === "recording" ? finishRecording() : startRecording())}>{t(state === "recording" ? "Завершить запись" : "Записать голосом")}</button>
        <button type="submit" disabled={busy || !content.trim()}>{t(state === "sending" ? "Отправляем…" : "Отправить обратную связь")}</button>
        <button type="button" onClick={() => { stop(); setState("idle"); setOpen(false); setError(false); }}>{t("Закрыть")}</button>
      </div>
      {state !== "idle" && <p role="status">{t(state === "connecting" ? "Подключаем микрофон…" : state === "recording" ? "Идёт запись. Аудио не сохраняется" : state === "transcribing" ? "Расшифровываем отзыв…" : "Отправляем…")}</p>}
      {!supportsVoiceRecording() && <p>{t("Голосовой ввод недоступен. Напишите отзыв текстом.")}</p>}
      {error && <p role="alert">{t("Не удалось выполнить действие. Текст сохранён в форме. Попробуйте ещё раз.")}</p>}
    </form>}
  </section>;
}
