import type { Attempt } from "./types/training";

type Highlight = "correct" | "spelling" | "order";

function compareWords(answer: string, correction: string): Highlight[] {
  const words = (value: string) => value.match(/[\p{L}\p{N}]+/gu)?.map((word) => word.toLocaleLowerCase("sr-Latn")) ?? [];
  const actual = words(answer);
  const expected = words(correction);
  const matches = Array.from({ length: actual.length + 1 }, () => Array<number>(expected.length + 1).fill(0));
  for (let i = actual.length - 1; i >= 0; i--) {
    for (let j = expected.length - 1; j >= 0; j--) {
      matches[i][j] = actual[i] === expected[j] ? matches[i + 1][j + 1] + 1 : Math.max(matches[i + 1][j], matches[i][j + 1]);
    }
  }
  const result: Highlight[] = Array(actual.length).fill("spelling");
  const unused = new Map<string, number>();
  let i = 0;
  let j = 0;
  while (i < actual.length && j < expected.length) {
    if (actual[i] === expected[j]) { result[i] = "correct"; i++; j++; }
    else if (matches[i + 1][j] >= matches[i][j + 1]) i++;
    else j++;
  }
  for (const word of expected) unused.set(word, (unused.get(word) ?? 0) + 1);
  actual.forEach((word, index) => {
    if (result[index] === "correct") unused.set(word, (unused.get(word) ?? 0) - 1);
  });
  actual.forEach((word, index) => {
    if (result[index] !== "correct" && (unused.get(word) ?? 0) > 0) {
      result[index] = "order";
      unused.set(word, (unused.get(word) ?? 0) - 1);
    }
  });
  return result;
}

function HighlightedAnswer({ answer, attempt }: { answer: string; attempt: Attempt }) {
  const parts = answer.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? [];
  const highlights = attempt.analysis.verdict === "correct" ? [] : compareWords(answer, attempt.analysis.corrected_sr);
  let wordIndex = 0;
  return <span className="result-phrase__text">{parts.map((part, index) => {
    if (!/[\p{L}\p{N}]/u.test(part)) return <span key={index}>{part}</span>;
    const kind = highlights[wordIndex++] ?? "correct";
    return kind === "correct" ? <span key={index}>{part}</span> : <mark className={`answer-mark answer-mark--${kind}`} title={kind === "order" ? "Порядок слов" : "Написание или выбор слова"} key={index}>{part}</mark>;
  })}</span>;
}

export function AnswerResult({ source, answer, attempt }: { source: string; answer: string; attempt: Attempt }) {
  return <div className="result-phrases">
    <div className="result-phrase"><small>Фраза на русском</small><span className="result-phrase__text">{source}</span></div>
    <div className="result-phrase"><small>Ваш вариант</small><HighlightedAnswer answer={answer} attempt={attempt} /></div>
    <div className="result-phrase correction"><small>Правильный вариант</small><span className="result-phrase__text">{attempt.analysis.corrected_sr}</span></div>
  </div>;
}
