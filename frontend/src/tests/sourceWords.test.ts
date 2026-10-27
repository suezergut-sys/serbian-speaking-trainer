import { expect, it } from "vitest";
import { splitHintFragments } from "../sourceWords";

it.each(["Мне не с кем поговорить.", "мне не с кем поговорить."])("matches short fragments preserving %s", source => {
  const parts = splitHintFragments(source, ["мне", "не", "с", "кем", "мне не с кем", "поговорить"]);
  expect(parts).toEqual([source.slice(0, 12), " ", "поговорить", "."]);
  expect(parts.join("")).toBe(source);
});

it("does not match inside words or across punctuation; preserves contractions and repeated fragments", () => {
  expect(splitHintFragments("Some nobody", ["me", "body"])).toEqual(["Some", " ", "nobody"]);
  expect(splitHintFragments("У, нас дети", ["у нас"])).toEqual(["У", ", ", "нас", " ", "дети"]);
  expect(splitHintFragments("I don't have time; I don't have money.", ["i don't have", "time", "money"])).toEqual([
    "I don't have", " ", "time", "; ", "I don't have", " ", "money", "."]);
});
