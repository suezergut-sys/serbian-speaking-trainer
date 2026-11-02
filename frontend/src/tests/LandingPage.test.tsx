import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LandingPage } from "../LandingPage";
import { setLanguage } from "../i18n";

afterEach(() => { cleanup(); setLanguage("ru"); localStorage.clear(); });

it("presents the creator story, web sign-in and live Google Play testing links", () => {
  render(<LandingPage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Пора заговорить.");
  expect(screen.getByText(/Я создал SerboTalk, потому что/)).toHaveTextContent("Duolingo");
  expect(screen.getAllByRole("link", { name: /Начать говорить/ })[0]).toHaveAttribute("href", "#sign-in");
  const playLinks = screen.getAllByRole("link", { name: "Google Play Открытое тестирование" });
  expect(playLinks).toHaveLength(2);
  for (const link of playLinks) {
    expect(link).toHaveAttribute("href", "https://play.google.com/apps/testing/com.serbiantalk.trainer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  expect(screen.queryByText("Ссылка появится после публикации")).not.toBeInTheDocument();
  expect(screen.getByText("Присоединитесь к открытому тестированию, затем установите приложение из Google Play.")).toBeInTheDocument();
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
  expect(screen.getAllByRole("link", { name: "Google Play Open testing" })).toHaveLength(2);
  expect(screen.getByText("Join the open test, then install the app from Google Play.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "RU" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Пора заговорить.");
});
