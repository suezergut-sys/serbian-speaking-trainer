import { useSyncExternalStore } from "react";
import messages from "./locales/en.json";
import phraseData from "./locales/phrases.en.json";
type Phrase = { id: string; source_ru: string; source_en: string; canonical_sr: string; word_hints: Record<string, { translation_sr: string; note?: string } | undefined> };
const phrases: Phrase[] = phraseData;

export type InterfaceLanguage = "ru" | "en";
const storageKey = "serbotalk.interface-language";
const listeners = new Set<() => void>();
export function getLanguage(): InterfaceLanguage {
  if (sessionOnly) return memoryLanguage;
  try { return localStorage.getItem(storageKey) === "en" ? "en" : "ru"; }
  catch { return memoryLanguage; }
}
let memoryLanguage: InterfaceLanguage = "ru";
let sessionOnly = false;
export function setLanguage(language: InterfaceLanguage): void {
  memoryLanguage = language;
  try { localStorage.setItem(storageKey, language); sessionOnly = false; } catch { sessionOnly = true; }
  document.documentElement.lang = language;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      document.documentElement.lang = getLanguage();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function useLanguage(): InterfaceLanguage {
  return useSyncExternalStore(subscribe, getLanguage, () => "ru");
}
export function getLocale(): string { return getLanguage() === "en" ? "en-GB" : "ru-RU"; }
const dictionary: Record<string, string> = messages;
const phraseTranslations = new Map(phrases.map(phrase => [phrase.source_ru, phrase.source_en]));
const presetTopicIds = new Set(["misc", "general", "review-phrases", ...phrases.map(phrase => phrase.id.slice(0, -3))]);
export function topicText(id: string | null | undefined, text: string, englishTitle?: string | null): string {
  if (getLanguage() === "en" && englishTitle) return englishTitle;
  return id == null || presetTopicIds.has(id) ? t(text) : text;
}
export function localizedPhrase(source: string): { source: string; hints: Phrase["word_hints"] } {
  const phrase = getLanguage() === "en" ? phrases.find(item => item.source_ru === source) : undefined;
  return { source: phrase?.source_en ?? source, hints: phrase?.word_hints ?? {} };
}
const templates = Object.entries(dictionary).filter(([key]) => key.includes("{0}"))
  .sort(([left], [right]) => right.replace(/\{\d+\}/g, "").length - left.replace(/\{\d+\}/g, "").length)
  .map(([key, value]) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { pattern: new RegExp(`^${escaped.replace(/\\\{\d+\\\}/g, "(.*?)")}$`, "s"), value };
  });

/** Translate presentation text only. IDs, stored phrases and Serbian answers stay unchanged. */
export function t<T>(value: T): T {
  if (getLanguage() !== "en" || typeof value !== "string") return value;
  const trimmed = value.trim();
  let translated = (Object.hasOwn(dictionary, trimmed) ? dictionary[trimmed] : undefined) ?? phraseTranslations.get(trimmed);
  if (translated === undefined) {
    for (const template of templates) {
      const match = trimmed.match(template.pattern);
      if (match) {
        translated = template.value.replace(/\{(\d+)\}/g, (_, index: string) => String(t(match[Number(index) + 1])));
        break;
      }
    }
  }
  return (translated === undefined ? value : value.replace(trimmed, () => translated!)) as T;
}
