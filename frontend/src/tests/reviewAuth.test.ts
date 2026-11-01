import { afterEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ setSession: vi.fn(), signInWithPassword: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: sdk }) }));
vi.stubEnv("VITE_SUPABASE_URL", "https://synthetic.supabase.co");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
const { signInReviewAccount } = await import("../auth");
afterEach(() => { vi.unstubAllGlobals(); sdk.setSession.mockReset(); sdk.signInWithPassword.mockReset(); });

it("sends the alias to the API and installs the ordinary Supabase session", async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "synthetic-access", refresh_token: "synthetic-refresh" }) });
  vi.stubGlobal("fetch", request); sdk.setSession.mockResolvedValue({ error: null });
  await signInReviewAccount("serbotalkreview", "synthetic-password");
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ username: "serbotalkreview", password: "synthetic-password" });
  expect(sdk.setSession).toHaveBeenCalledExactlyOnceWith({ access_token: "synthetic-access", refresh_token: "synthetic-refresh" });
  expect(sdk.signInWithPassword).not.toHaveBeenCalled();
});

it("preserves existing email sign-in", async () => {
  sdk.signInWithPassword.mockResolvedValue({ error: null });
  await signInReviewAccount("review@example.com", "synthetic-password");
  expect(sdk.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email: "review@example.com", password: "synthetic-password" });
});

it.each([{ ok: false }, { ok: true, json: async () => ({ access_token: "missing-refresh" }) }])("rejects failed or invalid token responses", async response => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(signInReviewAccount("serbotalkreview", "synthetic-password")).rejects.toThrow("Review sign-in failed");
  expect(sdk.setSession).not.toHaveBeenCalled();
});
