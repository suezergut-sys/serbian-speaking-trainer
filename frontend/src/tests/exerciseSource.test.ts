import { afterEach, expect, it } from "vitest";
import { setLanguage } from "../i18n";
import { exerciseSource } from "../exerciseSource";
import type { Exercise } from "../types/training";

const exercise: Exercise = { id: "p", session_id: "s", source_ru: "Я живу рядом с парком.", source_en: null,
  expected_level: "A2", targeted_skills: [], difficulty: .5,
  source_versions: { ru: "Я живу рядом с парком.", en: "I live near the park.",
    hints_ru: [{ word_ru: "парком", translation_sr: "parka" }], hints_en: [{ word_ru: "park", translation_sr: "parka" }] } };
afterEach(() => setLanguage("ru"));

it("uses independent personal sources and hints while switching RU/EN on the same prefetched exercise", () => {
  setLanguage("en");
  expect(exerciseSource(exercise)).toEqual({ source: "I live near the park.", hints: { park: { word_ru: "park", translation_sr: "parka" } } });
  setLanguage("ru");
  expect(exerciseSource(exercise)?.source).toBe(exercise.source_ru);
  expect(Object.keys(exerciseSource(exercise)!.hints)).toEqual(["парком"]);
});

it("does not leak Russian into English when a personal translation is absent", () => {
  setLanguage("en");
  expect(exerciseSource({ ...exercise, source_versions: null })).toBeUndefined();
});

it("does not leak English into Russian for an English-created personal phrase", () => {
  expect(exerciseSource({ ...exercise, source_ru: "My own phrase.", source_versions: null })).toBeUndefined();
});

it("rejects a corrupted foreign-language version instead of displaying it", () => {
  setLanguage("en");
  expect(exerciseSource({ ...exercise, source_versions: { ...exercise.source_versions!, en: exercise.source_ru } })).toBeUndefined();
});

it("uses the server English source even when it is absent from the bundled catalog", () => {
  setLanguage("en");
  expect(exerciseSource({ ...exercise, source_versions: null, source_en: "I live near the park." })?.source).toBe("I live near the park.");
});
