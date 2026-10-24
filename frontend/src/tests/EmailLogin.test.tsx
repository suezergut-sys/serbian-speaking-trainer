import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailLogin } from "../EmailLogin";
import { setLanguage } from "../i18n";

const auth = vi.hoisted(() => ({ isEmailOtpEnabled: vi.fn(), requestEmailCode: vi.fn(), verifyEmailCode: vi.fn() }));
vi.mock("../emailAuth", () => auth);
beforeEach(() => { auth.isEmailOtpEnabled.mockReturnValue(true); auth.requestEmailCode.mockResolvedValue(undefined); auth.verifyEmailCode.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); setLanguage("ru"); });

function open(language: "ru" | "en", onSignedIn = vi.fn()) {
  setLanguage(language);
  render(<EmailLogin onSignedIn={onSignedIn} />);
  fireEvent.click(screen.getByText(language === "ru" ? "Войти по email" : "Sign in with email"));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@example.invalid" } });
  return screen.getByRole("form");
}

it.each(["ru", "en"] as const)("requests and verifies a code in %s", async language => {
  const onSignedIn = vi.fn();
  const form = open(language, onSignedIn);
  fireEvent.submit(form);
  expect(await screen.findByRole("status")).toHaveTextContent(language === "ru" ? "Код отправлен" : "Code sent");
  expect(auth.requestEmailCode).toHaveBeenCalledExactlyOnceWith("demo@example.invalid");
  expect(screen.getByLabelText("Email")).toBeDisabled();
  const code = screen.getByLabelText(language === "ru" ? "Код из письма" : "Email code");
  fireEvent.change(code, { target: { value: "12345678" } });
  fireEvent.submit(form);
  await act(async () => {});
  expect(auth.verifyEmailCode).toHaveBeenCalledExactlyOnceWith("demo@example.invalid", "12345678");
  expect(onSignedIn).toHaveBeenCalledOnce();
  expect(code).toHaveValue("");
});

it.each(["ru", "en"] as const)("hides send errors and blocks duplicate sends and resend bursts in %s", async language => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  auth.requestEmailCode.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  const form = open(language);
  fireEvent.submit(form); fireEvent.submit(form);
  expect(auth.requestEmailCode).toHaveBeenCalledOnce();
  await act(async () => { reject(new Error("private smtp details")); });
  expect(screen.getByRole("alert")).not.toHaveTextContent("private smtp details");
  expect(screen.getByRole("alert")).toHaveTextContent(language === "ru" ? "Не удалось отправить" : "Could not send");
  fireEvent.submit(form);
  expect(auth.requestEmailCode).toHaveBeenCalledOnce();
  await act(async () => { vi.advanceTimersByTime(60_000); });
  fireEvent.submit(form);
  await act(async () => {});
  expect(auth.requestEmailCode).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: language === "ru" ? "Изменить email" : "Change email" }));
  expect(screen.getByLabelText("Email")).toBeEnabled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: language === "ru" ? "Получить код" : "Get a code" })).toBeDisabled();
});

it.each(["ru", "en"] as const)("clears rejected codes and permits retry without exposing errors in %s", async language => {
  auth.verifyEmailCode.mockRejectedValueOnce(new Error("private auth details"));
  const onSignedIn = vi.fn();
  const form = open(language, onSignedIn);
  fireEvent.submit(form);
  await screen.findByRole("status");
  const code = screen.getByLabelText(language === "ru" ? "Код из письма" : "Email code");
  fireEvent.change(code, { target: { value: "12345678" } });
  fireEvent.submit(form);
  expect(await screen.findByRole("alert")).toHaveTextContent(language === "ru" ? "Код недействителен" : "The code is invalid");
  expect(screen.getByRole("alert")).not.toHaveTextContent("private auth details");
  expect(code).toHaveValue("");
  expect(onSignedIn).not.toHaveBeenCalled();
  fireEvent.change(code, { target: { value: "87654321" } });
  fireEvent.submit(form);
  await act(async () => {});
  expect(onSignedIn).toHaveBeenCalledOnce();
});

it("does not offer email login before SMTP rollout is enabled", () => {
  auth.isEmailOtpEnabled.mockReturnValue(false);
  const { container } = render(<EmailLogin />);
  expect(container).toBeEmptyDOMElement();
});
