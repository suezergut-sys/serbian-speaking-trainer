import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function mockApi(omitLearnerUpdates = false, initialReviewPhrases: Array<Record<string, unknown>> = []) {
    return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      let body: unknown;
      if (url === "/api/health") body = { status: "ok", service: "serbian-speaking-trainer" };
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
      else if (url === "/api/sessions") {
        const request = JSON.parse(init?.body as string);
        body = {
        id: "session-1", status: "active", level: "A2", started_at: "2026-09-16T10:00:00Z",
        requested_length: 10,
        topic: {
          id: request.review_mode ? "review-phrases" : "bank", title_ru: request.review_mode ? "Фразы для повторения" : "В банке", description_ru: "Счёт и платежи", source: request.review_mode ? "custom" : "preset",
          target_level: "A2", likely_intents: ["открыть счёт"], suggested_vocabulary: ["račun"],
          excluded_domains: [], normalized_prompt_context: "Разговор в банке",
        },
      };}
      else if (url.endsWith("/next-exercise")) body = {
        id: "exercise-1", session_id: "session-1", source_ru: "Я хочу открыть счёт.",
        targeted_skills: ["modal_verbs"], expected_level: "A2", difficulty: 1,
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

  it("loads health and available topics", async () => {
    vi.stubGlobal("fetch", mockApi());

    render(<App />);

    expect(screen.getByRole("heading", { name: /Практикуйтесь в реальных ситуациях/ })).toBeInTheDocument();
    expect(await screen.findByRole("status", { name: "Backend готов" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /В банке/ })).toBeInTheDocument();
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({ method: "POST" })));
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

    fireEvent.click(screen.getByRole("button", { name: /Статистика/ }));
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
    const fetchMock = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /В банке/ }));
    fireEvent.click(screen.getByRole("button", { name: /Начать тренировку/ }));
    fireEvent.click(await screen.findByRole("button", { name: "хочу" }));
    expect(await screen.findByText("želim")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ваш ответ"), { target: { value: "Želim da otvorim račun." } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить ответ" }));
    await waitFor(() => {
      const attemptCall = fetchMock.mock.calls.find(([url]) => url === "/api/attempts");
      expect(JSON.parse(attemptCall?.[1]?.body as string).hinted_words).toEqual(["хочу"]);
    });
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

    fireEvent.click(await screen.findByRole("button", { name: /Фразы для повторения/ }));

    expect(await screen.findByRole("heading", { name: "Я хочу открыть счёт." })).toBeInTheDocument();
    expect(screen.queryByLabelText("Фразы для повторения")).not.toBeInTheDocument();
    const sessionCall = fetchMock.mock.calls.find(([url]) => url === "/api/sessions");
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
        if (nextExerciseCalls === 2) {
          return Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: "No active review phrases" }) });
        }
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Фразы для повторения/ }));
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
