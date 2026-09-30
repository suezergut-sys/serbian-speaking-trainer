import type { DailyUsage } from "./auth";

export type TopicListItem = {
  id: string;
  title_ru: string;
  description_ru: string;
  likely_intents: string[];
  suggested_vocabulary: string[];
  is_custom: boolean;
  phrase_count: number;
};

export type TopicContext = TopicListItem & {
  source: "preset" | "custom" | "general";
  target_level: "A2";
  excluded_domains: string[];
  normalized_prompt_context: string;
};

export type TrainingSession = {
  id: string;
  status: string;
  level: "A2";
  started_at: string;
  requested_length: number;
  completed_count?: number;
  topic: TopicContext;
};

export type Exercise = {
  id: string;
  session_id: string;
  source_ru: string;
  targeted_skills: string[];
  expected_level: "A2";
  difficulty: number;
  word_hints?: Array<Pick<WordHint, "word_ru" | "translation_sr">>;
};

export type StartedTraining = {
  session: TrainingSession;
  exercise: Exercise;
};

export type AnswerIssue = {
  type: "grammar" | "vocabulary" | "naturalness" | "pronunciation" | "fluency" | "meaning";
  skill_key: string;
  severity: number;
  confidence: number;
  evidence: string;
  correction: string | null;
};

export type AnswerAnalysis = {
  verdict: "correct" | "mostly_correct" | "needs_work";
  semantic_score: number;
  grammar_score: number;
  lexical_score: number;
  naturalness_score: number;
  pronunciation_score: number | null;
  fluency_score: number;
  corrected_sr: string;
  short_feedback_ru: string;
  detailed_feedback_ru: string;
  accepted_alternatives: string[];
  issues: AnswerIssue[];
  demonstrated_skills: Array<{
    skill_key: string;
    result: "strong" | "weak" | "failed";
    confidence: number;
  }>;
};

export type Attempt = {
  id: string;
  exercise_id: string;
  transcript_sr: string;
  overall_score: number;
  base_score: number;
  hint_penalty: number;
  daily_usage?: DailyUsage;
  analysis: AnswerAnalysis;
  learner_updates?: Array<{
    skill_key: string;
    title_ru: string;
    mastery: number;
    state: "LEARNING" | "CONSOLIDATING" | "MASTERED";
    attempts: number;
    next_review_at: string;
  }>;
};

export type ReviewPhrase = {
  id: string;
  source_ru: string;
  canonical_sr: string;
  topic_id: string | null;
  topic_title: string | null;
  best_score: number;
  attempts: number;
  perfect_streak: number;
  status: string;
  created_at: string;
};

export type ReviewSummary = {
  phrase_count: number;
};

export type PreparedReviewPhrase = {
  source_ru: string;
  canonical_sr: string;
  intended_sr_variants: string[];
  word_hints: Array<{ word_ru: string; translation_sr: string }>;
};

export type WordHint = {
  word_ru: string;
  translation_sr: string;
  is_learning: boolean;
};

export type AttemptTimings = {
  reaction_ms: number | null;
  speech_duration_ms: number | null;
  longest_pause_ms: number | null;
  pause_count: number | null;
  timings: Record<string, string | number | boolean | null>;
};

export type TranscriptionResponse = {
  text: string;
};
