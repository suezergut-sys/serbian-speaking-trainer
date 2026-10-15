import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsView } from "../SettingsView";
import { setLanguage } from "../i18n";

afterEach(() => { cleanup(); setLanguage("ru"); });

it("shows the current Android release number in settings", () => {
  render(<SettingsView alphabet="latin" onAlphabetChange={() => {}} />);
  const androidBuild = readFileSync(resolve(process.cwd(), "android/app/build.gradle"), "utf-8");
  const androidVersion = androidBuild.match(/versionName "([^"]+)"/)?.[1];
  expect(androidVersion).toBeDefined();
  const versionLabel = screen.getByLabelText("Версия приложения");
  expect(versionLabel).toHaveTextContent(`v.${androidVersion}`);
  expect(versionLabel.parentElement).toBe(screen.getByRole("heading", { name: "Настройки" }).parentElement);
});

it.each(["ru", "en"] as const)("separates account details, sign out and deletion in %s", language => {
  setLanguage(language);
  const en = language === "en";
  const signOut = vi.fn();
  render(<SettingsView alphabet="latin" onAlphabetChange={() => {}} onSignOut={signOut} account={{
    id: "synthetic-user", email: "review@example.com", display_name: "Maksim Sumin", avatar_url: null,
    role: "user", access_tier: "free", assistance_enabled: false, can_debug_models: false,
    registered_at: "2026-10-12T00:00:00Z", last_active_at: "2026-10-12T00:00:00Z",
    daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: "2026-10-13T00:00:00Z" },
  }} />);
  const account = screen.getByRole("region", { name: en ? "Account" : "Аккаунт" });
  expect(within(account).getByText("Maksim Sumin")).toBeInTheDocument();
  expect(within(account).getByText("review@example.com")).toBeInTheDocument();
  expect(within(account).queryByRole("link")).not.toBeInTheDocument();
  fireEvent.click(within(account).getByRole("button", { name: en ? "Sign out" : "Выйти" }));
  expect(signOut).toHaveBeenCalledOnce();
  const deletion = screen.getByRole("region", { name: en ? "Account deletion" : "Удаление аккаунта" });
  expect(within(deletion).getByRole("link", { name: en ? "Request account and data deletion" : "Запросить удаление аккаунта и данных" })).toHaveAttribute("href", "/delete-account");
  expect(screen.queryByText(/По умолчанию выключено|Off by default/)).not.toBeInTheDocument();
});
