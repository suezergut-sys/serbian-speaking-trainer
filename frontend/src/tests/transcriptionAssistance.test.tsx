import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { assistedText, readAssistance, saveAssistance } from "../transcriptionAssistance";
import { SettingsView } from "../SettingsView";
import { TranscriptionAssistanceView } from "../TranscriptionAssistanceView";
import type { TranscriptionResponse } from "../types/training";

afterEach(() => localStorage.clear());
const response: TranscriptionResponse = { text: "🙂 Cemu?", raw_text: "🙂 Cemu?", transcription_id: "receipt", changes: [
  { start: 2, end: 6, original: "Cemu", replacement: "Čemu", kind: "phonetic_ambiguity", action: "suggested", reason_code: "confirm_ambiguous_sound" },
] };

it("defaults off and isolates preference by account", () => {
  expect(readAssistance("new")).toBe(false);
  saveAssistance("one", true);
  expect(readAssistance("one")).toBe(true);
  expect(readAssistance("two")).toBe(false);
  saveAssistance("one", false);
  expect(readAssistance("one")).toBe(false);
});
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
