import { afterEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ signInWithOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("../auth", () => ({ getSupabase: () => ({ auth: sdk }) }));
import { isEmailOtpEnabled, requestEmailCode, verifyEmailCode } from "../emailAuth";
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it("requires an explicit rollout flag", () => {
  vi.stubEnv("VITE_EMAIL_OTP_ENABLED", "false"); expect(isEmailOtpEnabled()).toBe(false);
  vi.stubEnv("VITE_EMAIL_OTP_ENABLED", "true"); expect(isEmailOtpEnabled()).toBe(true);
});
it("uses Supabase email OTP signup and session verification", async () => {
  sdk.signInWithOtp.mockResolvedValue({ error: null });
  sdk.verifyOtp.mockResolvedValue({ data: { session: { access_token: "synthetic" } }, error: null });
  await requestEmailCode(" demo@example.invalid ");
  await verifyEmailCode(" demo@example.invalid ", " 12345678 ");
  expect(sdk.signInWithOtp).toHaveBeenCalledExactlyOnceWith({ email: "demo@example.invalid", options: { shouldCreateUser: true } });
  expect(sdk.verifyOtp).toHaveBeenCalledExactlyOnceWith({ email: "demo@example.invalid", token: "12345678", type: "email" });
});
it("hides provider details and rejects a missing session", async () => {
  sdk.signInWithOtp.mockResolvedValue({ error: { message: "private" } });
  await expect(requestEmailCode("demo@example.invalid")).rejects.toThrow("Email code request failed");
  sdk.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
  await expect(verifyEmailCode("demo@example.invalid", "12345678")).rejects.toThrow("Email code verification failed");
});
