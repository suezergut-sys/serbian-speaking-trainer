import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LandingPage } from "../LandingPage";
import { setLanguage } from "../i18n";

afterEach(() => { cleanup(); setLanguage("ru"); localStorage.clear(); });

it("presents the creator story, real web destination and an honest Play placeholder", () => {
  render(<LandingPage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Пора заговорить.");
  expect(screen.getByText(/Я создал SerboTalk, потому что/)).toHaveTextContent("Duolingo");
  expect(screen.getAllByRole("link", { name: /Начать говорить/ })[0]).toHaveAttribute("href", "#sign-in");
  expect(screen.getByText("Ссылка появится после публикации")).toBeInTheDocument();
  expect(screen.getAllByRole("img", { name: /SerboTalk:/ })).toHaveLength(4);
  expect(screen.getByRole("img", { name: "SerboTalk: статистика занятий" })).toHaveAttribute("src", "/landing/screens/phone/ru-statistics.jpg");
  expect(screen.queryByText("Знакомые слова")).not.toBeInTheDocument();
  expect(screen.queryByText("Скриншоты мобильной веб-версии. Показаны демонстрационные данные.")).not.toBeInTheDocument();
});

it("switches copy, metadata and screenshot locale together, and restores Russian", () => {
  render(<LandingPage />);
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Now speak them.");
  expect(screen.getByText(/I created SerboTalk because/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("img", { name: "SerboTalk: speaking practice" })).toHaveAttribute("src", "/landing/screens/phone/en-practice.jpg");
  expect(screen.getByRole("img", { name: "SerboTalk: practice statistics" })).toHaveAttribute("src", "/landing/screens/phone/en-statistics.jpg");
  expect(document.title).toBe("SerboTalk — start speaking Serbian");
  fireEvent.click(screen.getByRole("button", { name: "RU" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Пора заговорить.");
});
