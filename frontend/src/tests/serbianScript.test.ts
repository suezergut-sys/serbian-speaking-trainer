import { describe, expect, it } from "vitest";

import { displaySerbian, displaySerbianInRussianText, toSerbianCyrillic, toSerbianLatin } from "../serbianScript";

describe("Serbian alphabet conversion", () => {
  it("converts Serbian letters and digraphs in both directions", () => {
    expect(toSerbianCyrillic("Želim da otvorim račun. Ljubav, Njegoš i Džem."))
      .toBe("Желим да отворим рачун. Љубав, Његош и Џем.");
    expect(toSerbianLatin("Желим да отворим рачун. Љубав, Његош и Џем."))
      .toBe("Želim da otvorim račun. Ljubav, Njegoš i Džem.");
    expect(displaySerbian("Želim da otvorim račun.", "cyrillic")).toBe("Желим да отворим рачун.");
  });

  it("keeps Russian feedback intact while converting Serbian Latin examples", () => {
    expect(displaySerbianInRussianText("Лучше сказать: Želim da otvorim račun.", "cyrillic"))
      .toBe("Лучше сказать: Желим да отворим рачун.");
  });
});
