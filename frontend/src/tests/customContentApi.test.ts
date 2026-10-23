import { afterEach, expect, it, vi } from "vitest";
import { addReviewPhrase, deleteCustomPhrase } from "../api/training";

vi.mock("../auth", () => ({ authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init) }));
afterEach(() => vi.unstubAllGlobals());

it("sends only the server receipt and topic, excluding all client-supplied canonical data", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "phrase-1" }) });
  vi.stubGlobal("fetch", fetchMock);
  await addReviewPhrase({ preparation_id: "receipt", source_ru: "tampered", canonical_sr: "tampered", intended_sr_variants: ["tampered"], word_hints: [] }, "custom-1");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ preparation_id: "receipt", topic_id: "custom-1" });
});

it("accepts successful empty DELETE responses without attempting JSON parsing", async () => {
  const json = vi.fn().mockRejectedValue(new Error("No body"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204, json }));
  await expect(deleteCustomPhrase("phrase-1")).resolves.toBeUndefined();
  expect(json).not.toHaveBeenCalled();
});
