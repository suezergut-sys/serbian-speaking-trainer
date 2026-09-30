import type { Attempt, AttemptTimings, Exercise, PreparedReviewPhrase, ReviewPhrase, ReviewSummary, StartedTraining, TopicListItem, TranscriptionResponse, WordHint } from "../types/training";
import { authenticatedFetch } from "../auth";
import { apiUrl } from "./baseUrl";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  init?.signal?.addEventListener("abort", onAbort, { once: true });
  if (init?.signal?.aborted) controller.abort();
  const timeout = window.setTimeout(() => controller.abort(), url === "/api/transcriptions" ? 45_000 : 30_000);
  try {
    const response = await authenticatedFetch(apiUrl(url), { ...init, signal: controller.signal });
    if (!response.ok) {
      let detail: unknown;
      try { detail = (await response.json()).detail; } catch { /* Invalid error body. */ }
      throw new BackendError(response.status, detail);
    }
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", onAbort);
  }
}

export class BackendError extends Error {
  readonly code?: string;
  readonly retryable?: boolean;
  constructor(public readonly status: number, public readonly detail?: unknown) {
    super(typeof detail === "object" && detail !== null && "message" in detail && typeof detail.message === "string" ? detail.message : `Backend returned ${status}`);
    if (typeof detail === "object" && detail !== null) {
      if ("code" in detail && typeof detail.code === "string") this.code = detail.code;
      if ("retryable" in detail && typeof detail.retryable === "boolean") this.retryable = detail.retryable;
    }
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

export function startTrainingSession(input: { topic_id?: string; custom_topic_text?: string; review_phrase_id?: string; review_mode?: boolean }, signal?: AbortSignal): Promise<StartedTraining> {
  return requestJson<StartedTraining>("/api/sessions/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, length: 10 }),
    signal,
  });
}

export function fetchNextExercise(sessionId: string, clientRequestId: string, signal?: AbortSignal): Promise<Exercise> {
  return requestJson<Exercise>(`/api/sessions/${sessionId}/next-exercise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_request_id: clientRequestId }),
    signal,
  });
}

export function transcribeAudio(exerciseId: string, audio: Blob, signal?: AbortSignal): Promise<TranscriptionResponse> {
  const form = new FormData();
  form.append("exercise_id", exerciseId);
  form.append("audio", audio, audioFilename(audio.type));
  return requestJson<TranscriptionResponse>("/api/transcriptions", {
    method: "POST",
    body: form,
    signal,
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
  clientRequestId?: string,
  signal?: AbortSignal,
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
      client_request_id: clientRequestId,
    }),
    signal,
  });
}

export function fetchReviewPhrases(signal?: AbortSignal): Promise<ReviewPhrase[]> {
  return requestJson<ReviewPhrase[]>("/api/review-phrases", { signal });
}

export function fetchReviewSummary(signal?: AbortSignal): Promise<ReviewSummary> {
  return requestJson<ReviewSummary>("/api/review-phrases/summary", { signal });
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

export function revealWordHint(exerciseId: string, word: string, signal?: AbortSignal): Promise<WordHint> {
  return requestJson<WordHint>(`/api/exercises/${exerciseId}/word-hints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word }),
    signal,
  });
}
