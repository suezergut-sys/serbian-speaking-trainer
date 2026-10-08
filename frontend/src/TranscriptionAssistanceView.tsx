import type { TranscriptionResponse } from "./types/training";
import { displaySerbian, type SerbianAlphabet } from "./serbianScript";

export type AssistanceDraft = { response: TranscriptionResponse; selected: number[]; edited: boolean };

export function TranscriptionAssistanceView({ draft, alphabet, disabled, onToggle }: {
  draft?: AssistanceDraft; alphabet: SerbianAlphabet; disabled: boolean; onToggle: (index: number) => void;
}) {
  if (!draft) return null;
  const changes = draft.response.changes ?? [];
  if ((draft.edited || !changes.length) && draft.response.assistance_status !== "unavailable") return null;
  return <section className="transcription-assistance" aria-label="Мягкие подсказки">
    {draft.response.assistance_status === "unavailable" && <p role="status">Мягкие подсказки временно недоступны. Показана исходная расшифровка; можно проверить ответ или повторить запись.</p>}
    {!draft.edited && changes.length > 0 && <p>Возможное искажение распознавания.</p>}
    {!draft.edited && changes.map((change, index) => <div className="transcription-assistance__change" key={index}>
      <div className="transcription-assistance__copy"><span>{displaySerbian(change.original, alphabet)} → {displaySerbian(change.replacement, alphabet)}</span>
      </div>
      <button type="button" disabled={disabled} onClick={() => onToggle(index)}>
        {draft.selected.includes(index) ? "Отменить" : "Принять подсказку"}
      </button>
    </div>)}
  </section>;
}
