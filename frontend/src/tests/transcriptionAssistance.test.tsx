import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { assistedText } from "../transcriptionAssistance";
import { SettingsView } from "../SettingsView";
import { TranscriptionAssistanceView } from "../TranscriptionAssistanceView";
import type { TranscriptionResponse } from "../types/training";

afterEach(() => { cleanup(); localStorage.clear(); });
const response: TranscriptionResponse = { text: "🙂 Cemu?", raw_text: "🙂 Cemu?", transcription_id: "receipt", changes: [
  { start: 2, end: 6, original: "Cemu", replacement: "Čemu", kind: "phonetic_ambiguity", action: "suggested", reason_code: "confirm_ambiguous_sound" },
] };

it("uses Unicode code point offsets without splitting emoji", () => {
  expect(assistedText(response, [])).toBe("🙂 Cemu?");
  expect(assistedText(response, [0])).toBe("🙂 Čemu?");
});
it("renders the off switch and dispatches the choice", () => {
  const onChange = vi.fn();
  render(<SettingsView alphabet="latin" onAlphabetChange={() => {}} onAssistanceChange={onChange} />);
  expect(screen.getByRole("switch")).not.toBeChecked();
  fireEvent.click(screen.getByRole("switch"));
  expect(onChange).toHaveBeenCalledWith(true);
});
it("shows only a compact suggestion, supports undo and hides edited drafts", () => {
  const toggle = vi.fn();
  const { rerender } = render(<TranscriptionAssistanceView draft={{ response, selected: [], edited: false }} alphabet="cyrillic" disabled={false} onToggle={toggle} />);
  expect(screen.getByText("Возможное искажение распознавания.")).toBeInTheDocument();
  expect(screen.getByText("Цему → Чему")).toBeInTheDocument();
  expect(screen.queryByText("🙂 Cemu?")).not.toBeInTheDocument();
  expect(screen.queryByText("Исходная расшифровка")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Принять подсказку" }));
  expect(toggle).toHaveBeenCalledWith(0);
  rerender(<TranscriptionAssistanceView draft={{ response, selected: [0], edited: false }} alphabet="latin" disabled={true} onToggle={toggle} />);
  expect(screen.getByRole("button", { name: "Отменить" })).toBeDisabled();
  expect(screen.queryByText(/С подсказкой|Уточнено написание/)).not.toBeInTheDocument();
  rerender(<TranscriptionAssistanceView draft={{ response, selected: [0], edited: true }} alphabet="latin" disabled={false} onToggle={toggle} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Мягкие подсказки" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Текст исправлен вручную/)).not.toBeInTheDocument();
});

it("leaves no assistance panel when there are no suggestions", () => {
  const { container } = render(<TranscriptionAssistanceView draft={{ response: { text: "Moj odgovor.", assistance_status: "analyzed", changes: [] }, selected: [], edited: false }} alphabet="latin" disabled={false} onToggle={() => {}} />);
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("reports failed assistance without making STT unusable", () => {
  render(<TranscriptionAssistanceView draft={{ response: { text: "Moj odgovor.", assistance_status: "unavailable" }, selected: [], edited: false }} alphabet="latin" disabled={false} onToggle={() => {}} />);
  expect(screen.getByRole("status")).toHaveTextContent("Мягкие подсказки временно недоступны");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("renders every dynamic suggestion in Cyrillic without explanations", () => {
  const dynamic: TranscriptionResponse = { text: "racun racun racun racun racun", assistance_status: "analyzed", changes: Array.from({ length: 5 }, (_, i) => ({
    start: i * 6, end: i * 6 + 5, original: "racun", replacement: "račun", kind: "phonetic_ambiguity", action: "suggested", reason_code: "confirm_ambiguous_sound", explanation_ru: `Возможна потеря диакритики ${i + 1}.`,
  })) };
  const toggle = vi.fn();
  render(<TranscriptionAssistanceView draft={{ response: dynamic, selected: [], edited: false }} alphabet="cyrillic" disabled={false} onToggle={toggle} />);
  expect(screen.getAllByText("рацун → рачун")).toHaveLength(5);
  expect(screen.queryByText(/Возможна потеря диакритики/)).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Принять подсказку" })[4]);
  expect(toggle).toHaveBeenCalledWith(4);
});


it("applies and undoes multiple suggestions independently despite changing word lengths", () => {
  const raw = "🙂 neznam racun racun";
  const changes = [["neznam", "ne znam", 2], ["racun", "račun", 9], ["racun", "račun", 15]].map(([original, replacement, start]) => ({
    start: Number(start), end: Number(start) + String(original).length, original: String(original), replacement: String(replacement),
    kind: "phonetic_ambiguity" as const, action: "suggested" as const, reason_code: "confirm_ambiguous_sound",
  }));
  function Harness() {
    const [selected, setSelected] = useState<number[]>([]);
    const response = { text: raw, changes };
    return <><output aria-label="Итоговый ответ">{assistedText(response, selected)}</output>
      <TranscriptionAssistanceView draft={{ response, selected, edited: false }} alphabet="latin" disabled={false}
        onToggle={index => setSelected(current => current.includes(index) ? current.filter(i => i !== index) : [...current, index])} /></>;
  }
  render(<Harness />);
  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(3);
  fireEvent.click(buttons[2]);
  expect(screen.getByLabelText("Итоговый ответ")).toHaveTextContent("🙂 neznam racun račun");
  fireEvent.click(buttons[0]);
  expect(screen.getByLabelText("Итоговый ответ")).toHaveTextContent("🙂 ne znam racun račun");
  fireEvent.click(buttons[1]);
  expect(screen.getByLabelText("Итоговый ответ")).toHaveTextContent("🙂 ne znam račun račun");
  fireEvent.click(buttons[0]);
  expect(screen.getByLabelText("Итоговый ответ")).toHaveTextContent("🙂 neznam račun račun");
  expect(screen.getAllByRole("button", { name: "Отменить" })).toHaveLength(2);
});
