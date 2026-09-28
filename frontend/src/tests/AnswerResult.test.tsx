import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerResult } from "../AnswerResult";
import type { Attempt } from "../types/training";

const attempt: Attempt = {
  id: "attempt-1", exercise_id: "exercise-1", transcript_sr: "Račun želim otovrim.",
  overall_score: .5, base_score: .5, hint_penalty: 0,
  analysis: {
    verdict: "needs_work", semantic_score: .5, grammar_score: .5, lexical_score: .5,
    naturalness_score: .5, pronunciation_score: null, fluency_score: 1,
    corrected_sr: "Želim otvorim račun.", short_feedback_ru: "Исправьте ответ.",
    detailed_feedback_ru: "Исправьте порядок и написание.", accepted_alternatives: [],
    issues: [], demonstrated_skills: [],
  },
};

describe("AnswerResult", () => {
  afterEach(cleanup);
  it("shows the original answer and marks moved and misspelled words", () => {
    render(<AnswerResult source="Я хочу открыть счёт." answer={attempt.transcript_sr} attempt={attempt} />);
    expect(screen.getByText("Я хочу открыть счёт.")).toBeInTheDocument();
    const userRow = screen.getByText("Ваш вариант").parentElement as HTMLElement;
    expect(within(userRow).getByText("Račun")).toHaveClass("answer-mark--order");
    expect(within(userRow).getByText("otovrim")).toHaveClass("answer-mark--spelling");
    expect(screen.getByText("Želim otvorim račun.")).toBeInTheDocument();
  });

  it("does not mark accepted correct wording against the canonical phrase", () => {
    render(<AnswerResult source="Русская фраза" answer="Mogu da otvorim račun." attempt={{ ...attempt, analysis: { ...attempt.analysis, verdict: "correct" } }} />);
    expect(document.querySelector("mark")).not.toBeInTheDocument();
  });
});
