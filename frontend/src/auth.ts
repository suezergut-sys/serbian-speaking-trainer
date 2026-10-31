import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

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

export async function signInWithGoogle(redirectPath: "/" | "/app" = "/"): Promise<void> {
  const native = Capacitor.isNativePlatform();
  const webPath = window.location.pathname === "/app" ? "/app" : redirectPath;
  const redirectTo = native ? nativeRedirectUrl : `${window.location.origin}${webPath}`;
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
