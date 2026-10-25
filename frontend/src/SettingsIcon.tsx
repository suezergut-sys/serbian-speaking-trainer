import type { ReactNode } from "react";
import openaiLogo from "./assets/settings/openai.svg";

export type SettingsIconName = "ru" | "en" | "latin" | "cyrillic" | "hints" | "bell" | "celebrate" | "share" | "link" | "feedback" | "openai" | "debug";

/** Local vectors stay sharp and available offline in both shared layouts. */
export function SettingsIcon({ name }: { name: SettingsIconName }) {
  let content: ReactNode;
  if (name === "ru") content = <svg viewBox="0 0 30 21" fill="none"><path fill="#fff" d="M0 0h30v7H0z"/><path fill="#2456ba" d="M0 7h30v7H0z"/><path fill="#df3b45" d="M0 14h30v7H0z"/></svg>;
  else if (name === "en") content = <svg viewBox="0 0 30 21" fill="none"><path fill="#244580" d="M0 0h30v21H0z"/><path stroke="#fff" strokeWidth="5" d="m0 0 30 21M30 0 0 21"/><path stroke="#d53443" strokeWidth="2" d="m0 0 30 21M30 0 0 21"/><path stroke="#fff" strokeWidth="7" d="M15 0v21M0 10.5h30"/><path stroke="#d53443" strokeWidth="4" d="M15 0v21M0 10.5h30"/></svg>;
  else if (name === "openai") content = <img src={openaiLogo} alt="" width="28" height="28" />;
  else if (name === "latin" || name === "cyrillic") content = <span className="settings-icon__letters">{name === "latin" ? "Aa" : "Ћћ"}</span>;
  else {
    const paths: Record<string, ReactNode> = {
      hints: <><path d="M4 4h16v13H9l-5 4Z"/><path d="m8 10 2 2 5-5M8 15h8"/></>,
      bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4M12 2V1"/></>,
      celebrate: <><path d="m4 20 4-13 9 9Z"/><path d="m13 3 1 3M19 4l-2 4M21 10l-3 1M7 3l2 1M19 20l2 1M16 2h.01M22 6h.01"/></>,
      share: <><circle cx="18" cy="4" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="20" r="3"/><path d="m8.5 10.5 7-5M8.5 13.5l7 5"/></>,
      link: <><path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0M16 9l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0" transform="translate(0 -1)"/></>,
      feedback: <><path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z"/><path d="M8 9h8M8 13h5"/></>,
      debug: <><rect x="7" y="6" width="10" height="14" rx="5"/><path d="M9 6V3M15 6V3M7 10H3M17 10h4M7 15H3M17 15h4M6 19l-2 2M18 19l2 2M12 7v12"/></>,
    };
    content = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
  }
  return <span className={`settings-icon settings-icon--${name}`} aria-hidden="true">{content}</span>;
}
