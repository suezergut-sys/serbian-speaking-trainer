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
