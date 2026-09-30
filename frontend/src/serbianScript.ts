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

const visualCyrillicToLatin: Record<string, string> = {
  а: "a", е: "e", о: "o", с: "c", р: "p", х: "x", у: "y",
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H",
  О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y",
};

export function toSerbianCyrillic(text: string): string {
  return text.normalize("NFC").replace(/dž|lj|nj|[a-zčćđšž]/giu, (part) => {
    const translated = latinToCyrillic[part.toLocaleLowerCase("sr")];
    if (!translated) return part;
    return part[0] === part[0].toLocaleUpperCase("sr") ? translated.toLocaleUpperCase("sr") : translated;
  });
}

export function toSerbianLatin(text: string): string {
  return text.normalize("NFC").replace(/[\p{L}\p{M}]+/gu, (token) => {
    const letters = Array.from(token).filter((character) => /\p{L}/u.test(character));
    const latinCount = letters.filter((character) => /\p{Script=Latin}/u.test(character)).length;
    const cyrillicCount = letters.filter((character) => /\p{Script=Cyrillic}/u.test(character)).length;
    const keyboardAdjusted = latinCount > cyrillicCount
      ? token.replace(/[аеосрхуАВЕКМНОРСТХУ]/g, (part) => visualCyrillicToLatin[part])
      : token;
    return keyboardAdjusted.replace(/[а-бвгдђежзијклљмнњопрстћуфхцчџш]/giu, (part) => {
      const translated = cyrillicToLatin[part.toLocaleLowerCase("sr")];
      return part === part.toLocaleUpperCase("sr")
        ? translated[0].toLocaleUpperCase("sr") + translated.slice(1)
        : translated;
    });
  });
}

export function displaySerbian(text: string, alphabet: SerbianAlphabet): string {
  const latin = toSerbianLatin(text);
  return alphabet === "cyrillic" ? toSerbianCyrillic(latin) : latin;
}

export function displaySerbianInRussianText(text: string, alphabet: SerbianAlphabet): string {
  return alphabet === "cyrillic" ? toSerbianCyrillic(text) : text.normalize("NFC");
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
