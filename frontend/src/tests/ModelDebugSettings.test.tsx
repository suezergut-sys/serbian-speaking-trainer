import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelDebugSettings } from "../ModelDebugSettings";
import { SettingsView } from "../SettingsView";
import { fetchModelDebug, updateModelDebug, fetchTranscriptionModels } from "../api/users";
import type { CurrentUser } from "../types/auth";
import { setLanguage } from "../i18n";

vi.mock("../api/users", () => ({ fetchModelDebug: vi.fn(), updateModelDebug: vi.fn(), fetchTranscriptionModels: vi.fn().mockResolvedValue({ options: [], selected_model: null }), updateTranscriptionModel: vi.fn() }));

describe("administrator model debug settings", () => {
  afterEach(() => { cleanup(); setLanguage("ru"); });
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(fetchModelDebug).mockResolvedValue({ enabled: false }); vi.mocked(fetchTranscriptionModels).mockResolvedValue({ options: [], selected_model: null, effective_model: null, default_model: null }); });

  it("loads persisted mode and confirms enabling/disabling with server", async () => {
    vi.mocked(updateModelDebug).mockImplementation(async enabled => ({ enabled }));
    render(<ModelDebugSettings />);
    const toggle = screen.getByRole("switch", { name: "Режим отладки" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(updateModelDebug).toHaveBeenCalledWith(true, expect.any(AbortSignal));
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(updateModelDebug).toHaveBeenLastCalledWith(false, expect.any(AbortSignal));
    expect(screen.getByText(/При выключении все логи и аудио/)).toBeInTheDocument();
    expect(screen.getByText(/последние 20 аудиозаписей/)).toBeInTheDocument();
    expect(screen.getByText(/аудио для диагностики распознавания/)).toBeInTheDocument();
  });

  it("does not change confirmed state on failed disable and permits retry", async () => {
    vi.mocked(fetchModelDebug).mockResolvedValue({ enabled: true });
    vi.mocked(updateModelDebug).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ enabled: false });
    render(<ModelDebugSettings />);
    const toggle = screen.getByRole("switch");
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);
    await screen.findByRole("alert");
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it("keeps toggle disabled on load failure, then supports reloading", async () => {
    vi.mocked(fetchModelDebug).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ enabled: true });
    render(<ModelDebugSettings />);
    await screen.findByRole("alert");
    expect(screen.getByRole("switch")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
  });

  it.each(["ru", "en"] as const)("shows the concise debug copy in %s", async language => {
    setLanguage(language);
    render(<ModelDebugSettings />);
    const en = language === "en";
    const toggle = screen.getByRole("switch", { name: en ? "Debug mode" : "Режим отладки" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(screen.getByText(en
      ? "Save model requests and responses for your account, exact timestamps, durations and audio in the database for transcription diagnostics."
      : "Сохранять в БД запросы и ответы моделей вашего аккаунта, точное время, длительность и аудио для диагностики распознавания.")).toBeInTheDocument();
    expect(screen.getByText(en
      ? "The last 20 audio recordings are stored temporarily. Turning debug off deletes all logs and audio from the database."
      : "Временно хранятся последние 20 аудиозаписей. При выключении все логи и аудио удаляются из БД.")).toBeInTheDocument();
    expect(screen.queryByText(/Через 7 дней|After 7 days|Ключи доступа|Access keys/)).not.toBeInTheDocument();
  });

  it.each([ ["user", false], ["admin", false], ["user", true], ["admin", true] ] as const)("requires server capability and admin role (%s, %s)", async (role, allowed) => {
    const account = { id: "maxim", email: "suezergut@gmail.com", display_name: "Максим Сумин", role,
      can_debug_models: allowed, daily_usage: { used: 0, limit: null, remaining: null } } as CurrentUser;
    render(<SettingsView alphabet="latin" onAlphabetChange={() => {}} account={account} />);
    if (role === "admin" && allowed) {
      await waitFor(() => expect(fetchModelDebug).toHaveBeenCalledOnce());
      expect(screen.getByRole("switch", { name: "Режим отладки" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("switch", { name: "Режим отладки" })).not.toBeInTheDocument();
      expect(fetchModelDebug).not.toHaveBeenCalled();
    }
  });
});
