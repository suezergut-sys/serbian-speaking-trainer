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

  return <section className="assistance-settings panel" aria-label="Отладка моделей">
    <label><input type="checkbox" role="switch" checked={enabled} disabled={busy || !loaded} onChange={event => void change(event.target.checked)} /> Режим отладки моделей</label>
    <p>Сохранять в БД запросы и ответы моделей только вашего аккаунта, точное время и длительность. Аудиозаписи и ключи доступа не сохраняются.</p>
    <small>При выключении все накопленные логи отладки удаляются из БД.</small>
    {busy && <p role="status">Сохраняем или загружаем режим отладки…</p>}
    {error && <p role="alert">{error}</p>}
    {!busy && !loaded && <button className="debug-retry-button" type="button" onClick={() => { setBusy(true); setError(undefined); setReload(value => value + 1); }}>Повторить загрузку</button>}
  </section>;
}
