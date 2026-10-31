import { Capacitor } from "@capacitor/core";
import { getSupabase } from "./auth";

export function isEmailOtpEnabled(): boolean {
  return !Capacitor.isNativePlatform() && import.meta.env.MODE !== "android" && import.meta.env.VITE_EMAIL_OTP_ENABLED === "true";
}

export async function requestEmailCode(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: email.trim(), options: { shouldCreateUser: true },
  });
  if (error) throw new Error("Email code request failed");
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const { data, error } = await getSupabase().auth.verifyOtp({
    email: email.trim(), token: token.trim(), type: "email",
  });
  if (error || !data.session) throw new Error("Email code verification failed");
}
