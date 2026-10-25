import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getLanguage, getLocale, localizedPhrase, setLanguage, t, topicText } from "../i18n";
import phrases from "../locales/phrases.en.json";
import messages from "../locales/en.json";
import { sourceWords } from "../sourceWords";
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

it("keeps a complete English catalog tied to all 210 canonical Serbian phrases and independent hints", () => {
  const seeds = readFileSync(resolve(process.cwd(), "../backend/app/db/topic_phrases.py"), "utf8");
  expect(phrases).toHaveLength(210);
  expect(new Set(phrases.map(phrase => phrase.id)).size).toBe(210);
  expect(new Set(phrases.map(phrase => phrase.source_ru)).size).toBe(210);
  setLanguage("en");
  for (const phrase of phrases) {
    if (phrase.id.startsWith("misc-")) {
      const rows = readFileSync(resolve(process.cwd(), "../backend/app/db/misc_phrases.tsv"), "utf8").trim().split("\n").map(row => row.trim().split("\t"));
      expect(rows).toContainEqual([phrase.canonical_sr, phrase.source_ru, phrase.source_en]);
    } else {
      expect(seeds).toContain(JSON.stringify(phrase.source_ru));
      expect(seeds).toContain(JSON.stringify(phrase.canonical_sr));
    }
    expect(phrase.source_en).not.toMatch(/[А-Яа-яЁё]/);
    expect(t(phrase.source_ru)).toBe(phrase.source_en);
    expect(Object.keys(localizedPhrase(phrase.source_ru).hints).length).toBeGreaterThan(0);
    const requiredWords = [...new Set(sourceWords(phrase.source_en).map(word => word.toLowerCase()))].filter(word => !["a", "an", "the"].includes(word));
    expect(requiredWords.filter(word => !Object.hasOwn(phrase.word_hints, word)), phrase.id).toEqual([]);
    for (const [word, hint] of Object.entries(phrase.word_hints)) {
      expect(phrase.source_en.toLowerCase()).toContain(word);
      expect(hint).not.toHaveProperty("word_ru");
      expect(hint.translation_sr.trim()).not.toBe("");
      if ("note" in hint && typeof hint.note === "string") {
        expect(messages).toHaveProperty(hint.note);
        expect(t(hint.note)).not.toBe(hint.note);
      }
    }
  }
  setLanguage("ru");
  expect(localizedPhrase(phrases[0].source_ru)).toEqual({ source: phrases[0].source_ru, hints: {} });
});

it("keeps the choice active if browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  setLanguage("en");
  expect(getLanguage()).toBe("en");
  expect(t("Настройки")).toBe("Settings");
});


it("keeps compound words intact and corrects the reported lexical hints", () => {
  setLanguage("en");
  const vacation = phrases.find(phrase => phrase.id === "vacation-10")!;
  const hints = localizedPhrase(vacation.source_ru).hints;
  expect(hints.best?.translation_sr).toBe("najbolje");
  expect(hints.time?.translation_sr).toBe("vreme");
  expect(hints.buy?.translation_sr).toBe("kupiti");
  expect(hints.is?.translation_sr).toBe("je");
  const job = phrases.find(phrase => phrase.id === "job-interview-01")!;
  expect(localizedPhrase(job.source_ru).hints.i?.translation_sr).toBe("ja");
  expect(localizedPhrase(job.source_ru).hints.work?.translation_sr).toBe("Radim");
  const bank = phrases.find(phrase => phrase.id === "bank-07")!;
  expect(sourceWords(bank.source_en)).toContain("bank's");
  expect(localizedPhrase(bank.source_ru).hints["bank's"]?.translation_sr).toBe("banke");
  const flat = phrases.find(phrase => phrase.id === "rent-01")!;
  expect(sourceWords(flat.source_en)).toContain("two-room");
  expect(localizedPhrase(flat.source_ru).hints["two-room"]?.translation_sr).toBe("dvosoban");
  const journey = phrases.find(phrase => phrase.id === "transport-06")!;
  expect(localizedPhrase(journey.source_ru).hints.long?.translation_sr).toBe("Koliko");
  expect(localizedPhrase(journey.source_ru).hints.take?.translation_sr).toBe("traje");
  expect(sourceWords("Нови-Сада и two-room")).toEqual(["Нови-Сада", "и", "two-room"]);
});


it("selects saved bilingual custom titles and preserves legacy fallback", () => {
  setLanguage("en");
  expect(topicText("custom-one", "Мои путешествия", "My travels")).toBe("My travels");
  expect(topicText("custom-old", "Старая тема", null)).toBe("Старая тема");
  setLanguage("ru");
  expect(topicText("custom-one", "Мои путешествия", "My travels")).toBe("Мои путешествия");
});
