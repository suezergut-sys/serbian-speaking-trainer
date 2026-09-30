import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Capacitor } from "@capacitor/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const authEvents = vi.hoisted(() => ({
  notify: undefined as undefined | ((session: { access_token: string } | null) => void),
}));
const voiceMock = vi.hoisted(() => ({ available: false }));

vi.mock("../voiceRecorder", () => ({
  supportsVoiceRecording: () => voiceMock.available,
  VoiceRecorder: class {
    async start() { return undefined; }
    async finish() {
      return {
        audio: new Blob([], { type: "audio/webm" }),
        timing: { reaction_ms: null, speech_duration_ms: 1000, longest_pause_ms: null, pause_count: null, timings: { source: "test" } },
      };
    }
    stop() { return undefined; }
  },
}));

vi.mock("../auth", () => ({
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  initializeAuth: async () => ({ access_token: "test-token" }),
  isAuthConfigured: () => true,
  onAuthStateChange: (callback: (session: { access_token: string } | null) => void) => {
    authEvents.notify = callback;
    return () => { authEvents.notify = undefined; };
  },
  signInWithGoogle: async () => undefined,
  signOut: async () => undefined,
}));

import App from "../App";

describe("App", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    voiceMock.available = false;
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
      else if (url === "/api/transcriptions") body = { text: "Želim da otvorim račun." };
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
      else if (url.startsWith("/api/statistics/monthly?")) {
        const month = new URLSearchParams(url.split("?")[1]).get("month")!;
        const today = new Date();
        const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
        const mondayKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
        const [year, monthNumber] = month.split("-").map(Number);
        body = {
          month, active_days: 1, total_phrases: 10, total_translations: 10,
          correct_translations: 7, mastered_phrases: 1,
          days: Array.from({ length: new Date(year, monthNumber, 0).getDate() }, (_, index) => {
            const date = `${month}-${String(index + 1).padStart(2, "0")}`;
            const active = date === mondayKey;
            return { date, phrase_count: active ? 10 : 0, translation_count: active ? 10 : 0,
              correct_translation_count: active ? 7 : 0, mastered_phrase_count: active ? 1 : 0 };
          }),
        };
      }
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

  async function recordAnswer() {
    fireEvent.click(await screen.findByRole("button", { name: "Ответить голосом" }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    return screen.findByLabelText("Ваш ответ");
  }

  it("loads available topics", async () => {
    vi.stubGlobal("fetch", mockApi());

    render(<App />);
    expect(screen.getByRole("status", { name: "Авторизация и загрузка" }).closest(".auth-page--loading")).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "Темы для практики" })).toBeInTheDocument();
    expect(screen.queryByText("Анализ ответа")).not.toBeInTheDocument();
    expect(await screen.findByRole("status", { name: "Backend готов" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /В банке/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /В банке.*20.*неизученных/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Настроить подключение" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Эмулятор:/)).not.toBeInTheDocument();
  });

  it("does not reload the profile for a repeated auth event with the same token", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByRole("button", { name: /В банке/ });

    await act(async () => { authEvents.notify?.({ access_token: "test-token" }); });

    expect(fetchMock.mock.calls.filter(([url]) => url.toString() === "/api/auth/me")).toHaveLength(1);
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

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    finishReview({ ok: true, status: 200, json: async () => [] });
  });

  it("reports an initial topics timeout as an offline backend", async () => {
    const baseFetch = mockApi();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/topics" ? Promise.reject(new DOMException("timeout", "AbortError")) : baseFetch(input, init)));
    render(<App />);
    expect(await screen.findByRole("status", { name: "Backend недоступен" })).toBeInTheDocument();
  });

  it("shows phrase preparation while a selected topic starts", async () => {
    const baseFetch = mockApi();
    let finishStart!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingStart = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishStart = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/sessions/start" ? pendingStart : baseFetch(input, init),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(screen.getByRole("status", { name: "Подготовка фразы" })).toHaveTextContent("Подготовка фразы");
    expect(screen.queryByRole("button", { name: "Начать тренировку" })).not.toBeInTheDocument();
    const response = await baseFetch("/api/sessions/start", { method: "POST", body: JSON.stringify({ topic_id: "bank" }) });
    finishStart(response);
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
  });

  it("leaves preparation when a pending start is replaced by an empty topic", async () => {
    const baseFetch = mockApi();
    const emptyTopic = {
      id: "empty", title_ru: "Пустая тема", description_ru: "Нет фраз", likely_intents: [],
      suggested_vocabulary: [], is_custom: true, phrase_count: 0,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/sessions/start") return new Promise<never>(() => undefined);
      if (input.toString() === "/api/topics") {
        const response = await baseFetch(input, init);
        return { ok: true, status: 200, json: async () => [...await response.json(), emptyTopic] };
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(await screen.findByRole("status", { name: "Подготовка фразы" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Пустая тема/ }));
    expect(screen.queryByRole("status", { name: "Подготовка фразы" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Пустая тема" })).toBeInTheDocument();
  });

  it("renders the native Android experience as three minimal swipe panels", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(screen.getByRole("status", { name: "Авторизация и загрузка" })).toHaveTextContent("Авторизация и загрузка...");
    expect(screen.getByRole("img", { name: "SerboTalk" })).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/));

    const topicsPage = await screen.findByRole("region", { name: "Выбор темы" });
    expect(topicsPage.querySelector("h1")).toBeNull();
    expect(await screen.findByRole("button", { name: /В банке.*20.*неизученных/ })).toBeInTheDocument();
    const reviewCard = screen.getByRole("button", { name: /Повторение.*0.*к повторению/ });
    expect(reviewCard).toHaveClass("android-topic");
    expect(reviewCard.querySelectorAll('svg path[fill="currentColor"]')).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Тренировка" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Статистика" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Темы" })).toHaveAttribute("aria-current", "page");
    expect(fetchMock.mock.calls.some(([url]) => url.toString().includes("/statistics/monthly"))).toBe(false);
    expect(screen.queryByRole("navigation", { name: "Основная навигация" })).not.toBeInTheDocument();
    expect(screen.queryByText("Практикуйтесь в реальных ситуациях")).not.toBeInTheDocument();
    expect(screen.queryByText("Каждый короткий разговор делает речь увереннее.")).not.toBeInTheDocument();

    const pager = screen.getByRole("region", { name: "Выбор темы" }).parentElement as HTMLElement;
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 320 });
    pager.scrollLeft = 640;
    fireEvent.scroll(pager);
    expect(screen.getByRole("button", { name: "Статистика" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString().includes("/statistics/monthly"))).toBe(true));

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(screen.getByRole("button", { name: "Тренировка" })).toHaveAttribute("aria-current", "page");
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

    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.queryByText("modal_verbs")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ответить голосом/ })).toBeDisabled();
    expect(screen.getByText(/Микрофон недоступен/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/sessions/start", expect.objectContaining({ method: "POST" })));
    expect(fetchMock.mock.calls.some(([url]) => url.toString().endsWith("/next-exercise"))).toBe(false);
  });

  it("shows feedback and reuses the prefetched phrase while profile refresh is pending", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let profileCalls = 0;
    let reviewCalls = 0;
    const pending = new Promise<Response>(() => undefined);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/auth/me" && ++profileCalls > 1) return pending;
      if (input.toString() === "/api/review-phrases" && ++reviewCalls > 1) return pending;
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));

    const next = await screen.findByRole("button", { name: /Следующая фраза/ });
    await waitFor(() => expect(next).toBeEnabled());
    expect(fetchMock.mock.calls.filter(([url]) => url.toString().endsWith("/next-exercise"))).toHaveLength(1);
    fireEvent.click(next);
    await waitFor(() => expect(screen.queryByText("Ответ естественный и точный.")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([url]) => url.toString().endsWith("/next-exercise"))).toHaveLength(1);
  });

  it("shows a failed Android prefetch and retries the next phrase on another tap", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    voiceMock.available = true;
    const baseFetch = mockApi();
    let nextCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith("/next-exercise") && ++nextCalls === 1) {
        return Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: "Unavailable" }) });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));
    const next = await screen.findByRole("button", { name: "Следующая" });
    await waitFor(() => expect(nextCalls).toBe(1));
    fireEvent.click(next);
    expect(await screen.findByText("Не удалось получить следующую фразу.")).toBeInTheDocument();
    expect(nextCalls).toBe(1);
    fireEvent.click(next);
    await waitFor(() => expect(nextCalls).toBe(2));
    await waitFor(() => expect(screen.queryByText("Не удалось получить следующую фразу.")).not.toBeInTheDocument());
  });

  it("uses the selected alphabet for hints, transcription, feedback and statistics", async () => {
    voiceMock.available = true;
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Настройки" }));
    fireEvent.click(screen.getByRole("radio", { name: /Кириллица/ }));
    expect(window.localStorage.getItem("serbotalk.serbian-alphabet.user-1")).toBe("cyrillic");
    fireEvent.click(screen.getByRole("button", { name: "Практика" }));
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: "хочу" }));
    expect(screen.getByText("желим")).toBeInTheDocument();

    const answer = await recordAnswer();
    expect(answer).toHaveValue("Желим да отворим рачун.");
    fireEvent.change(answer, { target: { value: "Желим да отворим рачун!" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url === "/api/attempts");
      expect(JSON.parse(call?.[1]?.body as string).transcript_sr).toBe("Želim da otvorim račun!");
    });
    expect((await screen.findAllByText("Желим да отворим рачун.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Статистика" }));
    fireEvent.click(await screen.findByRole("button", { name: "Фразы" }));
    expect(await screen.findByText("Желим да отворим рачун.")).toBeInTheDocument();
  });

  it("uses the latest alphabet when an in-flight transcription finishes", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let finishTranscription!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const transcription = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishTranscription = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/transcriptions" ? transcription : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Ответить голосом" }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/transcriptions")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    fireEvent.click(screen.getByRole("radio", { name: /Кириллица/ }));
    await act(async () => { finishTranscription({ ok: true, status: 200, json: async () => ({ text: "Platic\u0301u bankovnom karticom." }) }); });
    fireEvent.click(screen.getByRole("button", { name: "Практика" }));
    const answer = await screen.findByLabelText("Ваш ответ");
    expect(answer).toHaveValue("Платићу банковном картицом.");
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url === "/api/attempts");
      expect(JSON.parse(call?.[1]?.body as string).transcript_sr).toBe("Platiću bankovnom karticom.");
    });
  });

  it("keeps answer entry locked until speech is transcribed on Android", async () => {
    voiceMock.available = true;
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.stubGlobal("fetch", mockApi());
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Настройки" }));
    fireEvent.click(screen.getByRole("radio", { name: /Кириллица/ }));
    fireEvent.click(screen.getByRole("button", { name: "Темы" }));
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
    expect((await recordAnswer())).toHaveValue("Желим да отворим рачун.");
  });

  it("creates a persisted empty custom topic", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByRole("button", { name: /В банке/ });
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
    voiceMock.available = true;
    vi.stubGlobal("fetch", mockApi());
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
    const input = await recordAnswer();
    fireEvent.change(input, { target: { value: "Želim da otvorim račun." } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));

    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    expect(screen.getByText("Вариант перевода")).toBeInTheDocument();
    expect(screen.getByText("Ваш вариант")).toBeInTheDocument();
    expect(screen.getByText("Ваш вариант").parentElement).toHaveTextContent("Želim da otvorim račun.");
    expect(screen.queryByLabelText("Прогресс навыков")).not.toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Разбор"));
    expect(screen.getByText("Смысл и конструкция переданы правильно.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Следующая фраза/ })).toBeEnabled();
  });

  it("submits a manually edited answer with mixed keyboard layout as Serbian Latin", async () => {
    voiceMock.available = true;
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const input = await recordAnswer();
    fireEvent.change(input, { target: { value: "Želim da otvorim račuн. Platiću kartiсom." } });
    expect(input).toHaveValue("Želim da otvorim račuн. Platiću kartiсom.");
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url === "/api/attempts");
      expect(JSON.parse(call?.[1]?.body as string).transcript_sr)
        .toBe("Želim da otvorim račun. Platiću karticom.");
    });
  });

  it("keeps rendering a stale attempt response without learner updates", async () => {
    voiceMock.available = true;
    vi.stubGlobal("fetch", mockApi(true));
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.change(await recordAnswer(), { target: { value: "Želim da otvorim račun." } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));

    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Прогресс навыков")).not.toBeInTheDocument();
  });

  it("shows only the current week and separates attempts from mastered phrases", async () => {
    vi.stubGlobal("fetch", mockApi());
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Статистика/ }));
    expect(screen.getByRole("heading", { name: "Статистика" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Календарь занятий" })).toBeInTheDocument();
    expect(screen.getByLabelText("Итоги недели")).toHaveTextContent("10фраз за неделю");
    expect(screen.getByRole("heading", { name: "Фразы по дням" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /График фраз по дням/ }).querySelectorAll(".daily-chart__column")).toHaveLength(7);
    expect(screen.getByRole("img", { name: /График фраз по дням/ }).querySelector('[title*="всего 10"]')).toHaveAttribute("title", expect.stringContaining("правильно 7, неправильно 3, выучено 1"));
    expect(screen.queryByRole("button", { name: /Прогресс/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Фразы" }));
    expect(await screen.findByRole("heading", { name: "В банке" })).toBeInTheDocument();
    expect(screen.getByText("Želim da otvorim račun.")).toBeInTheDocument();
    expect(screen.getByText("выучена")).toBeInTheDocument();
    expect(screen.getByLabelText("На странице")).toHaveValue("10");

  });

  it("reveals a word translation and sends used hints with the attempt", async () => {
    voiceMock.available = true;
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
    fireEvent.click(await screen.findByRole("button", { name: "хочу" }));
    expect(screen.getByText("želim")).toBeInTheDocument();
    expect(screen.queryByText("Загружаем…")).not.toBeInTheDocument();

    fireEvent.change(await recordAnswer(), { target: { value: "Želim da otvorim račun." } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await waitFor(() => {
      const attemptCall = fetchMock.mock.calls.find(([url]) => url === "/api/attempts");
      expect(JSON.parse(attemptCall?.[1]?.body as string).hinted_words).toEqual(["хочу"]);
    });
    expect(fetchMock.mock.calls.some(([url]) => url.toString().endsWith("/word-hints"))).toBe(true);
    finishHintRequest?.();
  });

  it("keeps slow hints visible and submits each opened word once before background saves finish", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    const saves: Array<{ url: string; finish: () => void }> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === "/api/sessions/start") return Promise.resolve({ ok: true, status: 200, json: async () => ({
        ...(await (await baseFetch(input, init)).json()),
        exercise: {
          id: "exercise-1", session_id: "session-1", source_ru: "Я хочу открыть счёт.",
          targeted_skills: [], expected_level: "A2", difficulty: 1,
          word_hints: [{ word_ru: "хочу", translation_sr: "želim" }, { word_ru: "открыть", translation_sr: "otvoriti" }],
        },
      }) });
      if (url.endsWith("/word-hints")) return new Promise((resolve) => {
        const word = JSON.parse(init?.body as string).word as string;
        saves.push({ url: word, finish: () => resolve({ ok: true, status: 200,
          json: async () => ({ word_ru: word, translation_sr: word === "хочу" ? "želim" : "otvoriti", is_learning: true }) }) });
      });
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await screen.findByRole("button", { name: "хочу" });
    act(() => {
      screen.getByRole("button", { name: "хочу" }).click();
      screen.getByRole("button", { name: "хочу" }).click();
      screen.getByRole("button", { name: "открыть" }).click();
    });
    expect(screen.getByText("otvoriti")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "хочу" })).toHaveClass("is-used");
    expect(saves.map((item) => item.url)).toEqual(["хочу", "открыть"]);
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    const attemptBody = JSON.parse(fetchMock.mock.calls.find(([url]) => url === "/api/attempts")?.[1]?.body as string);
    expect(attemptBody.hinted_words).toEqual(["открыть", "хочу"]);
    await act(async () => { saves.forEach((item) => item.finish()); });
  });

  it("offers a failed hint save for retry without losing the answer or repeating the hinted word", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let hintCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith("/word-hints") && ++hintCalls === 1) {
        return Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: "offline" }) });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: "хочу" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Нажмите на слово ещё раз");
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "хочу" }));
    await waitFor(() => expect(hintCalls).toBe(2));
    expect(answer).toHaveValue("Moj odgovor");
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await screen.findByText("Ответ естественный и точный.");
    const bodies = fetchMock.mock.calls.filter(([url]) => url === "/api/attempts")
      .map(([, init]) => JSON.parse(init?.body as string));
    expect(bodies).toHaveLength(1);
    expect(bodies[0].hinted_words).toEqual(["хочу"]);
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
    voiceMock.available = true;
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
    expect(await screen.findByRole("button", { name: "Ответить голосом" })).toBeInTheDocument();
    expect(nextExerciseCalls).toBe(0);
    fireEvent.change(await recordAnswer(), { target: { value: "Stari odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    expect(await screen.findByText("Все фразы из карусели освоены. Отличная работа!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /В банке/ }));

    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Ответить голосом/ })).toBeInTheDocument();
    expect(screen.queryByText("Stari odgovor")).not.toBeInTheDocument();
  });

  it("keeps the spoken draft when navigating away and back", async () => {
    voiceMock.available = true;
    vi.stubGlobal("fetch", mockApi());
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "Статистика" }));
    fireEvent.click(screen.getByRole("button", { name: "Практика" }));
    expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Moj odgovor");
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
  });

  it("shows an AI outage without a grade and reuses the same request ID on retry", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let attempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/attempts" && ++attempts === 1) {
        return Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: { code: "analysis_unavailable", retryable: true, message: "AI unavailable" } }) });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сервис проверки временно недоступен");
    expect(screen.queryByText("Ответ естественный и точный.")).not.toBeInTheDocument();
    expect(answer).toHaveValue("Želim da otvorim račun.");
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    const bodies = fetchMock.mock.calls.filter(([url]) => url.toString() === "/api/attempts")
      .map(([, init]) => JSON.parse(init?.body as string));
    expect(bodies).toHaveLength(2);
    expect(bodies[0].client_request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[1].client_request_id).toBe(bodies[0].client_request_id);
    expect(bodies[1].transcript_sr).toBe(bodies[0].transcript_sr);
  });

  it("keeps an edited answer and request ID when the attempt is still pending on the server", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let attempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/attempts" && ++attempts === 1) return Promise.resolve({
        ok: false, status: 409,
        json: async () => ({ detail: { code: "attempt_in_progress", retryable: true, message: "Pending" } }),
      });
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Проверка ещё выполняется");
    expect(answer).toHaveValue("Moj odgovor");
    expect(answer).not.toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    const bodies = fetchMock.mock.calls.filter(([url]) => url === "/api/attempts")
      .map(([, init]) => JSON.parse(init?.body as string));
    expect(bodies).toHaveLength(2);
    expect(bodies[1].client_request_id).toBe(bodies[0].client_request_id);
    expect(bodies[1].transcript_sr).toBe("Moj odgovor");
  });

  it("keeps the edited answer stable while a check is pending and restores editing after a network error", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let failAttempt!: () => void;
    const pendingAttempt = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => {
      failAttempt = () => resolve({ ok: false, status: 503, json: async () => ({ detail: "offline" }) });
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/attempts" ? pendingAttempt : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(answer).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "хочу" })).toBeDisabled();
    await act(async () => { failAttempt(); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось проверить ответ");
    expect(answer).toHaveValue("Moj odgovor");
    expect(answer).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "хочу" })).toBeEnabled();
  });

  it("keeps the result when the background profile refresh fails", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let profileCalls = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/auth/me" && ++profileCalls > 1) return Promise.reject(new Error("offline"));
      return baseFetch(input, init);
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    await waitFor(() => expect(profileCalls).toBe(2));
    expect(screen.getByRole("button", { name: /Следующая фраза/ })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reuses the next phrase request ID after a failed prefetch", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let nextCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith("/next-exercise") && ++nextCalls === 1) {
        return Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: "unavailable" }) });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось получить следующую фразу");
    expect(screen.getByText("Ответ естественный и точный.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Следующая фраза/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    expect(await screen.findByRole("button", { name: "Ответить голосом" })).toBeInTheDocument();
    const ids = fetchMock.mock.calls.filter(([url]) => url.toString().endsWith("/next-exercise"))
      .map(([, init]) => JSON.parse(init?.body as string).client_request_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(ids[0]);
  });

  it("finishes an exhausted topic instead of endlessly retrying for another phrase", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString().endsWith("/next-exercise")
        ? Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: { code: "topic_empty" } }) })
        : baseFetch(input, init)));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    expect(await screen.findByRole("heading", { name: "Все фразы темы пройдены" })).toBeInTheDocument();
    expect(screen.getByText("1 фраз проверено. В этой теме пока нет следующих фраз.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выбрать новую тему" })).toBeEnabled();
  });

  it.each(["result", "error"])("ignores a late hint %s after advancing", async (outcome) => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let settleHint!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingHint = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { settleHint = resolve; });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString().endsWith("/word-hints") ? pendingHint : baseFetch(input, init)));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: "открыть" }));
    expect(screen.getByText("Загружаем…")).toBeInTheDocument();
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    const nextWord = await screen.findByRole("button", { name: "открыть" });
    await act(async () => { settleHint(outcome === "result"
      ? { ok: true, status: 200, json: async () => ({ word_ru: "открыть", translation_sr: "otvoriti", is_learning: true }) }
      : { ok: false, status: 503, json: async () => ({ detail: "unavailable" }) }); });
    expect(nextWord).not.toHaveClass("is-used");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a late next phrase after the user switches topics", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let settleNext!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingNext = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { settleNext = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString().endsWith("/next-exercise") ? pendingNext : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await screen.findByText("Ответ естественный и точный.");
    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    fireEvent.click(screen.getByRole("button", { name: /В банке/ }));
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    await act(async () => { settleNext({ ok: true, status: 201, json: async () => ({
      id: "stale-exercise", session_id: "session-1", source_ru: "Поздняя фраза.",
      targeted_skills: [], expected_level: "A2", difficulty: 1, word_hints: [],
    }) }); });
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.queryByText("Поздняя фраза.")).not.toBeInTheDocument();
  });

  it("does not restore a signed-out account when its late attempt finishes", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let profileCalls = 0;
    let settleAttempt!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingAttempt = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { settleAttempt = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/attempts") return pendingAttempt;
      const response = await baseFetch(input, init);
      if (input.toString() === "/api/auth/me" && ++profileCalls > 1) {
        return { ok: true, status: 200, json: async () => ({ ...await response.json(), id: "user-2", display_name: "Другой ученик" }) };
      }
      return response;
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await act(async () => { authEvents.notify?.(null); });
    expect(await screen.findByRole("button", { name: "Войти через Google" })).toBeInTheDocument();
    await act(async () => { authEvents.notify?.({ access_token: "other-token" }); });
    expect(await screen.findByText("Другой ученик")).toBeInTheDocument();
    const oldResponse = await baseFetch("/api/attempts", { method: "POST" });
    await act(async () => { settleAttempt({ ok: true, status: 200, json: async () => ({ ...await oldResponse.json(), daily_usage: { used: 3, limit: 10, remaining: 7, resets_at: "2026-09-23T00:00:00Z" } }) }); });
    expect(screen.getByText("Другой ученик")).toBeInTheDocument();
    expect(screen.queryByText("Ученик")).not.toBeInTheDocument();
  });

  it.each(["result", "error"])("ignores a late attempt %s after starting another session", async (outcome) => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let settleAttempt!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingAttempt = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { settleAttempt = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/attempts" ? pendingAttempt : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/attempts")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /В банке/ }));
    expect(await screen.findByRole("button", { name: "Ответить голосом" })).toBeInTheDocument();
    const response = outcome === "result"
      ? await baseFetch("/api/attempts", { method: "POST" })
      : { ok: false, status: 503, json: async () => ({ detail: { code: "analysis_unavailable", retryable: true } }) };
    await act(async () => { settleAttempt(response); });
    expect(screen.queryByText("Ответ естественный и точный.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
  });

  it("ignores a transcription that finishes after the topic changes", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let finishTranscription!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const transcription = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishTranscription = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/transcriptions" ? transcription : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Ответить голосом" }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/transcriptions")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /В банке/ }));
    finishTranscription({ ok: true, status: 200, json: async () => ({ text: "Stari odgovor" }) });
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
    expect(screen.queryByText("Stari odgovor")).not.toBeInTheDocument();
  });

  it("finishes normal practice after ten checked phrases without requesting an eleventh", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let nextCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith("/next-exercise")) {
        nextCalls += 1;
        return Promise.resolve({ ok: true, status: 201, json: async () => ({
          id: `exercise-${nextCalls + 1}`, session_id: "session-1", source_ru: `Фраза ${nextCalls + 1}.`,
          targeted_skills: [], expected_level: "A2", difficulty: 1, word_hints: [],
        }) });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    for (let number = 1; number <= 10; number += 1) {
      await recordAnswer();
      fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
      expect(await screen.findByText("Ответ естественный и точный.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: number === 10 ? "Завершить тренировку" : /Следующая фраза/ }));
      if (number < 10) await screen.findByRole("heading", { name: `Фраза ${number + 1}.` });
    }
    expect(screen.getByRole("heading", { name: "Тренировка завершена" })).toBeInTheDocument();
    expect(screen.getByText("10 из 10 фраз проверено.")).toBeInTheDocument();
    expect(nextCalls).toBe(9);
  }, 20_000);
});
