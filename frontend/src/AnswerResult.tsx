import type { Attempt } from "./types/training";
import { displaySerbian, type SerbianAlphabet } from "./serbianScript";

type MarkedRange = { start: number; end: number; explanation: string };

function evidenceRanges(answer: string, attempt: Attempt): MarkedRange[] {
  if (attempt.analysis.verdict === "correct") return [];
  const ranges: MarkedRange[] = [];
  const lowerAnswer = answer.toLocaleLowerCase("sr-Latn");
  const isWord = (character: string | undefined) => Boolean(character && /[\p{L}\p{N}]/u.test(character));
  for (const issue of attempt.analysis.issues) {
    if (issue.severity <= 0) continue;
    const evidence = issue.evidence.trim();
    if (!evidence) continue;
    const start = lowerAnswer.indexOf(evidence.toLocaleLowerCase("sr-Latn"));
    const end = start + evidence.length;
    if (start < 0 || lowerAnswer.indexOf(evidence.toLocaleLowerCase("sr-Latn"), end) >= 0) continue;
    if ((isWord(evidence[0]) && isWord(answer[start - 1])) || (isWord(evidence.at(-1)) && isWord(answer[end]))) continue;
    if (ranges.some((range) => start < range.end && end > range.start)) continue;
    ranges.push({ start, end, explanation: issue.correction ?? issue.evidence });
  }
  return ranges.sort((left, right) => left.start - right.start);
}

function HighlightedAnswer({ answer, attempt, alphabet }: { answer: string; attempt: Attempt; alphabet: SerbianAlphabet }) {
  const ranges = evidenceRanges(answer, attempt);
  const content: React.ReactNode[] = [];
  let cursor = 0;
  for (const [index, range] of ranges.entries()) {
    if (cursor < range.start) content.push(<span key={`text-${index}`}>{displaySerbian(answer.slice(cursor, range.start), alphabet)}</span>);
    content.push(<mark className="answer-mark answer-mark--issue" title={displaySerbian(range.explanation, alphabet)} key={`issue-${index}`}>{displaySerbian(answer.slice(range.start, range.end), alphabet)}</mark>);
    cursor = range.end;
  }
  content.push(<span key="tail">{displaySerbian(answer.slice(cursor), alphabet)}</span>);
  return <span className="result-phrase__text" lang={alphabet === "cyrillic" ? "sr-Cyrl" : "sr-Latn"}>{content}</span>;
}

export function AnswerResult({ source, answer, attempt, alphabet = "latin" }: { source: string; answer: string; attempt: Attempt; alphabet?: SerbianAlphabet }) {
  return <div className="result-phrases">
    <div className="result-phrase"><small>Фраза на русском</small><span className="result-phrase__text">{source}</span></div>
    <div className="result-phrase"><small>Ваш вариант</small><HighlightedAnswer answer={answer} attempt={attempt} alphabet={alphabet} /></div>
    <div className="result-phrase correction"><small>{attempt.analysis.verdict === "correct" ? "Вариант перевода" : "Правильный вариант"}</small><span className="result-phrase__text" lang={alphabet === "cyrillic" ? "sr-Cyrl" : "sr-Latn"}>{displaySerbian(attempt.analysis.corrected_sr, alphabet)}</span></div>
  </div>;
}
