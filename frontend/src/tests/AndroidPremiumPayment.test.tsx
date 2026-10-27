import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { PremiumView } from "../PremiumView";
import { setLanguage } from "../i18n";

vi.mock("@capacitor/browser", () => ({ Browser: { open: vi.fn() } }));
const props = { active: false, topics: [], alphabet: "latin" as const,
  onTopicCreated: vi.fn(), onChanged: vi.fn(), onDeleted: vi.fn() };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); setLanguage("ru"); });

it.each(["ru", "en"] as const)("shows only the website action for Android free accounts (%s)", async language => {
  vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
  setLanguage(language);
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  vi.mocked(Browser.open).mockResolvedValue();
  const { container } = render(<PremiumView {...props} />);
  expect(screen.getByText(language === "ru" ? "Оплатить премиум вы можете на сайте" : "You can pay for Premium on the website")).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(container.querySelector(".premium-offer, .payment-form, img, ul")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "https://serbotalk.app/" }));
  await waitFor(() => expect(Browser.open).toHaveBeenCalledExactlyOnceWith({ url: "https://serbotalk.app/" }));
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["ru", "en"] as const)("disables duplicate opens and offers retry after a browser error (%s)", async language => {
  vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
  setLanguage(language);
  let reject!: (reason: Error) => void;
  vi.mocked(Browser.open).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValue();
  render(<PremiumView {...props} />);
  const button = screen.getByRole("button", { name: "https://serbotalk.app/" });
  fireEvent.click(button); fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(Browser.open).toHaveBeenCalledTimes(1);
  reject(new Error("Synthetic browser failure"));
  expect(await screen.findByRole("alert")).toHaveTextContent(language === "ru" ? "Не удалось открыть сайт. Попробуйте ещё раз." : "Could not open the website. Please try again.");
  fireEvent.click(screen.getByRole("button", { name: "https://serbotalk.app/" }));
  await waitFor(() => expect(Browser.open).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
