import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LegalPage } from "../LegalPage";
import { setLanguage } from "../i18n";

afterEach(() => { cleanup(); setLanguage("ru"); });

it.each(["ru", "en"] as const)("shows the daily free allowance of 20 in %s", language => {
  setLanguage(language);
  render(<LegalPage kind="terms" />);
  expect(screen.getByText(language === "en" ? /the free allowance is 20 phrases per day/ : /бесплатный лимит — 20 фраз в сутки/)).toBeInTheDocument();
  expect(screen.queryByText(/до 10 фраз в сутки|up to 10 phrases per day/)).not.toBeInTheDocument();
});
