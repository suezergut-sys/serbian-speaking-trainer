import type { TranscriptionResponse } from "./types/training";
import { displaySerbian, type SerbianAlphabet } from "./serbianScript";

export type AssistanceDraft = { response: TranscriptionResponse; selected: number[]; edited: boolean };

export function TranscriptionAssistanceView({ draft, alphabet, disabled, onToggle }: {
  draft?: AssistanceDraft; alphabet: SerbianAlphabet; disabled: boolean; onToggle: (index: number) => void;
}) {
  if (!draft || !draft.response.changes?.length) return null;
  const applied = draft.response.changes.filter((c, i) => c.action === "applied" && draft.selected.includes(i)).length;
  return <section className="transcription-assistance" aria-label="Мягкие подсказки">
    {applied > 0 && <p>Уточнено написание: {applied} слов</p>}
    {!draft.edited && draft.response.changes.map((change, index) => <div key={index}>
      <span>{displaySerbian(change.original, alphabet)} → {displaySerbian(change.replacement, alphabet)}</span>
      <button type="button" disabled={disabled} onClick={() => onToggle(index)}>
        {draft.selected.includes(index) ? "Отменить" : change.action === "applied" ? "Уточнить написание" : "Принять подсказку"}
      </button>
    </div>)}
    {draft.selected.some(i => draft.response.changes![i].action === "suggested") && <p>С подсказкой — без повышения освоения. Повторите самостоятельно, чтобы закрепить фразу.</p>}
    {draft.edited && <p>Текст исправлен вручную. Подсказки больше не меняют этот ответ.</p>}
    <details><summary>Исходная расшифровка</summary><p>{displaySerbian(draft.response.raw_text ?? draft.response.text, alphabet)}</p></details>
  </section>;
}
