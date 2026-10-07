export type DailyPhraseCount = {
  date: string;
  phrase_count: number;
  translation_count: number;
  correct_translation_count: number;
  mastered_phrase_count: number;
};

export type MonthlyStatistics = {
  month: string;
  active_days: number;
  total_phrases: number;
  total_translations: number;
  correct_translations: number;
  mastered_phrases: number;
  days: DailyPhraseCount[];
};

export type PhraseStatisticsItem = {
  id: string;
  source_ru: string;
  target_sr: string;
  attempts: number;
  status: "learning" | "mastered";
  difficulty: "easy" | "medium" | "hard" | null;
  next_review_at: string | null;
};

export type PhraseStatistics = {
  total: number;
  page: number;
  page_size: "10" | "50" | "all";
  total_pages: number;
  groups: Array<{
    topic_id: string | null;
    topic_title: string;
    phrases: PhraseStatisticsItem[];
  }>;
};

export type PhraseStatisticsTopic = { topic_id: string | null; topic_title: string; phrase_count: number };
