import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function WordHintToken({ word, used, disabled, active, translation, onClick }: {
  word: string; used: boolean; disabled: boolean; active: boolean;
  translation: string; onClick: () => void;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!active) return;
    const position = () => {
      if (!anchor.current || !tooltip.current) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const margin = 12;
      const box = anchor.current.getBoundingClientRect();
      const popup = tooltip.current;
      popup.style.maxWidth = `${Math.max(1, width - margin * 2)}px`;
      const size = popup.getBoundingClientRect();
      const center = box.left + box.width / 2;
      const left = Math.max(viewportLeft + margin, Math.min(center - size.width / 2, viewportLeft + width - margin - size.width));
      const above = box.top - size.height - 10;
      const top = Math.max(viewportTop + margin, Math.min(above >= viewportTop + margin ? above : box.bottom + 10, viewportTop + height - margin - size.height));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(position);
    if (anchor.current) observer?.observe(anchor.current);
    if (tooltip.current) observer?.observe(tooltip.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [active, translation]);

  return <span className="word-wrap" ref={anchor}>
    <button className={used ? "word-token is-used" : "word-token"} type="button" disabled={disabled} onClick={onClick}>{word}</button>
    {active && createPortal(<span ref={tooltip} className="word-tooltip" role="status">{translation}</span>, document.body)}
  </span>;
}
