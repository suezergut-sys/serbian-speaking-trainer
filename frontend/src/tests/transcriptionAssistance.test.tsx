import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { assistedText } from "../transcriptionAssistance";
import { SettingsView } from "../SettingsView";
import { TranscriptionAssistanceView } from "../TranscriptionAssistanceView";
import type { TranscriptionResponse } from "../types/training";

afterEach(() => localStorage.clear());
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
it("suggests explicitly, shows raw text and locks edited drafts", () => {
  const toggle = vi.fn();
  const { rerender } = render(<TranscriptionAssistanceView draft={{ response, selected: [], edited: false }} alphabet="cyrillic" disabled={false} onToggle={toggle} />);
  fireEvent.click(screen.getByRole("button", { name: "Принять подсказку" }));
  expect(toggle).toHaveBeenCalledWith(0);
  rerender(<TranscriptionAssistanceView draft={{ response, selected: [0], edited: true }} alphabet="latin" disabled={false} onToggle={toggle} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText(/С подсказкой/)).toBeInTheDocument();
  expect(screen.getByText("🙂 Cemu?")).toBeInTheDocument();
});

it("shows analysis completion even when no hypotheses are appropriate", () => {
  render(<TranscriptionAssistanceView draft={{ response: { text: "Moj odgovor.", assistance_status: "analyzed", changes: [] }, selected: [], edited: false }} alphabet="latin" disabled={false} onToggle={() => {}} />);
  expect(screen.getByText(/Текст сравнен с эталоном/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("reports failed assistance without making STT unusable", () => {
  render(<TranscriptionAssistanceView draft={{ response: { text: "Moj odgovor.", assistance_status: "unavailable" }, selected: [], edited: false }} alphabet="latin" disabled={false} onToggle={() => {}} />);
  expect(screen.getByRole("status")).toHaveTextContent("Мягкие подсказки временно недоступны");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("renders every dynamic suggestion with its explanation and Cyrillic display", () => {
  const dynamic: TranscriptionResponse = { text: "racun racun racun racun racun", assistance_status: "analyzed", changes: Array.from({ length: 5 }, (_, i) => ({
    start: i * 6, end: i * 6 + 5, original: "racun", replacement: "račun", kind: "phonetic_ambiguity", action: "suggested", reason_code: "confirm_ambiguous_sound", explanation_ru: `Возможна потеря диакритики ${i + 1}.`,
  })) };
  const toggle = vi.fn();
  render(<TranscriptionAssistanceView draft={{ response: dynamic, selected: [], edited: false }} alphabet="cyrillic" disabled={false} onToggle={toggle} />);
  expect(screen.getAllByText("рацун → рачун")).toHaveLength(5);
  expect(screen.getByText("Возможна потеря диакритики 5.")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Принять подсказку" })[4]);
  expect(toggle).toHaveBeenCalledWith(4);
});
