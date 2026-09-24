import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Capacitor } from "@capacitor/core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  initializeAuth: async () => ({ access_token: "test-token" }),
  isAuthConfigured: () => true,
  onAuthStateChange: () => () => undefined,
  signInWithGoogle: async () => undefined,
  signOut: async () => undefined,
}));

import App from "../App";

describe("App", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("renders public legal pages without authentication", () => {
    window.history.replaceState({}, "", "/privacy");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Политика конфиденциальности" })).toBeInTheDocument();
    expect(screen.getByText(/Записи голоса не сохраняются/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Вернуться в SerboTalk/ })).toHaveAttribute("href", "/");
  });

  function mockApi(omitLearnerUpdates = false, initialReviewPhrases: Array<Record<string, unknown>> = [], role = "user") {
    return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input.toString();
      const url = rawUrl.startsWith("http")
        ? `${new URL(rawUrl).pathname}${new URL(rawUrl).search}`
        : rawUrl;
      let body: unknown;
      if (url === "/api/health") body = { status: "ok", service: "serbian-speaking-trainer" };
      else if (url === "/api/auth/me") body = {
        id: "user-1", email: "learner@example.com", display_name: "Ученик", avatar_url: null,
        role, access_tier: "free", registered_at: "2026-09-01T10:00:00Z",
        last_active_at: "2026-09-22T10:00:00Z",
        daily_usage: { used: 2, limit: 10, remaining: 8, resets_at: "2026-09-23T00:00:00Z" },
      };
      else if (url === "/api/admin/users") body = [{
        id: "user-1", email: "learner@example.com", display_name: "Ученик", role: "admin",
        access_tier: "free", registered_at: "2026-09-01T10:00:00Z",
        last_active_at: "2026-09-22T10:00:00Z", phrases_today: 12,
      }];
      else if (url === "/api/review-phrases/prepare" && init?.method === "POST") body = {
        source_ru: "Мне нужно позвонить хозяину.", canonical_sr: "Moram da pozovem vlasnika.",
        intended_sr_variants: ["Moram da pozovem vlasnika."], word_hints: [],
      };
      else if (url === "/api/review-phrases" && init?.method === "POST") body = {
        id: "review-1", source_ru: "Мне нужно позвонить хозяину.", best_score: 0,
        canonical_sr: "Moram da pozovem vlasnika.", topic_id: "bank", topic_title: "В банке",
        attempts: 0, perfect_streak: 0, status: "active", created_at: "2026-09-17T10:00:00Z",
      };
      else if (url === "/api/review-phrases") body = initialReviewPhrases;
      else if (url === "/api/topics" && init?.method === "POST") body = {
        id: "custom-rent", title_ru: "Поговорить с арендодателем", description_ru: "Пользовательская тема без фраз.",
        likely_intents: [], suggested_vocabulary: [], is_custom: true, phrase_count: 0,
      };
      else if (url === "/api/topics") body = [{
        id: "bank", title_ru: "В банке", description_ru: "Счёт и платежи",
        likely_intents: ["открыть счёт"], suggested_vocabulary: ["račun"], is_custom: false, phrase_count: 20,
      }];
      else if (url.startsWith("/api/statistics/monthly?")) body = {
        month: "2026-09", active_days: 2, total_phrases: 12, total_translations: 12,
        correct_translations: 8, mastered_phrases: 1,
        days: Array.from({ length: 30 }, (_, index) => ({
          date: `2026-09-${String(index + 1).padStart(2, "0")}`,
          phrase_count: index === 0 ? 10 : index === 2 ? 2 : 0,
          translation_count: index === 0 ? 10 : index === 2 ? 2 : 0,
          correct_translation_count: index === 0 ? 7 : index === 2 ? 1 : 0,
          mastered_phrase_count: index === 0 ? 1 : 0,
        })),
      };
      else if (url.startsWith("/api/statistics/phrases?")) body = {
        total: 1, page: 1, page_size: "10", total_pages: 1,
        groups: [{ topic_id: "bank", topic_title: "В банке", phrases: [{
          id: "phrase-1", source_ru: "Я хочу открыть счёт.", target_sr: "Želim da otvorim račun.",
          attempts: 2, status: "mastered", difficulty: "easy", next_review_at: "2026-10-04T10:00:00Z",
        }] }],
      };
      else if (url === "/api/sessions" || url === "/api/sessions/start") {
        const request = JSON.parse(init?.body as string);
        const session = {
        id: "session-1", status: "active", level: "A2", started_at: "2026-09-16T10:00:00Z",
        requested_length: 10,
        topic: {
          id: request.review_mode ? "review-phrases" : "bank", title_ru: request.review_mode ? "Фразы для повторения" : "В банке", description_ru: "Счёт и платежи", source: request.review_mode ? "custom" : "preset",
          target_level: "A2", likely_intents: ["открыть счёт"], suggested_vocabulary: ["račun"],
          excluded_domains: [], normalized_prompt_context: "Разговор в банке",
        },
      };
        body = url.endsWith("/start") ? {
          session,
          exercise: {
            id: "exercise-1", session_id: "session-1", source_ru: "Я хочу открыть счёт.",
            targeted_skills: ["modal_verbs"], expected_level: "A2", difficulty: 1,
            word_hints: [{ word_ru: "хочу", translation_sr: "želim" }],
          },
        } : session;
      }
      else if (url.endsWith("/next-exercise")) body = {
        id: "exercise-1", session_id: "session-1", source_ru: "Я хочу открыть счёт.",
        targeted_skills: ["modal_verbs"], expected_level: "A2", difficulty: 1,
        word_hints: [{ word_ru: "хочу", translation_sr: "želim" }],
      };
      else if (url === "/api/attempts") body = {
        id: "attempt-1", exercise_id: "exercise-1", transcript_sr: "Želim da otvorim račun.", overall_score: 0.91,
        base_score: 0.91, hint_penalty: 0,
        analysis: {
          verdict: "correct", semantic_score: 0.95, grammar_score: 0.9, lexical_score: 0.9,
          naturalness_score: 0.88, pronunciation_score: null, fluency_score: 1,
          corrected_sr: "Želim da otvorim račun.", short_feedback_ru: "Ответ естественный и точный.",
          detailed_feedback_ru: "Смысл и конструкция переданы правильно.", accepted_alternatives: [], issues: [],
          demonstrated_skills: [{ skill_key: "modal_verbs", result: "strong", confidence: 0.9 }],
        },
        ...(omitLearnerUpdates ? {} : { learner_updates: [{
            skill_key: "modal_verbs", title_ru: "Модальные глаголы", mastery: 0.24,
            state: "LEARNING", attempts: 1, next_review_at: "2026-09-18T10:00:00Z",
          }]}),
      };
      else if (url.endsWith("/word-hints")) body = { word_ru: "хочу", translation_sr: "želim", is_learning: true };
      else return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    });
  }

  it("loads available topics", async () => {
    vi.stubGlobal("fetch", mockApi());

    render(<App />);

    expect(await screen.findByRole("heading", { name: /Практикуйтесь в реальных ситуациях/ })).toBeInTheDocument();
    expect(await screen.findByRole("status", { name: "Backend готов" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /В банке/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Настроить подключение" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Эмулятор:/)).not.toBeInTheDocument();
  });

  it("allows training while the review list is still loading", async () => {
    const fetchMock = mockApi();
    let finishReview!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const reviewResponse = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => {
      finishReview = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/review-phrases" ? reviewResponse : fetchMock(input, init),
    ));

    render(<App />);

    const start = await screen.findByRole("button", { name: "Начать тренировку" });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    finishReview({ ok: true, status: 200, json: async () => [] });
  });

  it("renders the native Android experience as three minimal swipe panels", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("region", { name: "Выбор темы" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Тренировка" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Статистика" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Темы" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("navigation", { name: "Основная навигация" })).not.toBeInTheDocument();
    expect(screen.queryByText("Практикуйтесь в реальных ситуациях")).not.toBeInTheDocument();
    expect(screen.queryByText("Каждый короткий разговор делает речь увереннее.")).not.toBeInTheDocument();

    const pager = screen.getByRole("region", { name: "Выбор темы" }).parentElement as HTMLElement;
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 320 });
    pager.scrollLeft = 640;
    fireEvent.scroll(pager);
    expect(screen.getByRole("button", { name: "Статистика" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(screen.getByRole("button", { name: "Тренировка" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Начать" }));
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "хочу" }));
    expect(screen.getByText("želim")).toBeInTheDocument();
    expect(screen.queryByText("Загружаем…")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.toString().endsWith("/next-exercise"))).toBe(false);
  });

  it("starts the native Android review carousel with one backend request", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    const fetchMock = mockApi(false, [{
      id: "review-1", source_ru: "Я хочу открыть счёт.", best_score: 0.8,
      attempts: 1, perfect_streak: 0, status: "active", created_at: "2026-09-17T10:00:00Z",
    }]);
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    const repeat = await screen.findByRole("button", { name: /Повторение/ });
    await waitFor(() => expect(repeat).toBeEnabled());
    fireEvent.click(repeat);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString().endsWith("/sessions/start"))).toBe(true));
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    const startCalls = fetchMock.mock.calls.filter(([url]) => url.toString().endsWith("/sessions/start"));
    expect(startCalls).toHaveLength(1);
    expect(JSON.parse(startCalls[0][1]?.body as string)).toEqual({ review_mode: true, length: 10 });
  });

  it("shows the user list only for an administrator", async () => {
    vi.stubGlobal("fetch", mockApi(false, [], "admin"));
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Пользователи/ }));
    expect(await screen.findByRole("heading", { name: "Пользователи" })).toBeInTheDocument();
    expect(await screen.findByText("learner@example.com")).toBeInTheDocument();
    expect(screen.getByText("12 · без лимита")).toBeInTheDocument();
  });

  it("shows connection settings only to an administrator", async () => {
    vi.stubGlobal("fetch", mockApi(false, [], "admin"));
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Настроить подключение" }));
    expect(screen.getByLabelText("Адрес общего backend")).toBeInTheDocument();
    expect(screen.getByText(/Эмулятор:/)).toBeInTheDocument();
  });

  it("starts a session and displays the first exercise", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(screen.getByRole("button", { name: /Начать тренировку/ }));

    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.getByText("modal_verbs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ответить голосом/ })).toBeDisabled();
    expect(screen.getByText(/Микрофон недоступен/)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/sessions/start", expect.objectContaining({ method: "POST" })));
    expect(fetchMock.mock.calls.some(([url]) => url.toString().endsWith("/next-exercise"))).toBe(false);
  });

  it("creates a persisted empty custom topic", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(await screen.findByLabelText("Своя тема"), {
      target: { value: "Поговорить с арендодателем" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать пустую тему" }));

    await waitFor(() => {
      const topicCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/topics" && init?.method === "POST");
      expect(JSON.parse(topicCall?.[1]?.body as string)).toEqual({ title_ru: "Поговорить с арендодателем" });
    });
    expect(await screen.findByRole("button", { name: /Поговорить с арендодателем/ })).toBeInTheDocument();
  });

  it("submits a Serbian answer and shows concise and expandable feedback", async () => {
    vi.stubGlobal("fetch", mockApi());
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(screen.getByRole("button", { name: /Начать тренировку/ }));
    const input = await screen.findByLabelText("Ваш ответ");
    fireEvent.change(input, { target: { value: "Želim da otvorim račun." } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));

    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    expect(screen.getByText("Канонический вариант")).toBeInTheDocument();
    expect(screen.getAllByText("Želim da otvorim račun.")).toHaveLength(2);
    expect(screen.getByLabelText("Прогресс навыков")).toHaveTextContent("Модальные глаголы");
    fireEvent.click(screen.getByText("Подробный разбор"));
    expect(screen.getByText("Смысл и конструкция переданы правильно.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Следующая фраза/ })).toBeEnabled();
  });

  it("keeps rendering a stale attempt response without learner updates", async () => {
    vi.stubGlobal("fetch", mockApi(true));
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(screen.getByRole("button", { name: /Начать тренировку/ }));
    fireEvent.change(await screen.findByLabelText("Ваш ответ"), { target: { value: "Želim da otvorim račun." } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));

    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Прогресс навыков")).not.toBeInTheDocument();
  });

  it("shows the monthly activity calendar and keeps progress as a placeholder", async () => {
    vi.stubGlobal("fetch", mockApi());
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Статистика/ }));
    expect(screen.getByRole("heading", { name: "Статистика" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Календарь занятий" })).toBeInTheDocument();
    expect(screen.getByLabelText("1: 10 переводов")).toHaveClass("is-active", "is-intensive");
    expect(screen.getByLabelText("2: 0 переводов")).not.toHaveClass("is-active");
    expect(screen.getByRole("img", { name: /График переводов/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Фразы" }));
    expect(await screen.findByRole("heading", { name: "В банке" })).toBeInTheDocument();
    expect(screen.getByText("Želim da otvorim račun.")).toBeInTheDocument();
    expect(screen.getByText("выучена")).toBeInTheDocument();
    expect(screen.getByLabelText("На странице")).toHaveValue("10");

    fireEvent.click(screen.getByRole("button", { name: /Прогресс/ }));
    expect(screen.getByRole("heading", { name: "Прогресс" })).toBeInTheDocument();
    expect(screen.getByText("Раздел в разработке")).toBeInTheDocument();
  });

  it("reveals a word translation and sends used hints with the attempt", async () => {
    const baseFetch = mockApi();
    let finishHintRequest: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith("/word-hints")) {
        return new Promise((resolve) => {
          finishHintRequest = () => resolve({ ok: true, status: 200, json: async () => ({ word_ru: "хочу", translation_sr: "želim", is_learning: true }) });
        });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(screen.getByRole("button", { name: /Начать тренировку/ }));
    fireEvent.click(await screen.findByRole("button", { name: "хочу" }));
    expect(screen.getByText("želim")).toBeInTheDocument();
    expect(screen.queryByText("Загружаем…")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ваш ответ"), { target: { value: "Želim da otvorim račun." } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await waitFor(() => {
      const attemptCall = fetchMock.mock.calls.find(([url]) => url === "/api/attempts");
      expect(JSON.parse(attemptCall?.[1]?.body as string).hinted_words).toEqual(["хочу"]);
    });
    expect(fetchMock.mock.calls.some(([url]) => url.toString().endsWith("/word-hints"))).toBe(true);
    finishHintRequest?.();
  });

  it("prepares a canonical translation and then saves the phrase into a topic", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    const input = await screen.findByLabelText("Новая фраза для повторения");
    fireEvent.change(input, { target: { value: "Мне нужно позвонить хозяину." } });
    fireEvent.click(screen.getByRole("button", { name: "Создать перевод" }));

    expect(await screen.findByText("Moram da pozovem vlasnika.")).toBeInTheDocument();
    expect(screen.getByLabelText("Тема для новой фразы")).toHaveValue("bank");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить в тему" }));

    expect(await screen.findByText("1 требуют практики")).toBeInTheDocument();
    expect(screen.queryByText("Мне нужно позвонить хозяину.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/review-phrases/prepare", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/review-phrases", expect.objectContaining({ method: "POST" }));
  });

  it("starts the review carousel immediately without expanding a phrase list", async () => {
    const phrase = {
      id: "review-1", source_ru: "Мне нужно позвонить хозяину.", best_score: 0.8,
      attempts: 1, perfect_streak: 0, status: "active", created_at: "2026-09-17T10:00:00Z",
    };
    const fetchMock = mockApi(false, [phrase]);
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await screen.findByText("1 требуют практики");
    fireEvent.click(await screen.findByRole("button", { name: /Фразы для повторения/ }));

    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.queryByLabelText("Фразы для повторения")).not.toBeInTheDocument();
    const sessionCall = fetchMock.mock.calls.find(([url]) => url === "/api/sessions/start");
    expect(JSON.parse(sessionCall?.[1]?.body as string)).toEqual({ review_mode: true, length: 10 });
  });

  it("clears the completed carousel answer before starting a regular topic", async () => {
    const phrase = {
      id: "review-1", source_ru: "Мне нужно позвонить хозяину.", best_score: 0.8,
      attempts: 1, perfect_streak: 0, status: "active", created_at: "2026-09-17T10:00:00Z",
    };
    const baseFetch = mockApi(false, [phrase]);
    let nextExerciseCalls = 0;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith("/next-exercise")) {
        nextExerciseCalls += 1;
        if (nextExerciseCalls === 1) {
          return Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: "No active review phrases" }) });
        }
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await screen.findByText("1 требуют практики");
    fireEvent.click(await screen.findByRole("button", { name: /Фразы для повторения/ }));
    expect(await screen.findByLabelText("Ваш ответ")).toBeInTheDocument();
    expect(nextExerciseCalls).toBe(0);
    fireEvent.change(await screen.findByLabelText("Ваш ответ"), { target: { value: "Stari odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    expect(await screen.findByText("Все фразы из карусели освоены. Отличная работа!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /В банке/ }));
    fireEvent.click(screen.getByRole("button", { name: /Начать тренировку/ }));

    const answer = await screen.findByLabelText("Ваш ответ");
    expect(answer).toHaveValue("");
    expect(screen.getByRole("button", { name: /Ответить голосом/ })).toBeInTheDocument();
    expect(screen.queryByText("Stari odgovor")).not.toBeInTheDocument();
  });
});
