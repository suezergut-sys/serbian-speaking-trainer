import { useEffect, useRef, useSyncExternalStore } from "react";

const query = "(max-width: 780px)";
const snapshot = () => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
function subscribe(callback: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", callback);
  return () => media?.removeEventListener("change", callback);
}

export function useMobileLayout(ready = true) {
  const compact = useSyncExternalStore(subscribe, snapshot, () => false);
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!compact || !ready) return;
    const viewport = window.visualViewport;
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight;
      shell.current?.style.setProperty("--mobile-height", `${height}px`);
      shell.current?.style.setProperty("--mobile-top", `${viewport?.offsetTop ?? 0}px`);
      shell.current?.classList.toggle("mobile-web-shell--short", height < 520);
    };
    resize();
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
    };
  }, [compact, ready]);
  return { compact, shell };
}
