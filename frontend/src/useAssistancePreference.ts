import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPreferences, updatePreferences } from "./api/users";

export function useAssistancePreference(initial: boolean) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef(true);
  const writing = useRef(false);
  const generation = useRef(0);
  const reading = useRef(false);
  const requests = useRef(new Map<AbortController, number>());

  const request = useCallback(async (value?: boolean) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    requests.current.set(controller, timeout);
    try {
      const result = value === undefined
        ? await fetchPreferences(controller.signal)
        : await updatePreferences(value, controller.signal);
      if (typeof result.assistance_enabled !== "boolean") throw new Error("Invalid preference");
      return result.assistance_enabled;
    } finally {
      window.clearTimeout(timeout);
      requests.current.delete(controller);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!active.current || writing.current || reading.current || document.visibilityState === "hidden") return;
    reading.current = true;
    const version = generation.current;
    try {
      const value = await request();
      if (active.current && version === generation.current) setEnabled(value);
    } catch { /* Keep the last confirmed setting and retry on the next refresh. */ }
    finally { reading.current = false; }
  }, [request]);

  const change = useCallback(async (value: boolean) => {
    if (writing.current) return;
    writing.current = true;
    generation.current += 1;
    setSaving(true);
    setError(undefined);
    try {
      const confirmed = await request(value);
      if (active.current) setEnabled(confirmed);
    } catch {
      if (active.current) setError("Не удалось сохранить настройку. Проверьте подключение и повторите изменение.");
    } finally {
      writing.current = false;
      if (active.current) setSaving(false);
    }
  }, [request]);

  useEffect(() => {
    active.current = true;
    const pendingRequests = requests.current;
    void Promise.resolve().then(refresh);
    const onRefresh = () => { void refresh(); };
    const interval = window.setInterval(onRefresh, 15_000);
    window.addEventListener("focus", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    return () => {
      active.current = false;
      generation.current += 1;
      reading.current = false;
      for (const [controller, timeout] of pendingRequests) {
        window.clearTimeout(timeout);
        controller.abort();
      }
      pendingRequests.clear();
      window.clearInterval(interval);
      window.removeEventListener("focus", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
    };
  }, [refresh]);

  return { enabled, saving, error, change, refresh };
}
