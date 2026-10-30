import { getLanguage, localizedPhrase } from "./i18n";
import type { Exercise, WordHint } from "./types/training";

function matches(source: string, language: "ru" | "en"): boolean {
  const cyrillic = /[\u0400-\u052f]/u.test(source);
  return language === "ru" ? cyrillic : !cyrillic && /[a-z]/i.test(source);
}

export function exerciseSource(exercise: Exercise): { source: string; hints: Record<string, Pick<WordHint, "translation_sr">> } | undefined {
  const language = getLanguage();
  const versions = exercise.source_versions;
  let source: string;
  let hints;
  if (versions) {
    source = versions[language];
    hints = language === "en" ? versions.hints_en : versions.hints_ru;
  } else if (exercise.source_language === language && exercise.source_text) {
    source = exercise.source_text;
    hints = exercise.word_hints ?? [];
  } else if (language === "en" && exercise.source_en) {
    source = exercise.source_en;
    hints = exercise.word_hints ?? [];
  } else {
    const legacy = localizedPhrase(exercise.source_ru, exercise.source_en !== null);
    source = legacy.source;
    if (Object.keys(legacy.hints).length && matches(source, language)) return { source, hints: legacy.hints as Record<string, Pick<WordHint, "translation_sr">> };
    hints = exercise.source_hints ?? exercise.word_hints ?? [];
  }
  if (typeof source !== "string" || !source || !matches(source, language)) return undefined;
  return { source, hints: Object.fromEntries((hints ?? []).map(hint => [hint.word_ru.toLocaleLowerCase("ru-RU"), hint])) };
}
