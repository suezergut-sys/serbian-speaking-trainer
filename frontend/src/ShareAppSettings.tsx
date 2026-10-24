import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { t, useLanguage } from "./i18n";

// Public web entry point: recipients do not need access to the closed Play test.
export const publicAppUrl = "https://serbotalk.app/";

export function ShareAppSettings() {
  useLanguage();
  const [state, setState] = useState<"idle" | "sharing" | "copying" | "copied" | "error">("idle");
  const pending = useRef(false);

  async function perform(copyOnly = false) {
    if (pending.current) return;
    pending.current = true;
    const nativeShare = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Share");
    const canShare = nativeShare || typeof navigator.share === "function";
    setState(copyOnly || !canShare ? "copying" : "sharing");
    try {
      if (copyOnly || !canShare) {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(publicAppUrl);
        setState("copied");
      } else {
        const data = { title: "SerboTalk", text: t("Практикуйте разговорный сербский с SerboTalk."), url: publicAppUrl };
        // Call directly from the click, before any await, to preserve user activation.
        if (nativeShare) await Share.share({ ...data, dialogTitle: t("Поделиться приложением") });
        else await navigator.share(data);
        setState("idle");
      }
    } catch (error) {
      // Capacitor Android uses this message; browsers use AbortError.
      const cancelled = typeof error === "object" && error !== null && (
        ("name" in error && error.name === "AbortError") || ("message" in error && error.message === "Share canceled")
      );
      setState(cancelled ? "idle" : "error");
    } finally {
      pending.current = false;
    }
  }

  const busy = state === "sharing" || state === "copying";
  return <section className="share-app-settings panel" aria-labelledby="share-app-title">
    <h2 id="share-app-title">{t("Поделиться приложением")}</h2>
    <p>{t("Пригласите друзей практиковать сербский. Ссылка открывает SerboTalk в браузере.")}</p>
    <div className="share-app-settings__actions">
      <button type="button" disabled={busy} onClick={() => void perform()}>{t("Поделиться")}</button>
      <button type="button" disabled={busy} onClick={() => void perform(true)}>{t("Скопировать ссылку")}</button>
    </div>
    <label htmlFor="share-app-url">{t("Ссылка на приложение")}</label>
    <input id="share-app-url" type="url" readOnly value={publicAppUrl} onFocus={event => event.currentTarget.select()} />
    {busy && <p role="status">{t(state === "sharing" ? "Открываем меню отправки…" : "Копируем ссылку…")}</p>}
    {state === "copied" && <p role="status">{t("Ссылка скопирована.")}</p>}
    {state === "error" && <p role="alert">{t("Не удалось поделиться или скопировать ссылку. Вы можете скопировать её вручную из поля выше.")}</p>}
  </section>;
}
