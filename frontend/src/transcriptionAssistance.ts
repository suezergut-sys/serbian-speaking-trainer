import type { TranscriptionResponse } from "./types/training";

export function assistedText(response: TranscriptionResponse, selected: number[]): string {
  const characters = Array.from(response.raw_text ?? response.text);
  for (let i = (response.changes?.length ?? 0) - 1; i >= 0; i--) {
    const change = response.changes![i];
    if (selected.includes(i)) characters.splice(change.start, change.end - change.start, ...Array.from(change.replacement));
  }
  return characters.join("");
}
