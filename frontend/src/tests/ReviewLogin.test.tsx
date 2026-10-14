import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const login = vi.hoisted(() => vi.fn());
vi.mock("../auth", () => ({ signInReviewAccount: login }));
import { ReviewLogin } from "../ReviewLogin";
import { setLanguage } from "../i18n";
beforeEach(() => { setLanguage("en"); });
afterEach(() => { cleanup(); login.mockReset(); setLanguage("ru"); });

it("submits only entered credentials and prevents a duplicate pending request", async () => {
  let resolve!: () => void;
  login.mockReturnValue(new Promise<void>(done => { resolve = done; }));
  render(<ReviewLogin />);
  fireEvent.change(screen.getByLabelText("Username or email"), { target: { value: "serbotalkreview" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
  expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("button", { name: "Signing in…" }).closest("form")!);
  expect(login).toHaveBeenCalledExactlyOnceWith("serbotalkreview", "synthetic-password");
  await act(async () => { resolve(); });
  expect(screen.getByLabelText("Password")).toHaveValue("");
});

it("clears passwords and hides provider details on failure", async () => {
  login.mockRejectedValue(new Error("private-provider-details"));
  render(<ReviewLogin />);
  fireEvent.change(screen.getByLabelText("Username or email"), { target: { value: "serbotalkreview" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private-provider-details");
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

it("localizes review credentials and errors in Russian", async () => {
  setLanguage("ru");
  login.mockRejectedValue(new Error("synthetic"));
  render(<ReviewLogin />);
  fireEvent.change(screen.getByLabelText("Имя пользователя или email"), { target: { value: "review" } });
  fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "synthetic" } });
  fireEvent.submit(screen.getByRole("button", { name: "Войти" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось войти.");
});
