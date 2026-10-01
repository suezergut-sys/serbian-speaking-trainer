import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeferredPanel } from "../DeferredPanel";

describe("DeferredPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows an accessible loading state until a slow module is ready", async () => {
    let resolveModule!: (module: { default: () => React.ReactNode }) => void;
    const load = vi.fn(() => new Promise<{ default: () => React.ReactNode }>((resolve) => { resolveModule = resolve; }));
    render(<DeferredPanel load={load} panelProps={{}} label="статистику" />);

    expect(screen.getByRole("status")).toHaveTextContent("Загружаем статистику…");
    await act(async () => resolveModule({ default: () => <h1>Статистика</h1> }));
    expect(screen.getByRole("heading", { name: "Статистика" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("calls the loader again after a failed module request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValueOnce({ default: () => <h1>Пользователи</h1> });
    render(<DeferredPanel load={load} panelProps={{}} label="пользователей" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось открыть раздел");
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByRole("heading", { name: "Пользователи" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
