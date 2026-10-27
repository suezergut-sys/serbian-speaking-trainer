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

/** Match complete short fragments; preserve source spelling, punctuation and spaces. */
export function splitHintFragments(source: string, keys: string[]): string[] {
  const tokens = splitSourcePhrase(source);
  const candidates = [...new Set(keys.map(key => key.toLocaleLowerCase("ru-RU")))].filter(key => {
    const count = sourceWords(key).length;
    return count > 0 && count <= 4;
  }).sort((a, b) => b.length - a.length);
  const result: string[] = [];
  for (let i = 0; i < tokens.length;) {
    if (!isSourceWord(tokens[i])) { result.push(tokens[i++]); continue; }
    let end = i;
    const match = candidates.find(key => {
      let text = "";
      for (let j = i; j < tokens.length && text.length <= key.length; j++) {
        text += tokens[j];
        if (text.toLocaleLowerCase("ru-RU") === key && isSourceWord(tokens[j])) { end = j; return true; }
      }
      return false;
    });
    if (match) { result.push(tokens.slice(i, end + 1).join("")); i = end + 1; }
    else result.push(tokens[i++]);
  }
  return result;
}
