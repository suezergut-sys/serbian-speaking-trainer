export type SerbianAlphabet = "latin" | "cyrillic";

const latinToCyrillic: Record<string, string> = {
  a: "а", b: "б", c: "ц", č: "ч", ć: "ћ", d: "д", dž: "џ", đ: "ђ",
  e: "е", f: "ф", g: "г", h: "х", i: "и", j: "ј", k: "к", l: "л",
  lj: "љ", m: "м", n: "н", nj: "њ", o: "о", p: "п", r: "р",
  s: "с", š: "ш", t: "т", u: "у", v: "в", z: "з", ž: "ж",
};

const cyrillicToLatin = Object.fromEntries(
  Object.entries(latinToCyrillic).map(([latin, cyrillic]) => [cyrillic, latin]),
) as Record<string, string>;

export function toSerbianCyrillic(text: string): string {
  return text.replace(/dž|lj|nj|[a-zčćđšž]/giu, (part) => {
    const translated = latinToCyrillic[part.toLocaleLowerCase("sr")];
    return part[0] === part[0].toLocaleUpperCase("sr") ? translated.toLocaleUpperCase("sr") : translated;
  });
}

export function toSerbianLatin(text: string): string {
  return text.replace(/[а-бвгдђежзијклљмнњопрстћуфхцчџш]/giu, (part) => {
    const translated = cyrillicToLatin[part.toLocaleLowerCase("sr")];
    return part === part.toLocaleUpperCase("sr")
      ? translated[0].toLocaleUpperCase("sr") + translated.slice(1)
      : translated;
  });
}

export function displaySerbian(text: string, alphabet: SerbianAlphabet): string {
  const latin = toSerbianLatin(text);
  return alphabet === "cyrillic" ? toSerbianCyrillic(latin) : latin;
}

export function displaySerbianInRussianText(text: string, alphabet: SerbianAlphabet): string {
  return alphabet === "cyrillic" ? toSerbianCyrillic(text) : text;
}

function storageKey(userId: string): string {
  return `serbotalk.serbian-alphabet.${userId}`;
}

export function readSerbianAlphabet(userId: string): SerbianAlphabet {
  try {
    return window.localStorage.getItem(storageKey(userId)) === "cyrillic" ? "cyrillic" : "latin";
  } catch {
    return "latin";
  }
}

export function saveSerbianAlphabet(userId: string, alphabet: SerbianAlphabet): void {
  try {
    window.localStorage.setItem(storageKey(userId), alphabet);
  } catch {
    // The choice remains active for this session when storage is unavailable.
  }
}
