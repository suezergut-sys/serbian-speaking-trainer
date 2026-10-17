import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LandingLogin } from "../LandingLogin";
import { setLanguage } from "../i18n";

const auth = vi.hoisted(() => ({ initializeAuth: vi.fn(), onAuthStateChange: vi.fn(), signInWithGoogle: vi.fn(), isAuthConfigured: vi.fn() }));
vi.mock("../auth", () => auth);
beforeEach(() => {
  auth.initializeAuth.mockResolvedValue(null);
  auth.onAuthStateChange.mockReturnValue(vi.fn());
  auth.isAuthConfigured.mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); setLanguage("ru"); localStorage.clear(); });

it.each(["ru", "en"] as const)("offers embedded sign-in with busy and safe retry states in %s", async language => {
  setLanguage(language);
  auth.signInWithGoogle.mockRejectedValueOnce(new Error("private SDK error"));
  render(<LandingLogin />);
  const button = await screen.findByRole("button", { name: language === "ru" ? "Войти через Google" : "Sign in with Google" });
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private SDK error");
  expect(button).toBeEnabled();
  expect(auth.signInWithGoogle).toHaveBeenCalledWith("/app");
});

it("offers the trainer directly for a restored session", async () => {
  auth.initializeAuth.mockResolvedValue({ access_token: "synthetic" });
  render(<LandingLogin />);
  expect(await screen.findByRole("link", { name: /Продолжить тренировку/ })).toHaveAttribute("href", "/app");
  expect(screen.queryByRole("button", { name: "Войти через Google" })).not.toBeInTheDocument();
});

it("handles restore failure without hiding sign-in", async () => {
  auth.initializeAuth.mockRejectedValue(new Error("private"));
  render(<LandingLogin />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось восстановить вход.");
  expect(screen.getByRole("button", { name: "Войти через Google" })).toBeEnabled();
});

it("disables sign-in when configuration is unavailable", async () => {
  auth.isAuthConfigured.mockReturnValue(false);
  render(<LandingLogin />);
  expect(await screen.findByRole("button", { name: "Войти через Google" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Вход временно недоступен.");
});
