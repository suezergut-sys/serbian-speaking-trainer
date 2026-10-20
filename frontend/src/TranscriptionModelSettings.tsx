import { useEffect, useRef, useState } from "react";
import { fetchTranscriptionModels, updateTranscriptionModel, type TranscriptionModelSettings as ModelSettings } from "./api/users";
import { t } from "./i18n";

export function TranscriptionModelSettings() {
  const [settings, setSettings] = useState<ModelSettings>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    void fetchTranscriptionModels(controller.signal).then(result => {
      if (pending.current === controller && !controller.signal.aborted) setSettings(result);
    }).catch(() => {
      if (pending.current === controller) setError("Не удалось загрузить модели распознавания.");
    }).finally(() => {
      window.clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    });
    return () => { pending.current?.abort(); pending.current = null; window.clearTimeout(timeout); };
  }, [reload]);

  async function change(model: string) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(undefined);
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const result = await updateTranscriptionModel(model || null, controller.signal);
      if (pending.current === controller && !controller.signal.aborted) setSettings(result);
    } catch {
      if (pending.current === controller) setError("Не удалось сохранить модель. Повторите выбор.");
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }

  return <section className="transcription-model-settings panel" aria-labelledby="transcription-model-title">
    <h2 id="transcription-model-title">{t("Эксперимент: распознавание речи")}</h2>
    <p>{t("Модель меняется только для вашего аккаунта и следующих записей. Отладку включать необязательно.")}</p>
    <label htmlFor="transcription-model">{t("Модель распознавания")}</label>
    <select id="transcription-model" disabled={busy || !settings} value={settings?.selected_model ?? ""} onChange={event => void change(event.target.value)}>
      <option value="">{t("По умолчанию")}{settings?.default_model ? ` (${settings.default_model})` : ""}</option>
      {settings?.options.map(model => <option key={model} value={model}>{model}</option>)}
    </select>
    <p>{t("Язык записи — сербский. Выбранный выше алфавит передаётся модели. Качество проверяйте на собственных записях.")}</p>
    {busy && <p role="status">{t("Загружаем или сохраняем модель…")}</p>}
    {error && <p role="alert">{t(error)}</p>}
    {!busy && !settings && <button type="button" onClick={() => { setBusy(true); setError(undefined); setReload(value => value + 1); }}>{t("Повторить загрузку")}</button>}
  </section>;
}
