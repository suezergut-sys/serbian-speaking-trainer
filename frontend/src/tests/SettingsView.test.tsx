import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { SettingsView } from "../SettingsView";

afterEach(cleanup);

it("shows the current Android release number in settings", () => {
  render(<SettingsView alphabet="latin" onAlphabetChange={() => {}} />);
  const androidBuild = readFileSync(resolve(process.cwd(), "android/app/build.gradle"), "utf-8");
  const androidVersion = androidBuild.match(/versionName "([^"]+)"/)?.[1];
  expect(androidVersion).toBeDefined();
  const versionLabel = screen.getByLabelText("Версия приложения");
  expect(versionLabel).toHaveTextContent(`v.${androidVersion}`);
  expect(versionLabel.parentElement).toBe(screen.getByRole("heading", { name: "Настройки" }).parentElement);
});

it("provides an account deletion request from the profile", () => {
  render(<SettingsView alphabet="latin" onAlphabetChange={() => {}} account={{
    id: "synthetic-user", email: "review@example.com", display_name: null, avatar_url: null,
    role: "user", access_tier: "free", assistance_enabled: false, can_debug_models: false,
    registered_at: "2026-10-12T00:00:00Z", last_active_at: "2026-10-12T00:00:00Z",
    daily_usage: { used: 0, limit: 10, remaining: 10, resets_at: "2026-10-13T00:00:00Z" },
  }} />);
  expect(screen.getByRole("link", { name: "Запросить удаление аккаунта и данных" })).toHaveAttribute("href", "/delete-account");
});
