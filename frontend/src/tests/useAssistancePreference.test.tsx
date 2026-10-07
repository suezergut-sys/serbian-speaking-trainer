import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAssistancePreference } from "../useAssistancePreference";
import { SettingsView } from "../SettingsView";
import { fetchPreferences, updatePreferences } from "../api/users";

vi.mock("../api/users", () => ({ fetchPreferences: vi.fn(), updatePreferences: vi.fn() }));

function Client() {
  const preference = useAssistancePreference(false);
  return <SettingsView alphabet="latin" onAlphabetChange={() => undefined}
    assistanceEnabled={preference.enabled} assistanceSaving={preference.saving}
    assistanceError={preference.error} onAssistanceChange={value => { void preference.change(value); }} />;
}

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });

describe("shared assistance preference", () => {
  it("loads the server choice and confirms both on and off writes", async () => {
    vi.mocked(fetchPreferences).mockResolvedValue({ assistance_enabled: true });
    vi.mocked(updatePreferences).mockImplementation(async value => ({ assistance_enabled: value }));
    render(<Client />);
    const toggle = screen.getByRole("switch");
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(updatePreferences).toHaveBeenCalledWith(false, expect.any(AbortSignal));
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(updatePreferences).toHaveBeenCalledWith(true, expect.any(AbortSignal));
  });

  it("syncs two open clients in both directions on focus", async () => {
    let server = false;
    vi.mocked(fetchPreferences).mockImplementation(async () => ({ assistance_enabled: server }));
    vi.mocked(updatePreferences).mockImplementation(async value => { server = value; return { assistance_enabled: server }; });
    render(<><Client /><Client /></>);
    await waitFor(() => expect(fetchPreferences).toHaveBeenCalledTimes(2));
    const [web, android] = screen.getAllByRole("switch");
    fireEvent.click(android);
    await waitFor(() => expect(android).toBeChecked());
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(web).toBeChecked());
    fireEvent.click(web);
    await waitFor(() => expect(web).not.toBeChecked());
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(android).not.toBeChecked());
  });

  it("keeps the confirmed choice and shows an error on a failed save", async () => {
    vi.mocked(fetchPreferences).mockResolvedValue({ assistance_enabled: false });
    vi.mocked(updatePreferences).mockRejectedValue(new Error("offline"));
    render(<Client />);
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось сохранить настройку");
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByRole("switch")).toBeEnabled();
  });

  it("ignores a refresh started before a confirmed change", async () => {
    let finish!: (value: { assistance_enabled: boolean }) => void;
    vi.mocked(fetchPreferences).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    vi.mocked(updatePreferences).mockResolvedValue({ assistance_enabled: true });
    render(<Client />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
    await act(async () => finish({ assistance_enabled: false }));
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("refreshes periodically while open and aborts on unmount", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchPreferences).mockResolvedValue({ assistance_enabled: false });
    const rendered = render(<Client />);
    await act(async () => undefined);
    vi.mocked(fetchPreferences).mockResolvedValue({ assistance_enabled: true });
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByRole("switch")).toBeChecked();
    vi.mocked(fetchPreferences).mockReturnValue(new Promise(() => undefined));
    await act(async () => { vi.advanceTimersByTime(15_000); });
    const signal = vi.mocked(fetchPreferences).mock.calls.at(-1)![0];
    rendered.unmount();
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
