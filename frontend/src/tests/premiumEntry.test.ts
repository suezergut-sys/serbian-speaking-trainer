import { afterEach, expect, it, vi } from "vitest";
import { rememberPremiumEntry, hasPremiumEntry, clearPremiumEntry } from "../premiumEntry";

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

it("retains the one-time destination across a Google callback without the entry marker", () => {
  window.history.replaceState(null, "", "/app?from=android&next=premium");
  rememberPremiumEntry();
  window.history.replaceState(null, "", "/app?code=synthetic#callback");
  rememberPremiumEntry();
  expect(hasPremiumEntry()).toBe(true);
  clearPremiumEntry();
  expect(hasPremiumEntry()).toBe(false);
  expect(window.location.search).toBe("?code=synthetic");
});

it.each(["/app", "/", "/app?next=premium", "/app?from=android&next=https://example.invalid", "/?from=android&next=premium"])("ignores ordinary and unsupported destinations: %s", path => {
  window.history.replaceState(null, "", path);
  rememberPremiumEntry();
  expect(hasPremiumEntry()).toBe(false);
});

it("expires abandoned sign-in intent", () => {
  window.history.replaceState(null, "", "/app?from=android&next=premium");
  rememberPremiumEntry();
  window.history.replaceState(null, "", "/app");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60 * 1000);
  expect(hasPremiumEntry()).toBe(false);
});

it("handles unavailable storage and preserves unrelated URL state", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Unavailable"); });
  window.history.replaceState(null, "", "/app?from=android&next=premium&perf=1#section");
  expect(() => rememberPremiumEntry()).not.toThrow();
  expect(hasPremiumEntry()).toBe(true);
  clearPremiumEntry();
  expect(window.location.search + window.location.hash).toBe("?perf=1#section");
});

it("clears abandoned intent on an ordinary visit", () => {
  window.history.replaceState(null, "", "/app?from=android&next=premium");
  rememberPremiumEntry();
  window.history.replaceState(null, "", "/app");
  rememberPremiumEntry();
  expect(hasPremiumEntry()).toBe(false);
});
