import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ native: false, signInWithOAuth: vi.fn(), open: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { signInWithOAuth: state.signInWithOAuth } }) }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => state.native } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: state.open } }));
vi.stubEnv("VITE_SUPABASE_URL", "https://synthetic.supabase.co");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
const { signInWithGoogle } = await import("../auth");
afterEach(() => { state.native = false; vi.clearAllMocks(); window.history.replaceState(null, "", "/"); });

it.each([{ page: "/", path: "/app", expected: "/app" }, { page: "/app", path: "/", expected: "/app" }, { page: "/", path: "/", expected: "/" }])("preserves the requested web callback: $page → $expected", async ({ page, path, expected }) => {
  window.history.replaceState(null, "", page);
  state.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
  await signInWithGoogle(path as "/" | "/app");
  expect(state.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: window.location.origin + expected, skipBrowserRedirect: false } });
});

it("preserves the native callback and system browser", async () => {
  state.native = true;
  state.signInWithOAuth.mockResolvedValue({ data: { url: "https://synthetic.supabase.co/auth/v1/authorize" }, error: null });
  await signInWithGoogle("/app");
  expect(state.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "com.serbiantalk.trainer://auth/callback", skipBrowserRedirect: true } });
  expect(state.open).toHaveBeenCalledWith({ url: "https://synthetic.supabase.co/auth/v1/authorize" });
});
