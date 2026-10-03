import type { TranscriptionResponse } from "./types/training";

export function readAssistance(userId: string): boolean {
  try { return localStorage.getItem(`serbotalk.soft-assistance.${userId}`) === "true"; }
  catch { return false; }
}

export function saveAssistance(userId: string, enabled: boolean): void {
  try { localStorage.setItem(`serbotalk.soft-assistance.${userId}`, String(enabled)); }
  catch { /* Keep the session choice when storage is unavailable. */ }
}

export function assistedText(response: TranscriptionResponse, selected: number[]): string {
  const characters = Array.from(response.raw_text ?? response.text);
  for (let i = (response.changes?.length ?? 0) - 1; i >= 0; i--) {
    const change = response.changes![i];
    if (selected.includes(i)) characters.splice(change.start, change.end - change.start, ...Array.from(change.replacement));
  }
  return characters.join("");
}
