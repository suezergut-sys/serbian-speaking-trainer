import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TranscriptionModelSettings } from "../TranscriptionModelSettings";
import { fetchTranscriptionModels, updateTranscriptionModel } from "../api/users";
import { setLanguage } from "../i18n";

vi.mock("../api/users", () => ({ fetchTranscriptionModels: vi.fn(), updateTranscriptionModel: vi.fn() }));
const defaults = { selected_model: null, effective_model: "env-default", default_model: "env-default", options: ["env-default", "env-alternative"] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(fetchTranscriptionModels).mockResolvedValue(defaults); });
afterEach(() => { cleanup(); setLanguage("ru"); });

it.each(["ru", "en"] as const)("loads, saves, resets and retains confirmed choice after failed save in %s", async language => {
  setLanguage(language);
  render(<TranscriptionModelSettings />);
  const select = screen.getByRole("combobox", { name: language === "en" ? "Transcription model" : "Модель распознавания" });
  expect(select).toBeDisabled();
  await waitFor(() => expect(select).toBeEnabled());
  vi.mocked(updateTranscriptionModel).mockResolvedValueOnce({ ...defaults, selected_model: "env-alternative", effective_model: "env-alternative" });
  fireEvent.change(select, { target: { value: "env-alternative" } });
  await waitFor(() => expect(select).toHaveValue("env-alternative"));
  expect(updateTranscriptionModel).toHaveBeenCalledWith("env-alternative", expect.any(AbortSignal));
  vi.mocked(updateTranscriptionModel).mockRejectedValueOnce(new Error("offline"));
  fireEvent.change(select, { target: { value: "" } });
  await screen.findByRole("alert");
  expect(select).toHaveValue("env-alternative");
  vi.mocked(updateTranscriptionModel).mockResolvedValueOnce(defaults);
  fireEvent.change(select, { target: { value: "" } });
  await waitFor(() => expect(select).toHaveValue(""));
  expect(updateTranscriptionModel).toHaveBeenLastCalledWith(null, expect.any(AbortSignal));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps an unavailable selector disabled and supports reload", async () => {
  vi.mocked(fetchTranscriptionModels).mockRejectedValueOnce(new Error("offline"));
  render(<TranscriptionModelSettings />);
  await screen.findByRole("alert");
  expect(screen.getByRole("combobox")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
  await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
});
