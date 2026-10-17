import type { MonthlyStatistics, PhraseStatistics } from "../types/statistics";
import { authenticatedFetch } from "../auth";
import { apiUrl } from "./baseUrl";

export async function fetchMonthlyStatistics(month: string, signal?: AbortSignal): Promise<MonthlyStatistics> {
  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const query = new URLSearchParams({
    month,
    utc_offset_minutes: String(utcOffsetMinutes),
  });
  const response = await authenticatedFetch(apiUrl(`/api/statistics/monthly?${query}`), { signal });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json() as Promise<MonthlyStatistics>;
}

export async function fetchPhraseStatistics(
  page: number,
  pageSize: "10" | "20" | "50" | "all",
  signal?: AbortSignal,
  topicId?: string,
): Promise<PhraseStatistics> {
  const query = new URLSearchParams({ page: String(page), page_size: pageSize });
  if (topicId) query.set("topic_id", topicId);
  const response = await authenticatedFetch(apiUrl(`/api/statistics/phrases?${query}`), { signal });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json() as Promise<PhraseStatistics>;
}

export async function fetchPhraseTopics(signal?: AbortSignal): Promise<import("../types/statistics").PhraseStatisticsTopic[]> {
  const response = await authenticatedFetch(apiUrl("/api/statistics/phrase-topics"), { signal });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json();
}
