import { afterEach, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { fetchCurrentUser } from "../api/users";

vi.mock("../auth", () => ({ authenticatedFetch: (...args: Parameters<typeof fetch>) => fetch(...args) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps web profile reads free from any native claim", async () => {
  vi.spyOn(Capacitor, "getPlatform").mockReturnValue("web");
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_tier: "free" }) });
  vi.stubGlobal("fetch", request);
  expect((await fetchCurrentUser()).access_tier).toBe("free");
  expect(request).toHaveBeenCalledWith("/api/auth/me", { signal: undefined });
});

it("claims account-wide Premium on every Android profile refresh", async () => {
  vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_tier: "premium" }) });
  vi.stubGlobal("fetch", request);
  const controller = new AbortController();
  expect((await fetchCurrentUser(controller.signal)).access_tier).toBe("premium");
  expect(request).toHaveBeenCalledWith("/api/auth/me/android-premium", expect.objectContaining({
    method: "POST", signal: controller.signal, body: JSON.stringify({ platform: "android" }), cache: "no-store",
  }));
});

it.each([false, true])("does not expose a free Android account if activation fails (http=%s)", async httpFailure => {
  vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: !httpFailure, status: 503, json: async () => ({ access_tier: "free" }) }));
  await expect(fetchCurrentUser()).rejects.toThrow();
});
