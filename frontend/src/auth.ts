import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { apiUrl } from "./api/baseUrl";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
const nativeRedirectUrl = "com.serbiantalk.trainer://auth/callback";

let client: SupabaseClient | undefined;
let nativeListenerReady = false;

export function isAuthConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabase(): SupabaseClient {
  if (!isAuthConfigured()) throw new Error("Supabase Auth is not configured");
  client ??= createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: !Capacitor.isNativePlatform(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

export async function initializeAuth(): Promise<Session | null> {
  if (!isAuthConfigured()) return null;
  if (Capacitor.isNativePlatform() && !nativeListenerReady) {
    nativeListenerReady = true;
    await CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(nativeRedirectUrl)) return;
      const code = new URL(url).searchParams.get("code");
      if (code) await getSupabase().auth.exchangeCodeForSession(code);
      await Browser.close();
    });
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  if (!isAuthConfigured()) return () => undefined;
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    if (event !== "INITIAL_SESSION") callback(session);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithGoogle(): Promise<void> {
  const native = Capacitor.isNativePlatform();
  const redirectTo = native ? nativeRedirectUrl : `${window.location.origin}/`;
  const { data, error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: native },
  });
  if (error) throw error;
  if (native && data.url) await Browser.open({ url: data.url });
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function signInReviewAccount(username: string, password: string): Promise<void> {
  if (username.includes("@")) {
    const { error } = await getSupabase().auth.signInWithPassword({ email: username, password });
    if (error) throw new Error("Review sign-in failed");
    return;
  }
  const response = await fetch(apiUrl("/api/auth/review-login"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }), cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Review sign-in failed");
  const tokens: unknown = await response.json();
  if (!tokens || typeof tokens !== "object" || !("access_token" in tokens) || !("refresh_token" in tokens)
    || typeof tokens.access_token !== "string" || !tokens.access_token
    || typeof tokens.refresh_token !== "string" || !tokens.refresh_token) throw new Error("Review sign-in failed");
  const { error } = await getSupabase().auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
  if (error) throw new Error("Review sign-in failed");
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const startedAt = performance.now();
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw error ?? new Error("Authentication required");
  const sessionMs = performance.now() - startedAt;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  const response = await fetch(input, { ...init, headers });
  if (new URLSearchParams(window.location.search).has("perf")) {
    const path = new URL(input.toString(), window.location.origin).pathname;
    console.info(`SerboTalk timing ${JSON.stringify({
      path,
      session_ms: Math.round(sessionMs),
      request_ms: Math.round(performance.now() - startedAt - sessionMs),
      server_timing: response.headers.get("Server-Timing"),
    })}`);
  }
  return response;
}
