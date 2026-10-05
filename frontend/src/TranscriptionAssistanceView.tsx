import type { TranscriptionResponse } from "./types/training";
import { displaySerbian, type SerbianAlphabet } from "./serbianScript";

export type AssistanceDraft = { response: TranscriptionResponse; selected: number[]; edited: boolean };

export function TranscriptionAssistanceView({ draft, alphabet, disabled, onToggle }: {
  draft?: AssistanceDraft; alphabet: SerbianAlphabet; disabled: boolean; onToggle: (index: number) => void;
}) {
  if (!draft) return null;
  const changes = draft.response.changes ?? [];
  if (!changes.length && !draft.response.assistance_status) return null;
  const applied = changes.filter((c, i) => c.action === "applied" && draft.selected.includes(i)).length;
  return <section className="transcription-assistance" aria-label="Мягкие подсказки">
    {draft.response.assistance_status === "unavailable" && <p role="status">Мягкие подсказки временно недоступны. Показана исходная расшифровка; можно проверить ответ или повторить запись.</p>}
    {draft.response.assistance_status === "analyzed" && <p>{changes.length ? "Найдены возможные искажения распознавания. Подтвердите подходящие варианты." : "Текст сравнен с эталоном и допустимыми вариантами. Подходящих мягких подсказок не найдено."}</p>}
    {applied > 0 && <p>Уточнено написание: {applied} слов</p>}
    {!draft.edited && changes.map((change, index) => <div key={index}>
      <div className="transcription-assistance__copy"><span>{displaySerbian(change.original, alphabet)} → {displaySerbian(change.replacement, alphabet)}</span>
        {change.explanation_ru && <p>{change.explanation_ru}</p>}
      </div>
      <button type="button" disabled={disabled} onClick={() => onToggle(index)}>
        {draft.selected.includes(index) ? "Отменить" : change.action === "applied" ? "Уточнить написание" : "Принять подсказку"}
      </button>
    </div>)}
    {draft.selected.some(i => changes[i].action === "suggested") && <p>С подсказкой — без повышения освоения. Повторите самостоятельно, чтобы закрепить фразу.</p>}
    {draft.edited && <p>Текст исправлен вручную. Подсказки больше не меняют этот ответ.</p>}
    {changes.length > 0 && <details><summary>Исходная расшифровка</summary><p>{displaySerbian(draft.response.raw_text ?? draft.response.text, alphabet)}</p></details>}
  </section>;
}
