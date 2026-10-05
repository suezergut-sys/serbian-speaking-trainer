import { afterEach, expect, it, vi } from "vitest";
import { transcribeAudio } from "../api/training";

vi.mock("../auth", () => ({
  authenticatedFetch: (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }),
}));

afterEach(() => vi.useRealTimers());

it("distinguishes a 45-second request timeout from lifecycle cancellation", async () => {
  vi.useFakeTimers();
  const timedOut = transcribeAudio("exercise", new Blob());
  const assertion = expect(timedOut).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(45_000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);

  const controller = new AbortController();
  const cancelled = transcribeAudio("exercise", new Blob(), controller.signal);
  const cancellation = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await cancellation;
  expect(vi.getTimerCount()).toBe(0);
});
