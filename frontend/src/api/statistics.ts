import type { MonthlyStatistics, PhraseStatistics } from "../types/statistics";
import { apiUrl } from "./baseUrl";

export async function fetchMonthlyStatistics(month: string, signal?: AbortSignal): Promise<MonthlyStatistics> {
  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const query = new URLSearchParams({
    month,
    utc_offset_minutes: String(utcOffsetMinutes),
  });
  const response = await fetch(apiUrl(`/api/statistics/monthly?${query}`), { signal });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json() as Promise<MonthlyStatistics>;
}

export async function fetchPhraseStatistics(
  page: number,
  pageSize: "10" | "50" | "all",
  signal?: AbortSignal,
): Promise<PhraseStatistics> {
  const query = new URLSearchParams({ page: String(page), page_size: pageSize });
  const response = await fetch(apiUrl(`/api/statistics/phrases?${query}`), { signal });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json() as Promise<PhraseStatistics>;
}
