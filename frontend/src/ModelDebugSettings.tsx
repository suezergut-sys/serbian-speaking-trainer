import { SettingsIcon } from "./SettingsIcon";
import { t } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { fetchModelDebug, updateModelDebug } from "./api/users";

export function ModelDebugSettings() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    void fetchModelDebug(controller.signal).then(result => {
      if (!controller.signal.aborted) { setEnabled(result.enabled); setLoaded(true); }
    }).catch(() => {
      if (pending.current === controller) setError("Не удалось загрузить режим отладки. Откройте настройки повторно.");
    }).finally(() => {
      window.clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    });
    return () => { pending.current?.abort(); pending.current = null; window.clearTimeout(timeout); };
  }, [reload]);

  async function change(value: boolean) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(undefined);
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const result = await updateModelDebug(value, controller.signal);
      if (pending.current === controller) setEnabled(result.enabled);
    } catch {
      if (pending.current === controller) setError("Не удалось изменить режим отладки. Проверьте подключение и повторите.");
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }

  return <section className="assistance-settings settings-section settings-card" aria-label={t("Режим отладки")}>
    <SettingsIcon name="debug" />
    <div className="settings-card__copy">
    <label className="settings-toggle"><strong>{t("Режим отладки")}</strong><input type="checkbox" role="switch" checked={enabled} disabled={busy || !loaded} onChange={event => void change(event.target.checked)} /></label>
    <p>{t("Сохранять в БД запросы и ответы моделей вашего аккаунта, точное время, длительность и аудио для диагностики распознавания.")}</p>
    <small>{t("Временно хранятся последние 20 аудиозаписей. При выключении все логи и аудио удаляются из БД.")}</small>
    {busy && <p role="status">{t("Сохраняем или загружаем режим отладки…")}</p>}
    {error && <p role="alert">{t(error)}</p>}
    {!busy && !loaded && <button className="debug-retry-button" type="button" onClick={() => { setBusy(true); setError(undefined); setReload(value => value + 1); }}>{t("Повторить загрузку")}</button>}
    </div>
  </section>;
}
