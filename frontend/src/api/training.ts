import type { Attempt, AttemptTimings, Exercise, PreparedReviewPhrase, ReviewPhrase, TopicListItem, TrainingSession, TranscriptionResponse, WordHint } from "../types/training";
import { authenticatedFetch } from "../auth";
import { apiUrl } from "./baseUrl";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(apiUrl(url), init);
  if (!response.ok) {
    throw new BackendError(response.status);
  }
  return response.json() as Promise<T>;
}

export class BackendError extends Error {
  constructor(public readonly status: number) {
    super(`Backend returned ${status}`);
  }
}

export function fetchTopics(signal?: AbortSignal): Promise<TopicListItem[]> {
  return requestJson<TopicListItem[]>("/api/topics", { signal });
}

export function createTopic(titleRu: string): Promise<TopicListItem> {
  return requestJson<TopicListItem>("/api/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title_ru: titleRu }),
  });
}

export function createSession(input: { topic_id?: string; custom_topic_text?: string; review_phrase_id?: string; review_mode?: boolean }): Promise<TrainingSession> {
  return requestJson<TrainingSession>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, length: 10 }),
  });
}

export function fetchNextExercise(sessionId: string): Promise<Exercise> {
  return requestJson<Exercise>(`/api/sessions/${sessionId}/next-exercise`, { method: "POST" });
}

export function transcribeAudio(exerciseId: string, audio: Blob): Promise<TranscriptionResponse> {
  const form = new FormData();
  form.append("exercise_id", exerciseId);
  form.append("audio", audio, audioFilename(audio.type));
  return requestJson<TranscriptionResponse>("/api/transcriptions", {
    method: "POST",
    body: form,
  });
}

function audioFilename(contentType: string): string {
  if (contentType.includes("ogg")) return "speech.ogg";
  if (contentType.includes("mp4")) return "speech.mp4";
  return "speech.webm";
}

export function submitAttempt(
  exerciseId: string,
  transcriptSr: string,
  timing?: AttemptTimings,
  hintedWords: string[] = [],
): Promise<Attempt> {
  return requestJson<Attempt>("/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      exercise_id: exerciseId,
      transcript_sr: transcriptSr,
      reaction_ms: timing?.reaction_ms ?? null,
      speech_duration_ms: timing?.speech_duration_ms ?? null,
      longest_pause_ms: timing?.longest_pause_ms ?? null,
      pause_count: timing?.pause_count ?? null,
      timings: timing?.timings ?? {},
      hinted_words: hintedWords,
    }),
  });
}

export function fetchReviewPhrases(signal?: AbortSignal): Promise<ReviewPhrase[]> {
  return requestJson<ReviewPhrase[]>("/api/review-phrases", { signal });
}

export function prepareReviewPhrase(sourceRu: string): Promise<PreparedReviewPhrase> {
  return requestJson<PreparedReviewPhrase>("/api/review-phrases/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_ru: sourceRu }),
  });
}

export function addReviewPhrase(prepared: PreparedReviewPhrase, topicId: string): Promise<ReviewPhrase> {
  return requestJson<ReviewPhrase>("/api/review-phrases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_ru: prepared.source_ru,
      canonical_sr: prepared.canonical_sr,
      topic_id: topicId,
      intended_sr_variants: prepared.intended_sr_variants,
      word_hints: prepared.word_hints,
    }),
  });
}

export function revealWordHint(exerciseId: string, word: string): Promise<WordHint> {
  return requestJson<WordHint>(`/api/exercises/${exerciseId}/word-hints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word }),
  });
}
