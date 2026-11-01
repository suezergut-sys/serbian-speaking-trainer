import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { Capacitor } from "@capacitor/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const authEvents = vi.hoisted(() => ({
  notify: undefined as undefined | ((session: { access_token: string } | null) => void),
}));
const voiceMock = vi.hoisted(() => ({ available: false, failStart: false, stops: 0, startGate: undefined as Promise<void> | undefined }));
const nativeAppEvents = vi.hoisted(() => ({
  listener: undefined as ((state: { isActive: boolean }) => void) | undefined,
  lastListener: undefined as ((state: { isActive: boolean }) => void) | undefined,
  registrationGate: undefined as Promise<void> | undefined,
  removals: 0,
}));

const nativeBackEvents = vi.hoisted(() => ({ listener: undefined as (() => void) | undefined, exits: 0, removals: 0 }));

vi.mock("@capacitor/app", () => ({
  App: {
    exitApp: async () => { nativeBackEvents.exits += 1; },
    addListener: async (_event: string, listener: (state: { isActive: boolean }) => void) => {
      if (_event === "backButton") {
        nativeBackEvents.listener = listener as unknown as () => void;
        return { remove: async () => { nativeBackEvents.removals += 1; nativeBackEvents.listener = undefined; } };
      }
      if (nativeAppEvents.registrationGate) await nativeAppEvents.registrationGate;
      nativeAppEvents.listener = listener;
      nativeAppEvents.lastListener = listener;
      return { remove: async () => { nativeAppEvents.removals += 1; nativeAppEvents.listener = undefined; } };
    },
  },
}));

vi.mock("../voiceRecorder", () => ({
  supportsVoiceRecording: () => voiceMock.available,
  VoiceRecorder: class {
    async start() { if (voiceMock.startGate) await voiceMock.startGate; if (voiceMock.failStart) throw new Error("Microphone denied"); }
    async finish() {
      return {
        audio: new Blob([], { type: "audio/webm" }),
        timing: { reaction_ms: null, speech_duration_ms: 1000, longest_pause_ms: null, pause_count: null, timings: { source: "test" } },
      };
    }
    stop() { voiceMock.stops += 1; }
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
  signInReviewAccount: async () => undefined,
  signOut: async () => undefined,
}));

import App from "../App";
import * as auth from "../auth";

describe("App", () => {
  it.each([false, true])("retains web email login and restores dedicated review access alongside Google (native=%s)", async native => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    vi.spyOn(auth, "initializeAuth").mockResolvedValue(null);
    vi.stubEnv("VITE_EMAIL_OTP_ENABLED", "true");
    vi.stubGlobal("fetch", mockApi());
    render(<App />);
    expect(await screen.findByRole("button", { name: "Войти через Google" })).toBeInTheDocument();
    expect(screen.getByText("Вход для проверки")).toBeInTheDocument();
    expect(screen.queryByText("Войти по email") !== null).toBe(!native);
    expect(document.querySelector(".email-login") !== null).toBe(!native);
  });

  it.each(["ru", "en"] as const)("shows classified checker failure and diagnostic ID without losing the draft (%s)", async language => {
    localStorage.setItem("serbotalk.interface-language", language);
    voiceMock.available = true;
    const original = mockApi();
    const id = "49d2c9b9-5978-402b-90d6-3822f88d1ae2";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith("/attempts")) return new Response(JSON.stringify({ detail: { code: "analysis_unavailable", failure: {
        kind: "response_parse", stage: "grounding", reason: "non_lexical_correction", diagnostic_id: id, retryable: true,
      } } }), { status: 503 });
      const response = await original(input, init);
      if (input.toString().endsWith("/sessions/start")) {
        const body = await response.json();
        return { ...response, json: async () => ({ ...body, exercise: { ...body.exercise,
          source_versions: { ru: "Я хочу открыть счёт.", en: "I want to open an account.", hints_ru: [], hints_en: [] } } }) };
      }
      return response;
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке|At the bank/ }));
    fireEvent.click(await screen.findByRole("button", { name: language === "en" ? "Answer aloud" : "Ответить голосом" }));
    fireEvent.click(await screen.findByRole("button", { name: language === "en" ? "Finish recording" : "Завершить запись" }));
    const answer = await screen.findByLabelText(language === "en" ? "Your answer" : "Ваш ответ");
    fireEvent.change(answer, { target: { value: "Synthetic answer." } });
    fireEvent.click(screen.getByRole("button", { name: language === "en" ? "Check answer" : "Проверить ответ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(language === "en" ? "could not be processed" : "Не удалось обработать");
    expect(screen.getByRole("alert")).toHaveTextContent(id);
    expect(answer).toHaveValue("Synthetic answer.");
  });

  it("switches login language and carries it into settings after authentication", async () => {
    vi.spyOn(auth, "initializeAuth").mockResolvedValue(null);
    vi.stubGlobal("fetch", mockApi());
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Добро пожаловать в SerboTalk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выбрать русский язык" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Выбрать английский язык" }));
    expect(screen.getByRole("button", { name: "Select English" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Select Russian" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "Welcome to SerboTalk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    expect(localStorage.getItem("serbotalk.interface-language")).toBe("en");
    await act(async () => { authEvents.notify?.({ access_token: "test-token" }); });
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("radio", { name: "English" })).toBeChecked();
  });

  it("switches source language while keeping independent hint keys and the answer draft", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await baseFetch(input, init);
      if (input.toString().endsWith("/sessions/start")) {
        const body = await response.json();
        return { ...response, json: async () => ({ ...body, exercise: { ...body.exercise, source_ru: "Я хочу открыть новый текущий счёт." } }) };
      }
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: "хочу" }));
    fireEvent.change(await recordAnswer(), { target: { value: "Želim da otvorim račun." } });
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));
    expect(screen.getByRole("heading", { name: "I want to open a new current account." })).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("Želim da otvorim račun.");
    expect(screen.getByRole("button", { name: "want" })).not.toHaveClass("is-used");
    fireEvent.click(screen.getByRole("button", { name: "want" }));
    expect(screen.getByRole("button", { name: "want" })).toHaveClass("is-used");
    expect(screen.getByText("Želim")).toBeInTheDocument();
    const englishHint = fetchMock.mock.calls.find(([, init]) => init?.body === JSON.stringify({ word: "want" }));
    expect(englishHint).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url.toString() === "/api/attempts");
      expect(JSON.parse(call?.[1]?.body as string).hinted_words).toEqual(["want", "хочу"]);
      expect(new Headers(call?.[1]?.headers).get("X-Interface-Language")).toBe("en");
    });
    expect(fetchMock.mock.calls.filter(([url]) => url.toString().endsWith("/sessions/start"))).toHaveLength(1);
  });

  it.each([false, true])("renders a short nonliteral personal hint as one button (native=%s)", async native => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    const baseFetch = mockApi();
    const hints = [{ word_ru: "мне не с кем", translation_sr: "nemam s kim" }, { word_ru: "поговорить", translation_sr: "da pričam" }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith("/word-hints")) return { ok: true, json: async () => ({ ...hints[0], is_learning: true }) };
      const response = await baseFetch(input, init);
      if (input.toString().endsWith("/sessions/start")) {
        const body = await response.json();
        return { ...response, json: async () => ({ ...body, exercise: { ...body.exercise,
          source_ru: "Мне не с кем поговорить.", source_en: null, source_hints: hints, word_hints: hints } }) };
      }
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(screen.queryByRole("button", { name: /^Мне$/ })).not.toBeInTheDocument();
    const fragment = await screen.findByRole("button", { name: /^Мне не с кем$/ });
    fireEvent.click(fragment);
    expect(await screen.findByText("nemam s kim")).toBeInTheDocument();
    expect(fragment).toHaveClass("is-used");
    expect(screen.getByRole("button", { name: "поговорить" })).not.toHaveClass("is-used");
    expect(fetchMock.mock.calls.filter(([url]) => url.toString().endsWith("/word-hints"))).toHaveLength(1);
  });

  it("grants Android Premium before showing the trainer and refreshes on resume", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
    let claims = 0;
    const baseFetch = mockApi();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const claim = input.toString().endsWith("/api/auth/me/android-premium");
      const result = await baseFetch(claim ? "/api/auth/me" : input, init);
      if (claim) { claims += 1; return { ...result, json: async () => ({
        ...await result.json(), role: "user", access_tier: "premium",
      }) }; }
      return result;
    }));
    render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    fireEvent.click(screen.getByRole("button", { name: "Премиум" }));
    expect(screen.getByRole("button", { name: "Создать тему" })).toBeInTheDocument();
    expect(claims).toBe(1);
    await waitFor(() => expect(nativeAppEvents.listener).toBeDefined());
    await act(async () => { nativeAppEvents.listener?.({ isActive: true }); });
    expect(await screen.findByRole("button", { name: "Создать тему" })).toBeInTheDocument();
    await waitFor(() => expect(claims).toBe(2));
    expect(screen.queryByRole("button", { name: "https://serbotalk.app/" })).not.toBeInTheDocument();
  });

  it.each(["ru", "en"])("recovers a failed Android grant without offering payment (%s)", async language => {
    localStorage.setItem("serbotalk.interface-language", language);
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
    const baseFetch = mockApi();
    let claims = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!input.toString().endsWith("/api/auth/me/android-premium")) return baseFetch(input, init);
      if (++claims === 1) throw new Error("synthetic network outage");
      const response = await baseFetch("/api/auth/me", init);
      return { ...response, json: async () => ({ ...await response.json(), role: "user", access_tier: "premium" }) };
    }));
    render(<App />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /Основная навигация|Main navigation/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: language === "ru" ? "Повторить загрузку профиля" : "Retry loading profile" }));
    fireEvent.click(await screen.findByRole("button", { name: language === "ru" ? "Премиум" : "Premium" }));
    expect(await screen.findByRole("button", { name: language === "ru" ? "Создать тему" : "Create topic" })).toBeInTheDocument();
    expect(claims).toBe(2);
    expect(screen.queryByRole("button", { name: "https://serbotalk.app/" })).not.toBeInTheDocument();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    voiceMock.available = false;
    voiceMock.failStart = false;
    voiceMock.stops = 0;
    voiceMock.startGate = undefined;
    nativeAppEvents.listener = undefined;
    nativeAppEvents.lastListener = undefined;
    nativeAppEvents.registrationGate = undefined;
    nativeAppEvents.removals = 0;
    nativeBackEvents.listener = undefined; nativeBackEvents.exits = 0; nativeBackEvents.removals = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["ru", "en"])("blocks an untranslated foreign-language exercise instead of asking for an answer (%s)", async language => {
    localStorage.setItem("serbotalk.interface-language", language);
    const baseFetch = mockApi();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await baseFetch(input, init);
      if (!input.toString().endsWith("/sessions/start")) return response;
      const body = await response.json();
      return { ...response, json: async () => ({ ...body, exercise: { ...body.exercise,
        source_ru: language === "en" ? "Личная фраза без перевода." : "An untranslated private phrase.", source_en: null, source_versions: null } }) };
    }));
    render(<App />);
    expect(await screen.findByText(language === "en" ? "The phrase is unavailable in the selected language. Reload or choose another topic." : "Фраза на выбранном языке недоступна. Повторите загрузку или выберите другую тему.")).toBeInTheDocument();
    expect(document.querySelector(".interactive-phrase")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ответить голосом|Answer aloud/ })).not.toBeInTheDocument();
  });

  it("routes native Back from settings to practice, then topics, before exiting", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.stubGlobal("fetch", mockApi());
    voiceMock.available = true;
    const rendered = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    await screen.findByRole("button", { name: "Завершить запись" });
    fireEvent.click(screen.getByRole("button", { name: "Завершить запись" }));
    const answer = await screen.findByLabelText("Ваш ответ");
    fireEvent.change(answer, { target: { value: "Sačuvaj odgovor." } });
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    await act(async () => nativeBackEvents.listener?.());
    expect(screen.getByRole("button", { name: "Тренировка" })).toHaveAttribute("aria-current", "page");
    expect(answer).toHaveValue("Sačuvaj odgovor.");
    await act(async () => nativeBackEvents.listener?.());
    expect(screen.getByRole("button", { name: "Темы" })).toHaveAttribute("aria-current", "page");
    expect(nativeBackEvents.exits).toBe(0);
    await act(async () => nativeBackEvents.listener?.());
    expect(nativeBackEvents.exits).toBe(1);
    rendered.unmount();
    expect(nativeBackEvents.removals).toBe(1);
  });

  it("renders public legal pages without authentication", () => {
    window.history.replaceState({}, "", "/privacy");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Политика конфиденциальности" })).toBeInTheDocument();
    expect(screen.getByText(/Обычные записи голоса не сохраняются/)).toBeInTheDocument();
    expect(screen.getByText(/администратор может включить сохранение собственного аудио/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Вернуться в SerboTalk/ })).toHaveAttribute("href", "/");
  });

  it("renders the public deletion request without signing in", () => {
    window.history.replaceState({}, "", "/delete-account");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Удаление аккаунта SerboTalk" })).toBeInTheDocument();
    expect(screen.getByText(/7 календарных дней/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "suezergut@gmail.com" })[0]).toHaveAttribute("href", expect.stringContaining("mailto:suezergut@gmail.com"));
  });

  function mockApi(omitLearnerUpdates = false, initialReviewPhrases: Array<Record<string, unknown>> = [], role = "user", assistanceEnabled = false) {
    let reviewCount = initialReviewPhrases.length;
    return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input.toString();
      const url = rawUrl.startsWith("http")
        ? `${new URL(rawUrl).pathname}${new URL(rawUrl).search}`
        : rawUrl;
      let body: unknown;
      if (url === "/api/health") body = { status: "ok", service: "serbian-speaking-trainer" };
      else if (url === "/api/auth/me") body = {
        assistance_enabled: assistanceEnabled,
        id: "user-1", email: "learner@example.com", display_name: "Ученик", avatar_url: null,
        role, access_tier: "free", registered_at: "2026-09-01T10:00:00Z",
        last_active_at: "2026-09-22T10:00:00Z",
        daily_usage: { used: 2, limit: 10, remaining: 8, resets_at: "2026-09-23T00:00:00Z" },
      };
      else if (url === "/api/auth/me/preferences") body = { assistance_enabled: assistanceEnabled };
      else if (url === "/api/transcriptions") body = { text: "Želim da otvorim račun." };
      else if (url === "/api/admin/users") body = [{
        id: "user-1", email: "learner@example.com", display_name: "Ученик", role: "admin",
        access_tier: "free", registered_at: "2026-09-01T10:00:00Z",
        last_active_at: "2026-09-22T10:00:00Z", phrases_today: 12, daily_limit: null,
      }];
      else if (url === "/api/review-phrases/prepare" && init?.method === "POST") body = {
        preparation_id: "12345678-1234-1234-1234-123456789012",
        source_ru: "Мне нужно позвонить хозяину.", canonical_sr: "Moram da pozovem vlasnika.",
        intended_sr_variants: ["Moram da pozovem vlasnika."], word_hints: [],
      };
      else if (url === "/api/review-phrases" && init?.method === "POST") {
        reviewCount = Math.max(reviewCount, 1);
        body = {
          id: "review-1", source_ru: "Мне нужно позвонить хозяину.", best_score: 0,
          canonical_sr: "Moram da pozovem vlasnika.", topic_id: "bank", topic_title: "В банке",
          attempts: 0, perfect_streak: 0, status: "active", created_at: "2026-09-17T10:00:00Z",
        };
      }
      else if (url === "/api/review-phrases/summary") body = { phrase_count: reviewCount };
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
      else if (url === "/api/statistics/phrase-topics") body = [{ topic_id: "bank", topic_title: "В банке", phrase_count: 1 }];
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
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    return screen.findByLabelText("Ваш ответ");
  }

  it.each([false, true])("warns after three consecutive recordings with non-Serbian letters and resets after success (native=%s)", async (native) => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    voiceMock.available = true;
    const base = mockApi();
    let recordings = 0;
    const texts = ["Донесите посебный рачун.", "Донесіце асабны рачун.", "Платячу картицом.", "Moj odgovor.", "Донесите посебный рачун."];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => input.toString().endsWith("/api/transcriptions")
      ? Promise.resolve({ ok: true, status: 200, json: async () => ({ text: texts[recordings++], review_required: recordings !== 4 }) })
      : base(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const warning = "Проблемы с работой внешней моделью. Сделайте перерыв и вернитесь к обучению позже";
    for (let index = 0; index < texts.length; index++) {
      await recordAnswer();
      await waitFor(() => expect(screen.getByLabelText("Ваш ответ")).toHaveValue(texts[index]));
      await screen.findByRole("button", { name: "Записать заново" });
      if (index === 2) expect(screen.getByText(warning)).toHaveAttribute("role", "alert");
      else expect(screen.queryByText(warning)).not.toBeInTheDocument();
    }
    expect(recordings).toBe(5);
    expect(fetchMock.mock.calls.some(([url]) => url.toString().endsWith("/api/attempts"))).toBe(false);
  });

  it("breaks the non-Serbian failure streak on an unrelated provider error", async () => {
    voiceMock.available = true;
    const base = mockApi();
    let recordings = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!input.toString().endsWith("/api/transcriptions")) return base(input, init);
      recordings++;
      return Promise.resolve(recordings === 3
        ? { ok: false, status: 503, json: async () => ({ detail: { code: "transcription_timeout" } }) }
        : { ok: true, status: 200, json: async () => ({ text: "Донесіце асабны рачун.", review_required: true }) });
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    for (let index = 0; index < 5; index++) {
      await recordAnswer();
      await screen.findByRole("button", { name: "Записать заново" });
      expect(screen.queryByText(/Проблемы с работой внешней моделью/)).not.toBeInTheDocument();
    }
  });

  it.each(["desktop", "mobile", "native"])("enables custom content for administrators (%s)", async layout => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(layout === "native");
    if (layout === "mobile") vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal("fetch", mockApi(false, [], "admin"));
    render(<App />);
    if (layout === "mobile") fireEvent.click(await screen.findByRole("button", { name: "Темы" }));
    await screen.findByRole("button", { name: /В банке/ });
    expect(screen.queryByRole("button", { name: /добавить тему|добавить фразу/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Премиум" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать тему" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Название темы" }), { target: { value: "Поговорить с арендодателем" } });
    fireEvent.click(screen.getByText("Сохранить тему"));
    await screen.findByText("Тема сохранена.");
    fireEvent.click(screen.getByText("Закрыть"));
    fireEvent.click(screen.getByRole("button", { name: layout === "desktop" ? "Практика" : "Темы" }));
    expect(screen.getByRole("button", { name: /Поговорить с арендодателем/ })).toHaveClass("topic--personal");
    fireEvent.click(screen.getByRole("button", { name: "Премиум" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать фразу" }));
    expect(screen.getAllByLabelText("Фраза на русском языке")).toHaveLength(1);
  });

  it.each(["free", "premium"])("marks only personal home topics for %s users", async tier => {
    const base = mockApi();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await base(input, init);
      if (input.toString() === "/api/auth/me") return { ok: true, json: async () => ({ ...await response.json(), access_tier: tier }) };
      if (input.toString() === "/api/topics") return { ok: true, json: async () => [...await response.json(), { id: "personal-topic", title_ru: "Моя тема", description_ru: "", is_custom: true, phrase_count: 1, custom_phrase_count: 1, likely_intents: [], suggested_vocabulary: [] }] };
      return response;
    }));
    render(<App />);
    const personal = await screen.findByRole("button", { name: /Моя тема/ });
    expect(personal.classList.contains("topic--personal")).toBe(tier === "premium");
    expect(screen.getByRole("button", { name: /В банке/ })).not.toHaveClass("topic--personal");
    expect(screen.queryByRole("separator", { name: "Личные темы" }) !== null).toBe(tier === "premium");
    expect(screen.queryByRole("button", { name: /добавить тему|добавить фразу/ })).not.toBeInTheDocument();
  });

  for (const language of ["ru", "en"] as const) for (const layout of ["desktop", "mobile", "android"] as const) {
    it(`groups personal topics below presets in visible-language order (${language}, ${layout})`, async () => {
      localStorage.setItem("serbotalk.interface-language", language);
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(layout === "android");
      if (layout === "mobile") vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
      const base = mockApi();
      const personal = (id: string, title_ru: string, title_en: string) => ({ id, title_ru, title_en, description_ru: "", is_custom: true, phrase_count: 1, likely_intents: [], suggested_vocabulary: [] });
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await base(input, init);
        const path = new URL(input.toString(), "https://test.invalid").pathname;
        if (path === "/api/auth/me") return { ok: true, json: async () => ({ ...await response.json(), access_tier: "premium" }) };
        if (path === "/api/topics") return { ok: true, json: async () => [personal("custom-z", "Язык", "Animals"), ...await response.json(), personal("custom-a", "Автомобиль", "Travel")] };
        return response;
      }));
      const { container } = render(<App />);
      if (layout !== "desktop") fireEvent.click(await screen.findByRole("button", { name: language === "ru" ? "Темы" : "Topics" }));
      await screen.findByRole("button", { name: language === "ru" ? /Автомобиль/ : /Travel/ });
      const grid = container.querySelector(layout === "desktop" ? ".desktop-topic-grid" : ".android-topic-list")!;
      expect(Array.from(grid.querySelectorAll(".topic--personal strong")).map(item => item.textContent).filter(text => !/^\d+$/.test(text ?? "")))
        .toEqual(language === "ru" ? ["Автомобиль", "Язык"] : ["Animals", "Travel"]);
      const divider = grid.querySelector("hr")!;
      expect(divider).toHaveAccessibleName(language === "ru" ? "Личные темы" : "Personal topics");
      expect(divider.previousElementSibling).not.toHaveClass("topic--personal");
      expect(divider.nextElementSibling).toHaveClass("topic--personal");
    });
  }

  it.each([false, true])("keeps creation controls off the mobile home screen (native=%s)", async native => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    if (!native) vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal("fetch", mockApi());
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    if (!native) fireEvent.click(screen.getByRole("button", { name: "Темы" }));
    expect(container.querySelectorAll(".android-topic-list > button")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /добавить тему|добавить фразу|Свои темы и фразы/ })).not.toBeInTheDocument();
    expect(container.querySelector(".custom-content-form")).toBeNull();
  });

  it.each([false, true])("uses the remotely synced %s preference for native STT after resume", async (initial) => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    voiceMock.available = true;
    let server = initial;
    const base = mockApi();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith("/api/auth/me/preferences")) return { ok: true, json: async () => ({ assistance_enabled: server }) };
      if (input.toString().endsWith("/api/auth/me")) {
        const result = await base(input, init);
        return { ok: true, json: async () => ({ ...await result.json(), assistance_enabled: initial }) };
      }
      return base(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Мягкие подсказки при распознавании" })).toHaveProperty("checked", initial));
    server = !initial;
    await act(async () => { nativeAppEvents.listener?.({ isActive: true }); });
    await waitFor(() => expect(screen.getByRole("switch", { name: "Мягкие подсказки при распознавании" })).toHaveProperty("checked", !initial));
    fireEvent.click(screen.getByRole("button", { name: "Тренировка" }));
    await recordAnswer();
    const request = fetchMock.mock.calls.find(([url]) => url.toString().endsWith("/api/transcriptions"))!;
    expect((request[1]?.body as FormData).get("assistance_enabled")).toBe(String(!initial));
  });

  it.each([
    { native: false, review: false }, { native: false, review: true },
    { native: true, review: false }, { native: true, review: true },
  ])("shows phrases without numbering (native=$native, review=$review)", async ({ native, review }) => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    vi.stubGlobal("fetch", mockApi(false, review ? [{ id: "review-1" }] : []));
    const { container } = render(<App />);
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(container.querySelector(".phrase-number")).toBeNull();
    expect(container.querySelector(".card-title small, .android-training-meta small")).toBeNull();
    expect(screen.queryByText(/^Фраза \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+\s*\/\s*\d+$/)).not.toBeInTheDocument();
    expect(container.querySelector(".exercise-topic")).toHaveTextContent(review ? "Фразы для повторения" : "В банке");
    expect(container.querySelector(".voice-prompt, .mobile-topic-switch")).toBeNull();
  });

  it("applies only accepted assistance and keeps its evidence through manual edits", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi(false, [], "user", true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => input.toString() === "/api/transcriptions"
      ? Promise.resolve({ ok: true, json: async () => ({ text: "Cemu?", raw_text: "Cemu?", transcription_id: "receipt-1", changes: [
        { start: 0, end: 4, original: "Cemu", replacement: "Čemu", action: "suggested", kind: "phonetic_ambiguity", reason_code: "confirm_ambiguous_sound" },
      ] }) }) : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    const answer = await recordAnswer();
    expect(answer).toHaveValue("Cemu?");
    const voiceRequest = fetchMock.mock.calls.find(([url]) => url.toString() === "/api/transcriptions")!;
    expect((voiceRequest[1]?.body as FormData).get("assistance_enabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Принять подсказку" }));
    expect(answer).toHaveValue("Čemu?");
    fireEvent.change(answer, { target: { value: "Čemu sada?" } });
    expect(screen.queryByRole("button", { name: "Отменить" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/attempts")).toBe(true));
    const submitted = fetchMock.mock.calls.find(([url]) => url.toString() === "/api/attempts")!;
    expect(JSON.parse(submitted[1]?.body as string)).toMatchObject({ transcript_sr: "Čemu sada?", transcription_id: "receipt-1", accepted_transcription_changes: [0] });
  });

  it("places check and static microphone retry below the transcript without automatically grading", async () => {
    voiceMock.available = true;
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    await recordAnswer();
    const check = screen.getByRole("button", { name: "Проверить ответ" });
    const retry = screen.getByRole("button", { name: "Записать заново" });
    expect(check).toHaveClass("answer-check-button");
    expect(check.parentElement?.firstElementChild).toBe(check);
    expect(check.parentElement?.lastElementChild).toBe(retry);
    expect(retry.querySelector(".mic-retry-ring")).toBeInTheDocument();
    expect(retry).not.toHaveClass("is-active");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/attempts"))).toHaveLength(0);
    fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "Завершить запись" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Проверить ответ" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Завершить запись" }));
    await screen.findByRole("button", { name: "Проверить ответ" });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Верно")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/attempts"))).toHaveLength(1);
  });

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

  it("starts the review carousel before a regular topic when review phrases are available", async () => {
    const fetchMock = mockApi(false, [{ id: "review-1" }]);
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    const starts = fetchMock.mock.calls.filter(([url]) => url.toString() === "/api/sessions/start");
    expect(starts).toHaveLength(1);
    expect(JSON.parse(starts[0][1]?.body as string)).toEqual({ review_mode: true, length: 10 });
    expect(screen.getByRole("button", { name: /Фразы для повторения/ })).toHaveClass("is-selected");
    expect(screen.getByRole("button", { name: /В банке/ })).not.toHaveClass("is-selected");
  });

  it("skips empty topics when choosing the default practice session", async () => {
    const baseFetch = mockApi();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await baseFetch(input, init);
      if (input.toString() !== "/api/topics") return response;
      return { ok: true, status: 200, json: async () => [{
        id: "empty", title_ru: "Аренда", description_ru: "Пока без фраз", likely_intents: [],
        suggested_vocabulary: [], is_custom: false, phrase_count: 0,
      }, ...await response.json()] };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    const starts = fetchMock.mock.calls.filter(([url]) => url.toString() === "/api/sessions/start");
    expect(starts).toHaveLength(1);
    expect(JSON.parse(starts[0][1]?.body as string)).toMatchObject({ topic_id: "bank" });
    expect(screen.getByRole("button", { name: /В банке/ })).toHaveClass("is-selected");
    expect(screen.getByRole("button", { name: /Аренда/ })).not.toHaveClass("is-selected");
  });

  it("reveals manual controls for an empty catalog without starting a session", async () => {
    const baseFetch = mockApi();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/topics"
        ? Promise.resolve({ ok: true, status: 200, json: async () => [] })
        : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Темы для практики" })).toBeInTheDocument();
    expect(screen.getByText("Пока нет фраз для тренировки. Добавьте фразу или создайте тему.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /добавить тему/ })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/sessions/start")).toBe(false);
  });

  it("retries a failed default session without reloading", async () => {
    const baseFetch = mockApi();
    let starts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/sessions/start" && ++starts === 1
        ? Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: "Unavailable" }) })
        : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByRole("button", { name: "Повторить загрузку" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /В банке/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(starts).toBe(2);
  });

  it("does not leave a preparation spinner after retry cancels a manual start", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    const baseFetch = mockApi();
    let finishManual!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingManual = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishManual = resolve; });
    let starts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!input.toString().endsWith("/api/sessions/start")) return baseFetch(input, init);
      starts += 1;
      return starts === 2 ? pendingManual
        : Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: "Unavailable" }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    await waitFor(() => expect(starts).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "Темы" }));
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    await waitFor(() => expect(starts).toBe(3));
    await screen.findByRole("button", { name: "Темы" });
    fireEvent.click(screen.getByRole("button", { name: "Тренировка" }));
    expect(screen.queryByRole("status", { name: "Подготовка фразы" })).not.toBeInTheDocument();
    const response = await baseFetch("/api/sessions/start", { method: "POST", body: JSON.stringify({ topic_id: "bank" }) });
    await act(async () => finishManual(response));
    expect(screen.queryByRole("heading", { name: "Я хочу открыть счёт." })).not.toBeInTheDocument();
  });

  it("does not start after a late catalog response reaches an unmounted account", async () => {
    const baseFetch = mockApi();
    let finishTopics!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingTopics = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishTopics = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/topics" ? pendingTopics : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    const rendered = render(<App />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/topics")).toBe(true));
    rendered.unmount();
    const topics = await baseFetch("/api/topics");
    await act(async () => finishTopics(topics));
    expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/sessions/start")).toBe(false);
  });

  it("starts only one default session under StrictMode", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<StrictMode><App /></StrictMode>);

    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.toString().endsWith("/api/sessions/start"))).toHaveLength(1);
  });

  it("has the first exercise ready on the native training panel without a topic tap", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    voiceMock.available = true;
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    const topicsButton = await screen.findByRole("button", { name: "Темы" });
    expect(topicsButton).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Тренировка" }));
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([url]) => url.toString().endsWith("/api/sessions/start"))).toHaveLength(1);
  });

  it("retries a failed visibility refresh without clearing the active exercise or draft", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let topicCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/topics" && ++topicCalls === 2) return Promise.reject(new Error("offline"));
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Čuvam odgovor" } });

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(await screen.findByRole("status", { name: "Backend недоступен" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Čuvam odgovor");
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку тем" }));
    expect(await screen.findByRole("status", { name: "Backend готов" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Čuvam odgovor");
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.toString() === "/api/sessions/start")).toHaveLength(1);
    expect(topicCalls).toBe(3);
  });

  it("does not reload the profile for a repeated auth event with the same token", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByRole("button", { name: /В банке/ });

    await act(async () => { authEvents.notify?.({ access_token: "test-token" }); });

    expect(fetchMock.mock.calls.filter(([url]) => url.toString() === "/api/auth/me")).toHaveLength(1);
  });

  it("keeps topic controls hidden until the review summary and first exercise are ready", async () => {
    const fetchMock = mockApi();
    let finishReview!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const reviewResponse = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => {
      finishReview = resolve;
    });
    const pendingFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/review-phrases/summary" ? reviewResponse : fetchMock(input, init),
    );
    vi.stubGlobal("fetch", pendingFetch);

    render(<App />);

    await waitFor(() => expect(pendingFetch).toHaveBeenCalledWith("/api/review-phrases/summary", expect.anything()));
    expect(screen.getByRole("status", { name: "Подготовка фразы" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /В банке/ })).not.toBeInTheDocument();
    expect(pendingFetch.mock.calls.some(([url]) => url.toString() === "/api/sessions/start")).toBe(false);
    await act(async () => finishReview({ ok: true, status: 200, json: async () => ({ phrase_count: 0 }) }));
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(pendingFetch.mock.calls.filter(([url]) => url.toString() === "/api/sessions/start")).toHaveLength(1);
  });

  it("uses the summary count without fetching review history", async () => {
    const baseFetch = mockApi();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/review-phrases/summary"
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ phrase_count: 3 }) })
        : baseFetch(input, init),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByText("3 требуют практики")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => url.toString() === "/api/review-phrases" && init?.method !== "POST")).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/review-phrases/summary", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("keeps the review start guarded when the summary count is zero", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByRole("button", { name: /Фразы для повторения/ });

    fireEvent.click(screen.getByRole("button", { name: /Фразы для повторения/ }));

    expect(await screen.findByText("Пока нет фраз для повторения. Добавьте фразу ниже или выполните обычную тренировку.")).toBeInTheDocument();
    const starts = fetchMock.mock.calls.filter(([url]) => url.toString() === "/api/sessions/start");
    expect(starts).toHaveLength(1);
    expect(JSON.parse(starts[0][1]?.body as string)).toMatchObject({ topic_id: "bank" });
  });

  it("retries an initial topics timeout without reloading the page", async () => {
    const baseFetch = mockApi();
    let topicCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/topics" && ++topicCalls === 1
        ? Promise.reject(new DOMException("timeout", "AbortError")) : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(await screen.findByRole("status", { name: "Backend недоступен" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByRole("status", { name: "Backend готов" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /В банке/ })).toBeInTheDocument();
    expect(topicCalls).toBe(2);
  });

  it("shows phrase preparation while the default topic starts", async () => {
    const baseFetch = mockApi();
    let finishStart!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingStart = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishStart = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/sessions/start" ? pendingStart : baseFetch(input, init),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/sessions/start")).toBe(true));
    expect(screen.getByRole("status", { name: "Подготовка фразы" })).toHaveTextContent("Подготовка фразы");
    expect(screen.queryByRole("button", { name: /В банке/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Начать тренировку" })).not.toBeInTheDocument();
    const response = await baseFetch("/api/sessions/start", { method: "POST", body: JSON.stringify({ topic_id: "bank" }) });
    finishStart(response);
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
  });

  it("shows an empty topic as a manual path after the default start fails", async () => {
    const baseFetch = mockApi();
    const emptyTopic = {
      id: "empty", title_ru: "Пустая тема", description_ru: "Нет фраз", likely_intents: [],
      suggested_vocabulary: [], is_custom: true, phrase_count: 0,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/sessions/start") return { ok: false, status: 503, json: async () => ({ detail: "Unavailable" }) };
      if (input.toString() === "/api/topics") {
        const response = await baseFetch(input, init);
        return { ok: true, status: 200, json: async () => [...await response.json(), emptyTopic] };
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(await screen.findByRole("button", { name: /В банке/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить загрузку" })).toBeInTheDocument();
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
    expect(reviewCard.querySelectorAll('svg path[stroke-width="2.4"]')).toHaveLength(2);
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

  it("opens the Android topics panel from home while preserving the exercise and draft", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    voiceMock.available = true;
    vi.stubGlobal("fetch", mockApi());
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ }));
    await screen.findByRole("button", { name: "Завершить запись" });

    fireEvent.click(screen.getByRole("button", { name: "Темы" }));
    expect(screen.getByRole("button", { name: "Темы" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Тренировка" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByLabelText("Сменить тему")).not.toBeInTheDocument();
    expect(voiceMock.stops).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Тренировка" }));
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Moj odgovor");
    expect(screen.getByRole("button", { name: "Тренировка" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the user list only for an administrator", async () => {
    vi.stubGlobal("fetch", mockApi(false, [], "admin"));
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Пользователи/ }));
    expect(await screen.findByRole("heading", { name: "Пользователи" })).toBeInTheDocument();
    expect(await screen.findByText("learner@example.com")).toBeInTheDocument();
    expect(screen.getByText("12 · без лимита")).toBeInTheDocument();
  });

  it("moves the profile and sign out to settings and removes backend controls for administrators", async () => {
    vi.stubGlobal("fetch", mockApi(false, [], "admin"));
    render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    expect(screen.queryByRole("button", { name: "Выйти" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    expect(screen.getByRole("region", { name: "Аккаунт" })).toHaveTextContent("Ученик");
    expect(screen.getByRole("button", { name: "Выйти" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Настроить подключение" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Адрес общего backend")).not.toBeInTheDocument();
  });

  it("starts a session and displays the first exercise", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));

    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.queryByText("modal_verbs")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeDisabled();
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
      if (input.toString() === "/api/review-phrases/summary" && ++reviewCalls > 1) return pending;
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
    await waitFor(() => expect(screen.queryByText("Верно")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([url]) => url.toString().endsWith("/next-exercise"))).toHaveLength(1);
  });

  it("retries a failed Android prefetch on the first tap", async () => {
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
    await waitFor(() => expect(nextCalls).toBe(2));
    expect(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeInTheDocument();
    expect(screen.queryByText("Не удалось получить следующую фразу.")).not.toBeInTheDocument();
  });

  it("returns native Back from the phrase page to statistics before practice", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.stubGlobal("fetch", mockApi());
    render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    fireEvent.click(screen.getByRole("button", { name: "Статистика" }));
    fireEvent.click(await screen.findByRole("button", { name: "Фразы по темам →" }));
    await screen.findByRole("combobox", { name: "Тема" });
    await act(async () => nativeBackEvents.listener?.());
    await screen.findByLabelText("Итоги недели");
    expect(screen.getByRole("button", { name: "Статистика" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("combobox", { name: "Тема" })).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: "Фразы по темам →" }));
    expect(await screen.findByText("Желим да отворим рачун.")).toBeInTheDocument();
  });

  it("ignores a transcription after leaving practice and uses the new alphabet on retry", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let finishTranscription!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const transcription = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishTranscription = resolve; });
    let transcriptionCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/transcriptions"
        ? ++transcriptionCalls === 1 ? transcription : Promise.resolve({ ok: true, status: 200, json: async () => ({ text: "Platic\u0301u bankovnom karticom." }) })
        : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/transcriptions")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    fireEvent.click(screen.getByRole("radio", { name: /Кириллица/ }));
    await act(async () => { finishTranscription({ ok: true, status: 200, json: async () => ({ text: "Platic\u0301u bankovnom karticom." }) }); });
    fireEvent.click(screen.getByRole("button", { name: "Практика" }));
    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
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

  it("shows and applies the reviewed Allergičen suggestion when soft assistance is enabled", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi(false, [], "user", true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/transcriptions"
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({
          text: "Allergičen sam na neke antibiotike.", raw_text: "Allergičen sam na neke antibiotike.",
          transcription_id: "receipt", changes: [{ start: 0, end: 10, original: "Allergičen", replacement: "Alergičan", kind: "ending_ambiguity", action: "suggested", reason_code: "confirm_ambiguous_sound" }],
        }) }) : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    expect(answer).toHaveValue("Allergičen sam na neke antibiotike.");
    const call = fetchMock.mock.calls.find(([url]) => url.toString() === "/api/transcriptions");
    expect((call?.[1]?.body as FormData).get("assistance_enabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Принять подсказку" }));
    expect(answer).toHaveValue("Alergičan sam na neke antibiotike.");
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(answer).toHaveValue("Allergičen sam na neke antibiotike.");
  });

  it("keeps a usable answer and displays unavailable assistance when the extra analysis fails", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi(false, [], "user", true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => input.toString() === "/api/transcriptions"
      ? Promise.resolve({ ok: true, status: 200, json: async () => ({ text: "Moj odgovor.", raw_text: "Moj odgovor.", assistance_status: "unavailable" }) })
      : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    expect(await recordAnswer()).toHaveValue("Moj odgovor.");
    expect(screen.getByText(/Мягкие подсказки временно недоступны/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await screen.findByText("Верно");
    const call = fetchMock.mock.calls.find(([url]) => url.toString() === "/api/attempts");
    expect(JSON.parse(call?.[1]?.body as string)).not.toHaveProperty("transcription_id");
  });

  it("uses separate mobile web panels and preserves the draft across navigation and resize", async () => {
    let matches = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({ get matches() { return matches; },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    voiceMock.available = true;
    const fetchMock = mockApi(false, [], "admin");
    vi.stubGlobal("fetch", fetchMock);
    const rendered = render(<App />);
    try {
      await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
      expect(screen.getByRole("button", { name: "Тренировка" })).toHaveAttribute("aria-current", "page");
      expect(document.querySelector(".android-topics-page")).not.toBeVisible();
      expect(document.querySelector(".exercise-topic")).not.toHaveTextContent("1 / 10");
      const answer = await recordAnswer();
      fireEvent.change(answer, { target: { value: "Sačuvaj odgovor." } });
      fireEvent.click(screen.getByRole("button", { name: "Темы" }));
      expect(screen.getByLabelText("Ваш ответ")).not.toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: /В банке/ }));
      expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Sačuvaj odgovor.");
      fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
      fireEvent.click(screen.getByRole("button", { name: "Пользователи" }));
      await screen.findByRole("heading", { name: "Пользователи" });
      fireEvent.click(screen.getByRole("button", { name: "Тренировка" }));
      expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Sačuvaj odgovor.");
      act(() => { matches = false; listeners.forEach(listener => listener()); });
      expect(screen.getByRole("button", { name: "Практика" })).toBeInTheDocument();
      expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Sačuvaj odgovor.");
      act(() => { matches = true; listeners.forEach(listener => listener()); });
      expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Sačuvaj odgovor.");
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/sessions/start"))).toHaveLength(1);
    } finally {
      rendered.unmount();
      vi.unstubAllGlobals();
    }
  });

  it.each([false, true])("requires correcting a recovered transcript before grading (native=%s)", async (native) => {
    voiceMock.available = true;
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    const baseFetch = mockApi();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => input.toString().endsWith("/api/transcriptions")
      ? Promise.resolve({ ok: true, status: 200, json: async () => ({ text: "Платячу банковном картицом.", review_required: true }) })
      : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    expect(answer).toHaveValue("Платячу банковном картицом.");
    expect(screen.getByRole("alert")).toHaveTextContent("Исправьте текст перед проверкой");
    const check = screen.getByRole("button", { name: native ? "Проверить" : "Проверить ответ" });
    expect(check).toBeDisabled();
    fireEvent.submit(answer.closest("form")!);
    expect(fetchMock.mock.calls.some(([url]) => url.toString().endsWith("/api/attempts"))).toBe(false);
    fireEvent.change(answer, { target: { value: "Platiću bankovnom karticom." } });
    expect(check).toBeEnabled();
    expect(screen.queryByText(/Исправьте текст перед проверкой/)).not.toBeInTheDocument();
    fireEvent.click(check);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url.toString().endsWith("/api/attempts"));
      expect(JSON.parse(call?.[1]?.body as string).transcript_sr).toBe("Platiću bankovnom karticom.");
    });
  });

  it("offers manual entry after failed transcription without losing the current phrase", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/transcriptions"
        ? Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: { code: "transcription_empty" } }) })
        : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось расшифровать речь");
    expect(screen.getByRole("alert")).toHaveTextContent("Модель вернула пустую расшифровку");
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Ввести ответ вручную" }));
    const answer = screen.getByLabelText("Ваш ответ");
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Верно")).toBeInTheDocument();
    expect(answer).toHaveValue("Moj odgovor");
  });

  it("preserves an edited draft when another recording or transcription fails", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let transcriptions = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/transcriptions" && ++transcriptions === 2
        ? Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: "offline" }) })
        : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    expect(answer).toHaveValue("Moj odgovor");
    expect(screen.getByRole("button", { name: "Проверить ответ" })).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось расшифровать речь");
    expect(answer).toHaveValue("Moj odgovor");
    expect(screen.getByRole("button", { name: "Проверить ответ" })).toBeEnabled();

    voiceMock.failStart = true;
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось получить доступ к микрофону");
    expect(answer).toHaveValue("Moj odgovor");
  });

  it("ignores a late transcription after the user edits the draft", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let transcriptions = 0;
    let settleLate!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const lateTranscription = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { settleLate = resolve; });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/transcriptions" && ++transcriptions === 2 ? lateTranscription : baseFetch(input, init)));
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    await waitFor(() => expect(transcriptions).toBe(2));
    fireEvent.change(answer, { target: { value: "Ručni odgovor" } });
    await act(async () => { settleLate({ ok: true, status: 200, json: async () => ({ text: "Stari odgovor" }) }); });
    expect(answer).toHaveValue("Ručni odgovor");
    expect(screen.getByRole("button", { name: "Проверить ответ" })).toBeEnabled();
  });

  it("releases the microphone on web background and keeps the edited draft on resume", async () => {
    voiceMock.available = true;
    vi.stubGlobal("fetch", mockApi());
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ }));
    await screen.findByRole("button", { name: "Завершить запись" });
    const stopsBeforeBackground = voiceMock.stops;
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    fireEvent(document, new Event("visibilitychange"));
    expect(voiceMock.stops).toBe(stopsBeforeBackground + 1);
    expect(screen.getByRole("alert")).toHaveTextContent("Запись прервана");
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(answer).toHaveValue("Moj odgovor");
    expect(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeEnabled();

    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(answer).toHaveValue("Moj odgovor");
    expect(voiceMock.stops).toBe(stopsBeforeBackground + 1);
  });

  it("stops hidden web recording when leaving practice and preserves the draft on return", async () => {
    voiceMock.available = true;
    vi.stubGlobal("fetch", mockApi());
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ }));
    await screen.findByRole("button", { name: "Завершить запись" });
    const stopsBeforeNavigation = voiceMock.stops;

    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    expect(voiceMock.stops).toBe(stopsBeforeNavigation + 1);
    fireEvent.click(screen.getByRole("button", { name: "Практика" }));

    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Moj odgovor");
    expect(screen.getByRole("alert")).toHaveTextContent("Запись прервана");
    expect(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeEnabled();
    expect(voiceMock.stops).toBe(stopsBeforeNavigation + 1);
  });

  it("stops a microphone request that completes after the page is hidden", async () => {
    voiceMock.available = true;
    let allowMicrophone!: () => void;
    voiceMock.startGate = new Promise<void>((resolve) => { allowMicrophone = resolve; });
    vi.stubGlobal("fetch", mockApi());
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    expect(await screen.findByRole("button", { name: "Остановить запись" })).toBeInTheDocument();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { allowMicrophone(); });

    expect(voiceMock.stops).toBe(1);
    expect(screen.queryByRole("button", { name: "Завершить запись" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Запись прервана");
  });

  it("ignores a transcription returned after backgrounding and keeps manual recovery available", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let completeTranscription!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingTranscription = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { completeTranscription = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/transcriptions" ? pendingTranscription : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/transcriptions")).toBe(true));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { completeTranscription({ ok: true, status: 200, json: async () => ({ text: "Stari odgovor" }) }); });
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));

    expect(screen.queryByText("Stari odgovor")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ввести ответ вручную" }));
    expect(screen.getByLabelText("Ваш ответ")).toBeInTheDocument();
  });

  it("stops native recording on app background and removes its listener on unmount", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    voiceMock.available = true;
    vi.stubGlobal("fetch", mockApi());
    const rendered = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    await screen.findByRole("button", { name: "Завершить запись" });
    await waitFor(() => expect(nativeAppEvents.listener).toBeDefined());

    act(() => { nativeAppEvents.listener?.({ isActive: false }); });
    expect(voiceMock.stops).toBe(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Запись прервана");
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    rendered.unmount();
    await waitFor(() => expect(nativeAppEvents.removals).toBe(1));
  });

  it("removes a native listener that registers after the trainer unmounts", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    voiceMock.available = true;
    let completeRegistration!: () => void;
    nativeAppEvents.registrationGate = new Promise<void>((resolve) => { completeRegistration = resolve; });
    vi.stubGlobal("fetch", mockApi());
    const rendered = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    await screen.findByRole("button", { name: "Завершить запись" });

    rendered.unmount();
    const stopsAfterUnmount = voiceMock.stops;
    await act(async () => { completeRegistration(); });
    await waitFor(() => expect(nativeAppEvents.removals).toBe(1));
    nativeAppEvents.lastListener?.({ isActive: false });
    expect(voiceMock.stops).toBe(stopsAfterUnmount);
  });

  it("stops recording when the native pager scrolls away from practice", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    voiceMock.available = true;
    vi.stubGlobal("fetch", mockApi());
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    await screen.findByRole("button", { name: "Завершить запись" });
    const pager = document.querySelector<HTMLElement>(".android-pager")!;
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 400 });
    pager.scrollLeft = 800;

    fireEvent.scroll(pager);
    expect(voiceMock.stops).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Тренировка" }));
    expect(screen.getByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Запись прервана");
    expect(screen.getByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeEnabled();
  });

  it("lets an in-flight answer check finish after backgrounding without submitting twice", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let finishAttempt!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingAttempt = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishAttempt = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/attempts" ? pendingAttempt : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.toString() === "/api/attempts")).toHaveLength(1));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Moj odgovor");
    const response = await baseFetch("/api/attempts", { method: "POST" });
    await act(async () => { finishAttempt(response); });
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));

    expect(await screen.findByText("Верно")).toBeInTheDocument();
    const attempts = fetchMock.mock.calls.filter(([url]) => url.toString() === "/api/attempts");
    expect(attempts).toHaveLength(1);
    expect(JSON.parse(attempts[0][1]?.body as string).transcript_sr).toBe("Moj odgovor");
  });

  it("shows compact desktop topics and closes premium creation actions", async () => {
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<App />);
    await screen.findByRole("button", { name: /В банке/ });
    const grid = container.querySelector(".desktop-topic-grid")!;
    expect(grid.querySelectorAll(".desktop-topic-card")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /добавить тему|добавить фразу|Свои темы и фразы/ })).not.toBeInTheDocument();
    expect(container.querySelector(".topic-action")).toBeNull();
    expect(fetchMock.mock.calls.some(([url, init]) => init?.method === "POST" && ["/api/topics", "/api/review-phrases", "/api/review-phrases/prepare"].includes(url.toString()))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));
    expect(screen.queryByRole("button", { name: /add topic/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add phrase/ })).not.toBeInTheDocument();
  });

  it.each([false, true])("keeps only explanation and corrections inside analysis (native=%s)", async (native) => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    voiceMock.available = true;
    const base = mockApi();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await base(input, init);
      if (!input.toString().endsWith("/api/attempts")) return response;
      const attempt = await response.json();
      return { ok: true, json: async () => ({ ...attempt, analysis: {
        ...attempt.analysis, verdict: "needs_work",
        detailed_feedback_ru: "Для этого обращения нужна форма popravi. Произнесите окончание -i.",
        issues: [{ type: "grammar", skill_key: "modal_verbs", severity: .5, confidence: 1, evidence: "poprave", correction: "popravi", explanation_ru: "При обращении к одному человеку нужна форма повелительного наклонения." }],
      } }) };
    }));
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: native ? "Проверить" : "Проверить ответ" }));
    fireEvent.click(await screen.findByText("Разбор"));
    const analysis = screen.getByText("Разбор").closest("details")!;
    expect(analysis).toHaveTextContent("Для этого обращения нужна форма popravi. Произнесите окончание -i.");
    expect(analysis).toHaveTextContent("poprave → popravi");
    expect(analysis).toHaveTextContent("При обращении к одному человеку нужна форма повелительного наклонения.");
    expect(container.querySelector(".score-grid")).toBeNull();
    expect(analysis.querySelector("b, progress, meter")).toBeNull();
    for (const category of ["Смысл", "Грамматика", "Лексика", "Естественность"]) {
      expect(analysis).not.toHaveTextContent(category);
    }
  });

  it.each([false, true].flatMap((native) => [1, .999, .99].map((score) => ({ native, score }))))("shows analysis only below displayed 100% (native=$native, score=$score)", async ({ native, score }) => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    voiceMock.available = true;
    const base = mockApi();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await base(input, init);
      if (!input.toString().endsWith("/api/attempts")) return response;
      const attempt = await response.json();
      return { ok: true, json: async () => ({ ...attempt, overall_score: score }) };
    }));
    render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: native ? "Проверить" : "Проверить ответ" }));
    expect(await screen.findByText(`${Math.round(score * 100)}%`)).toBeInTheDocument();
    if (score >= .995) {
      expect(screen.queryByText("Разбор")).not.toBeInTheDocument();
      expect(screen.queryByText("Смысл и конструкция переданы правильно.")).not.toBeInTheDocument();
    } else {
      expect(screen.getByText("Разбор")).toBeInTheDocument();
    }
    expect(screen.getByText("Верно")).toBeInTheDocument();
    expect(document.querySelector(".feedback__score") === null).toBe(score === 1);
    expect(screen.getByRole("button", { name: native ? "Следующая" : /Следующая фраза/ })).toBeEnabled();
  });

  it.each([false, true])("hides the separate perfect score with animations disabled (native=%s)", async native => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(native);
    localStorage.setItem("serbotalk.rewards.animations", "false");
    voiceMock.available = true;
    const base = mockApi();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await base(input, init);
      if (!input.toString().endsWith("/api/attempts")) return response;
      return { ok: true, json: async () => ({ ...await response.json(), overall_score: 1 }) };
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Я хочу открыть счёт." });
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: native ? "Проверить" : "Проверить ответ" }));
    await waitFor(() => expect(document.querySelector(".feedback")).toBeInTheDocument());
    expect(document.querySelector(".feedback__score")).toBeNull();
    expect(document.querySelector(".reward-overlay")).toBeNull();
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

    expect(await screen.findByText("Верно")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Я хочу открыть счёт." })).not.toBeInTheDocument();
    expect(screen.getByText("Вариант перевода")).toBeInTheDocument();
    expect(screen.getByText("Ваш вариант")).toBeInTheDocument();
    expect(screen.queryByText("Ответ естественный и точный.")).not.toBeInTheDocument();
    expect(document.querySelector("#exercise-title")).not.toBeInTheDocument();
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

    expect(await screen.findByText("Верно")).toBeInTheDocument();
    expect(screen.queryByLabelText("Прогресс навыков")).not.toBeInTheDocument();
  });

  it("shows only the current week and separates attempts from mastered phrases", async () => {
    vi.stubGlobal("fetch", mockApi());
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Статистика/ }));
    expect(await screen.findByRole("navigation", { name: "Выбор недели" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Календарь занятий" })).toBeInTheDocument();
    expect(screen.getByLabelText("Итоги недели")).toHaveTextContent("10Повторений");
    expect(screen.getByRole("heading", { name: "Фразы по дням" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /График фраз по дням/ }).querySelectorAll(".daily-chart__column")).toHaveLength(7);
    expect(screen.getByRole("img", { name: /График фраз по дням/ }).querySelector('[title*="всего 10"]')).toHaveAttribute("title", expect.stringContaining("правильно 7, неправильно 3, выучено 1"));
    expect(screen.queryByRole("button", { name: /Прогресс/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Фразы по темам →" }));
    expect(await screen.findByRole("heading", { name: "В банке" })).toBeInTheDocument();
    expect(screen.getByText("Želim da otvorim račun.")).toBeInTheDocument();
    expect(screen.getByText("выучена")).toBeInTheDocument();
    expect(screen.getByLabelText("На странице")).toHaveValue("20");

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
      if (input.toString() === "/api/attempts") return baseFetch(input, init).then(async (response: Response) => ({
        ...response, json: async () => ({ ...(await response.json()), hint_penalty: 0.3 }),
      }));
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
    expect(await screen.findByText("Подсказки: −30%")).toBeInTheDocument();
    expect(screen.queryByText(/баллов/)).not.toBeInTheDocument();
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
    expect(await screen.findByText("Верно")).toBeInTheDocument();
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Нажмите ещё раз");
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Moj odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "хочу" }));
    await waitFor(() => expect(hintCalls).toBe(2));
    expect(answer).toHaveValue("Moj odgovor");
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await screen.findByText("Верно");
    const bodies = fetchMock.mock.calls.filter(([url]) => url === "/api/attempts")
      .map(([, init]) => JSON.parse(init?.body as string));
    expect(bodies).toHaveLength(1);
    expect(bodies[0].hinted_words).toEqual(["хочу"]);
  });

  it("refreshes the review count after an answer and when the page becomes visible", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi(false, [{ id: "review-1" }]);
    let summaryCount = 1;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/review-phrases/summary"
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ phrase_count: summaryCount }) })
        : baseFetch(input, init),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText("1 требуют практики");
    fireEvent.click(screen.getByRole("button", { name: /В банке/ }));
    await recordAnswer();
    summaryCount = 0;
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Список пока пуст")).toBeInTheDocument();

    summaryCount = 2;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(await screen.findByText("2 требуют практики")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => url.toString() === "/api/review-phrases" && init?.method !== "POST")).toBe(false);
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
    let summaryCalls = 0;
    let resolveLateSummary!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const lateSummary = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { resolveLateSummary = resolve; });
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === "/api/review-phrases/summary" && ++summaryCalls > 1) return lateSummary;
      if (url.endsWith("/next-exercise")) {
        nextExerciseCalls += 1;
        return Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: "No active review phrases" }) });
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await screen.findByText("1 требуют практики");
    fireEvent.click(await screen.findByRole("button", { name: /Фразы для повторения/ }));
    expect(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeInTheDocument();
    expect(nextExerciseCalls).toBe(0);
    fireEvent.change(await recordAnswer(), { target: { value: "Stari odgovor" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Верно")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    expect(await screen.findByText("Все фразы из карусели освоены. Отличная работа!")).toBeInTheDocument();
    await act(async () => { resolveLateSummary({ ok: true, status: 200, json: async () => ({ phrase_count: 1 }) }); });
    expect(screen.getByText("Все фразы из карусели освоены. Отличная работа!")).toHaveClass("review-congratulations");
    fireEvent.click(screen.getByRole("button", { name: "Выбрать тему" }));
    expect(screen.getByRole("heading", { name: "Выберите тему" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /В банке/ }));

    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeInTheDocument();
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

  it("keeps practice usable while statistics is still loading", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let finishStatistics!: (response: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const pendingStatistics = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishStatistics = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString().includes("/statistics/monthly") ? pendingStatistics : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    const answer = await recordAnswer();
    fireEvent.change(answer, { target: { value: "Čuvam nacrt" } });
    expect(fetchMock.mock.calls.some(([url]) => url.toString().includes("/statistics/monthly"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Статистика" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString().includes("/statistics/monthly"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Практика" }));
    expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Čuvam nacrt");
    expect(screen.getByRole("button", { name: "Проверить ответ" })).toBeEnabled();

    const month = new Date();
    await act(async () => finishStatistics({ ok: true, status: 200, json: async () => ({
      month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
      active_days: 0, total_phrases: 0, total_translations: 0, correct_translations: 0,
      mastered_phrases: 0, days: [],
    }) }));
    expect(screen.getByLabelText("Ваш ответ")).toHaveValue("Čuvam nacrt");
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
    expect(screen.queryByText("Верно")).not.toBeInTheDocument();
    expect(answer).toHaveValue("Želim da otvorim račun.");
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Верно")).toBeInTheDocument();
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
    expect(await screen.findByText("Верно")).toBeInTheDocument();
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
    expect(await screen.findByText("Верно")).toBeInTheDocument();
    await waitFor(() => expect(profileCalls).toBe(2));
    expect(screen.getByRole("button", { name: /Следующая фраза/ })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reuses the next phrase request ID on the first click after a failed prefetch", async () => {
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
    expect(await screen.findByText("Верно")).toBeInTheDocument();
    await waitFor(() => expect(nextCalls).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    expect(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    expect(await screen.findByText("Верно")).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: "хочу" }));
    expect(screen.getByText("želim")).toBeInTheDocument();
    await recordAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    expect(await screen.findByText("Верно")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    const nextWord = await screen.findByRole("button", { name: "хочу" });
    await act(async () => { settleHint(outcome === "result"
      ? { ok: true, status: 200, json: async () => ({ word_ru: "хочу", translation_sr: "želim", is_learning: true }) }
      : { ok: false, status: 503, json: async () => ({ detail: "unavailable" }) }); });
    expect(nextWord).not.toHaveClass("is-used");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a late next phrase after the user restarts practice", async () => {
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
    await screen.findByText("Верно");
    fireEvent.click(screen.getByRole("button", { name: /Следующая фраза/ }));
    fireEvent.click(screen.getByRole("button", { name: "SerboTalk — к практике" }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Настройки" }));
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
    fireEvent.click(screen.getByRole("button", { name: "SerboTalk — к практике" }));
    fireEvent.click(screen.getByRole("button", { name: /В банке/ }));
    expect(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ })).toBeInTheDocument();
    const response = outcome === "result"
      ? await baseFetch("/api/attempts", { method: "POST" })
      : { ok: false, status: 503, json: async () => ({ detail: { code: "analysis_unavailable", retryable: true } }) };
    await act(async () => { settleAttempt(response); });
    expect(screen.queryByText("Верно")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ваш ответ")).not.toBeInTheDocument();
  });

  it("ignores a transcription that finishes after practice restarts", async () => {
    voiceMock.available = true;
    const baseFetch = mockApi();
    let finishTranscription!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const transcription = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finishTranscription = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === "/api/transcriptions" ? transcription : baseFetch(input, init));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ответить голосом|Записать заново/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Завершить запись" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.toString() === "/api/transcriptions")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "SerboTalk — к практике" }));
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
      expect(await screen.findByText("Верно")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: number === 10 ? "Завершить тренировку" : /Следующая фраза/ }));
      if (number < 10) await screen.findByRole("heading", { name: `Фраза ${number + 1}.` });
    }
    expect(screen.getByRole("heading", { name: "Тренировка завершена" })).toBeInTheDocument();
    expect(screen.getByText("10 из 10 фраз проверено.")).toBeInTheDocument();
    expect(nextCalls).toBe(9);
  }, 20_000);
});
