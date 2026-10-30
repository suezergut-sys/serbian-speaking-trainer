import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { PremiumView } from "../PremiumView";
import { setLanguage } from "../i18n";

const props = { topics: [], alphabet: "latin" as const,
  onTopicCreated: vi.fn(), onChanged: vi.fn(), onDeleted: vi.fn() };
afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage("ru"); });

it.each(["ru", "en"] as const)("never offers payment on Android, including recovery (%s)", language => {
  vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
  setLanguage(language);
  const { container, rerender } = render(<PremiumView {...props} active={false} />);
  expect(screen.getByRole("status")).toHaveTextContent(language === "ru" ? "Восстанавливаем доступ Premium…" : "Restoring Premium access…");
  expect(container.querySelector("a, button, .payment-form, .premium-offer")).toBeNull();
  rerender(<PremiumView {...props} active />);
  expect(screen.getByRole("button", { name: language === "ru" ? "Создать тему" : "Create topic" })).toBeInTheDocument();
  expect(container.querySelector(".payment-form, .premium-offer")).toBeNull();
  expect(container).not.toHaveTextContent(/оплат|платёж|купить|payment|pay for|buy/i);
});
