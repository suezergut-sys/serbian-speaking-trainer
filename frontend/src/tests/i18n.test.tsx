import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getLanguage, getLocale, localizedPhrase, setLanguage, t, topicText } from "../i18n";
import phrases from "../locales/phrases.en.json";
import messages from "../locales/en.json";
import { SettingsView } from "../SettingsView";

afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage("ru"); localStorage.clear(); });

it("places language first and switches settings immediately without changing the Serbian alphabet", () => {
  const onAlphabetChange = vi.fn();
  const view = render(<SettingsView alphabet="cyrillic" onAlphabetChange={onAlphabetChange} />);
  expect(view.container.querySelector("fieldset")).toHaveClass("language-settings");
  fireEvent.click(screen.getByRole("radio", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /Cyrillic/ })).toBeChecked();
  expect(onAlphabetChange).not.toHaveBeenCalled();
  expect(document.documentElement.lang).toBe("en");
  expect(localStorage.getItem("serbotalk.interface-language")).toBe("en");
  cleanup();
  render(<SettingsView alphabet="cyrillic" onAlphabetChange={onAlphabetChange} />);
  expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "Русский" }));
  expect(screen.getByRole("heading", { name: "Настройки" })).toBeInTheDocument();
});

it("translates dynamic counts and errors while preserving unknown text and Serbian", () => {
  setLanguage("en");
  expect(t("3 из 10 фраз осталось")).toBe("3 of 10 phrases remaining");
  expect(t("Сервер вернул ошибку HTTP 503.")).toBe("The server returned HTTP error 503.");
  expect(t("Дневной лимит фраз исчерпан. Новые фразы будут доступны после обновления лимита.")).toBe("Daily phrase limit reached. New phrases will be available after the limit resets.");
  expect(t("My own topic")).toBe("My own topic");
  expect(t("constructor")).toBe("constructor");
  expect(t("toString")).toBe("toString");
  expect(topicText("bank", "Банк")).toBe("Bank");
  expect(topicText("custom-topic", "Банк")).toBe("Банк");
  expect(t("Želim da otvorim račun.")).toBe("Želim da otvorim račun.");
  expect(getLocale()).toBe("en-GB");
  for (const [source, translation] of Object.entries(messages)) {
    const rendered = source.replace(/\{(\d+)\}/g, (_, index: string) => `value${index}`);
    expect(t(rendered), source).toBe(translation.replace(/\{(\d+)\}/g, (_, index: string) => `value${index}`));
  }
});

it("keeps a complete English catalog tied to all 160 canonical Serbian phrases and existing hints", () => {
  const seeds = readFileSync(resolve(process.cwd(), "../backend/app/db/topic_phrases.py"), "utf8");
  const hints = readFileSync(resolve(process.cwd(), "../backend/app/db/topic_phrase_hints.py"), "utf8");
  expect(phrases).toHaveLength(160);
  expect(new Set(phrases.map(phrase => phrase.id)).size).toBe(160);
  expect(new Set(phrases.map(phrase => phrase.source_ru)).size).toBe(160);
  setLanguage("en");
  for (const phrase of phrases) {
    expect(seeds).toContain(JSON.stringify(phrase.source_ru));
    expect(seeds).toContain(JSON.stringify(phrase.canonical_sr));
    expect(phrase.source_en).not.toMatch(/[А-Яа-яЁё]/);
    expect(t(phrase.source_ru)).toBe(phrase.source_en);
    expect(Object.keys(localizedPhrase(phrase.source_ru).aliases).length).toBeGreaterThan(0);
    for (const [word, hint] of Object.entries(phrase.word_hints)) {
      expect(phrase.source_en.toLowerCase()).toContain(word);
      expect(phrase.source_ru.toLowerCase()).toContain(hint.word_ru.toLowerCase());
      expect(hints).toContain(hint.translation_sr);
    }
  }
  setLanguage("ru");
  expect(localizedPhrase(phrases[0].source_ru)).toEqual({ source: phrases[0].source_ru, aliases: {} });
});

it("keeps the choice active if browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  setLanguage("en");
  expect(getLanguage()).toBe("en");
  expect(t("Настройки")).toBe("Settings");
});
