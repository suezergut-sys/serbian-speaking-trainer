import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminUsersView } from "../AdminUsersView";
import { fetchAdminUsers } from "../api/users";
import { setLanguage } from "../i18n";
vi.mock("../api/users", () => ({ fetchAdminUsers: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); setLanguage("ru"); });
it.each(["ru", "en"] as const)("shows premium role and server-provided limits (%s)", async language => {
  setLanguage(language);
  vi.mocked(fetchAdminUsers).mockResolvedValue([
    { id: "premium", email: "premium@example.invalid", display_name: null, role: "user", access_tier: "premium", daily_limit: 73, phrases_today: 12, registered_at: "2026-10-01", last_active_at: "2026-10-24" },
    { id: "free", email: "free@example.invalid", display_name: null, role: "user", access_tier: "free", daily_limit: 20, phrases_today: 3, registered_at: "2026-10-01", last_active_at: "2026-10-24" },
    { id: "admin", email: "admin@example.invalid", display_name: null, role: "admin", access_tier: "premium", daily_limit: null, phrases_today: 9, registered_at: "2026-10-01", last_active_at: "2026-10-24" },
  ]);
  render(<AdminUsersView />);
  const premium = (await screen.findByText("premium@example.invalid")).closest("tr")!;
  expect(within(premium).getByText(language === "ru" ? "Премиум пользователь" : "Premium user")).toBeInTheDocument();
  expect(within(premium).getByText("12 / 73")).toBeInTheDocument();
  expect(within(premium).queryByText(/без лимита|unlimited/)).not.toBeInTheDocument();
  expect(screen.getByText("3 / 20")).toBeInTheDocument();
  expect(screen.getByText(language === "ru" ? "9 · без лимита" : "9 · unlimited")).toBeInTheDocument();
});
