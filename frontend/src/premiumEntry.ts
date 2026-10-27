// One tab, one successful sign-in, at most 30 minutes. No arbitrary redirect URLs.
const key = "serbotalk.android-premium-entry";
const lifetimeMs = 30 * 60 * 1000;

function requested(): boolean {
  const url = new URL(window.location.href);
  return url.pathname === "/app" && url.searchParams.get("from") === "android"
    && url.searchParams.get("next") === "premium";
}

export function rememberPremiumEntry(): void {
  if (!requested()) {
    // A fresh ordinary visit must not inherit an abandoned Android sign-in.
    if (!new URL(window.location.href).searchParams.has("code")) clearPremiumEntry();
    return;
  }
  try { sessionStorage.setItem(key, String(Date.now() + lifetimeMs)); } catch { /* URL still works without storage. */ }
}

export function hasPremiumEntry(): boolean {
  if (requested()) return true;
  try {
    const expires = Number(sessionStorage.getItem(key));
    return Number.isFinite(expires) && expires > Date.now() && expires <= Date.now() + lifetimeMs;
  } catch { return false; }
}

export function clearPremiumEntry(): void {
  try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
  if (!requested()) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("from");
  url.searchParams.delete("next");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}
