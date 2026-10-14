/** Keep possessives and hyphenated words intact for both display and coverage checks. */
export function splitSourcePhrase(source: string): string[] {
  return source.split(/([\p{L}]+(?:[-'’][\p{L}]+)*)/gu).filter(Boolean);
}

export function isSourceWord(part: string): boolean {
  return /^[\p{L}]+(?:[-'’][\p{L}]+)*$/u.test(part);
}

export function sourceWords(source: string): string[] {
  return splitSourcePhrase(source).filter(isSourceWord);
}
