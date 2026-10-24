import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ShareAppSettings, publicAppUrl } from "../ShareAppSettings";
import { setLanguage } from "../i18n";

const mocks = vi.hoisted(() => ({ native: false, available: false, share: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.native, isPluginAvailable: () => mocks.available } }));
vi.mock("@capacitor/share", () => ({ Share: { share: mocks.share } }));
const copy = vi.fn();
const webShare = vi.fn();
afterEach(() => {
  cleanup(); setLanguage("ru"); vi.restoreAllMocks(); vi.clearAllMocks();
  mocks.native = false; mocks.available = false;
});
function setup(language: "ru" | "en" = "ru", share = false) {
  setLanguage(language);
  vi.stubGlobal("navigator", { share: share ? webShare : undefined, clipboard: { writeText: copy } });
  copy.mockResolvedValue(undefined);
  webShare.mockResolvedValue(undefined);
  render(<ShareAppSettings />);
}
afterEach(() => vi.unstubAllGlobals());

it.each(["ru", "en"] as const)("copies the public URL when sharing is unsupported (%s)", async language => {
  setup(language);
  fireEvent.click(screen.getByRole("button", { name: language === "en" ? "Share" : "Поделиться" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(language === "en" ? "Link copied." : "Ссылка скопирована."));
  expect(copy).toHaveBeenCalledWith(publicAppUrl);
  expect(screen.getByRole("textbox")).toHaveValue("https://serbotalk.app/");
});

it.each(["ru", "en"] as const)("shares only public data in the selected language (%s)", async language => {
  setup(language, true);
  fireEvent.click(screen.getByRole("button", { name: language === "en" ? "Share" : "Поделиться" }));
  expect(webShare).toHaveBeenCalledWith({ title: "SerboTalk", url: publicAppUrl, text: language === "en" ? "Practise speaking Serbian with SerboTalk." : "Практикуйте разговорный сербский с SerboTalk." });
  await act(async () => {});
  expect(copy).not.toHaveBeenCalled();
});

it("uses the native plugin and handles its cancellation without copying", async () => {
  mocks.native = true; mocks.available = true;
  setup();
  mocks.share.mockRejectedValue(new Error("Share canceled"));
  fireEvent.click(screen.getByRole("button", { name: "Поделиться" }));
  await act(async () => {});
  expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ url: publicAppUrl, dialogTitle: "Поделиться приложением" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(copy).not.toHaveBeenCalled();
});

it("keeps browser cancellation quiet", async () => {
  setup("en", true);
  webShare.mockRejectedValue(new DOMException("Dismissed", "AbortError"));
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  await act(async () => {});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(copy).not.toHaveBeenCalled();
});

it("falls back without calling an unavailable native plugin", async () => {
  mocks.native = true;
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Поделиться" }));
  await screen.findByRole("status");
  expect(copy).toHaveBeenCalledWith(publicAppUrl);
  expect(mocks.share).not.toHaveBeenCalled();
});

it.each(["ru", "en"] as const)("allows manual copy after a share error and retries with Copy (%s)", async language => {
  setup(language, true);
  webShare.mockRejectedValue(new Error("Unavailable"));
  fireEvent.click(screen.getByRole("button", { name: language === "en" ? "Share" : "Поделиться" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(language === "en" ? "copy it manually" : "скопировать её вручную");
  expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  fireEvent.click(screen.getByRole("button", { name: language === "en" ? "Copy link" : "Скопировать ссылку" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(language === "en" ? "Link copied." : "Ссылка скопирована."));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("retains the selectable URL when clipboard access is denied", async () => {
  setup(); copy.mockRejectedValue(new Error("Denied"));
  fireEvent.click(screen.getByRole("button", { name: "Скопировать ссылку" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox")).toHaveValue(publicAppUrl);
});

it("disables both buttons while pending and prevents duplicate share requests", async () => {
  setup("en", true);
  let finish!: () => void;
  webShare.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const share = screen.getByRole("button", { name: "Share" });
  fireEvent.click(share); fireEvent.click(share);
  expect(share).toBeDisabled();
  expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Opening share menu…");
  expect(webShare).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(share).toBeEnabled();
});
