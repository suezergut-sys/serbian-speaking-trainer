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
    issues: [{ type: "vocabulary", skill_key: "vocabulary", severity: 0.8, confidence: 0.9,
      evidence: "otovrim", correction: "otvorim" }], demonstrated_skills: [],
  },
};

describe("AnswerResult", () => {
  afterEach(cleanup);
  it("marks only evidence explicitly reported in validated analysis", () => {
    render(<AnswerResult source="Я хочу открыть счёт." answer={attempt.transcript_sr} attempt={attempt} />);
    expect(screen.getByText("Я хочу открыть счёт.")).toBeInTheDocument();
    const userRow = screen.getByText("Ваш вариант").parentElement as HTMLElement;
    expect(within(userRow).getByText("otovrim")).toHaveClass("answer-mark--issue");
    expect(within(userRow).getByText("otovrim")).toHaveAttribute("title", "otvorim");
    expect(within(userRow).queryByText("Račun")).not.toBeInTheDocument();
    expect(userRow).toHaveTextContent("Račun želim otovrim.");
    expect(screen.getByText("Želim otvorim račun.")).toBeInTheDocument();
  });

  it("does not mark accepted correct wording against the canonical phrase", () => {
    render(<AnswerResult source="Русская фраза" answer="Mogu da otvorim račun." attempt={{ ...attempt, analysis: { ...attempt.analysis, verdict: "correct" } }} />);
    expect(document.querySelector("mark")).not.toBeInTheDocument();
    expect(screen.getByText("Вариант перевода")).toBeInTheDocument();
  });

  it("marks only the changed word inside a multiword evidence phrase", () => {
    const answer = "Nemam jutreneg prevoza danas.";
    const issue = { ...attempt.analysis.issues[0], evidence: "jutreneg prevoza", correction: "jutarnjeg prevoza" };
    render(<AnswerResult source="Русская фраза" answer={answer} attempt={{ ...attempt, analysis: { ...attempt.analysis, issues: [issue] } }} />);
    const marks = document.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("jutreneg");
    expect(screen.getByText("Ваш вариант").parentElement).toHaveTextContent(answer);
  });

  it("marks reordered and removed words, leaving unchanged words and pure insertions unmarked", () => {
    const issues = [
      { ...attempt.analysis.issues[0], evidence: "račun otvorim", correction: "otvorim račun" },
      { ...attempt.analysis.issues[0], evidence: "baš da idem", correction: "da idem" },
      { ...attempt.analysis.issues[0], evidence: "želim kući", correction: "želim da idem kući" },
    ];
    render(<AnswerResult source="Русская фраза" answer="račun otvorim, baš da idem; želim kući." attempt={{ ...attempt, analysis: { ...attempt.analysis, issues } }} />);
    expect(Array.from(document.querySelectorAll("mark"), (mark) => mark.textContent)).toEqual(["račun", "otvorim", "baš"]);
  });

  it("leaves repeated words unmarked when their alignment is ambiguous", () => {
    const issue = { ...attempt.analysis.issues[0], evidence: "da da idem", correction: "da idem" };
    render(<AnswerResult source="Русская фраза" answer="da da idem" attempt={{ ...attempt, analysis: { ...attempt.analysis, issues: [issue] } }} />);
    expect(document.querySelector("mark")).not.toBeInTheDocument();
  });

  it("does not mark ambiguous repeated text or a word fragment", () => {
    const answer = "račun račun računar";
    const issues = [
      { ...attempt.analysis.issues[0], evidence: "račun" },
      { ...attempt.analysis.issues[0], evidence: "rač" },
    ];
    render(<AnswerResult source="Русская фраза" answer={answer} attempt={{ ...attempt, analysis: { ...attempt.analysis, issues } }} />);
    expect(document.querySelector("mark")).not.toBeInTheDocument();
  });

  it("does not mark equivalent Unicode or alphabet variants, but retains a real extra letter", () => {
    const answer = "Platic\u0301u karticom. Alllergičan sam.";
    const issues = [
      { ...attempt.analysis.issues[0], evidence: "Platiću", correction: "Платићу" },
      { ...attempt.analysis.issues[0], evidence: "Alllergičan", correction: "Allergičan" },
    ];
    render(<AnswerResult source="Русская фраза" answer={answer} attempt={{ ...attempt, analysis: { ...attempt.analysis, issues } }} alphabet="cyrillic" />);
    const marks = document.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("Алллергичан");
    expect(screen.getByText("Ваш вариант").parentElement).toHaveTextContent("Платићу картицом. Алллергичан сам.");
  });
});
