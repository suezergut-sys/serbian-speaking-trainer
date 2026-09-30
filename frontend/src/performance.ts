/** Optional, content-free UI timings. Enable per run with ?perf=1. */
export type UiTiming = "topics" | "first_phrase" | "transcription" | "check" | "next_phrase";

const prefix = "serbotalk:ui:";
const enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf");

export function startUiTiming(name: UiTiming): void {
  if (!enabled) return;
  const mark = `${prefix}${name}:start`;
  performance.clearMarks(mark);
  performance.mark(mark);
}

export function finishUiTimingWhenVisible(name: UiTiming, selector: string): void {
  if (!enabled) return;
  const mark = `${prefix}${name}:start`;
  const start = performance.getEntriesByName(mark, "mark").at(-1)?.startTime;
  if (start === undefined) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (performance.getEntriesByName(mark, "mark").at(-1)?.startTime !== start) return;
    const element = document.querySelector<HTMLElement>(selector);
    if (!element || !element.getClientRects().length) return;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const right = left + (viewport?.width ?? innerWidth), bottom = top + (viewport?.height ?? innerHeight);
    if (style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0
      || rect.bottom <= top || rect.right <= left || rect.top >= bottom || rect.left >= right) return;
    const measure = `${prefix}${name}`;
    performance.measure(measure, mark);
    performance.clearMarks(mark);
    // Keep a bounded in-memory history for repeated runs on one page.
    const entries = performance.getEntriesByName(measure, "measure");
    if (entries.length > 100) performance.clearMeasures(measure);
  }));
}
