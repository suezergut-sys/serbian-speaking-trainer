import { t } from "./i18n";
import { useState } from "react";
import { signInReviewAccount } from "./auth";

export function ReviewLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <details className="review-login">
    <summary>{t("Вход для проверки / Review access")}</summary>
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setError(false);
      try { await signInReviewAccount(email.trim(), password); setPassword(""); }
      catch { setPassword(""); setError(true); }
      finally { setBusy(false); }
    }}>
      <p>Use the dedicated review account provided in Play Console.</p>
      <label>Username or email<input type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="serbotalkreview" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" required autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{t(busy ? "Signing in…" : "Sign in")}</button>
      {error && <p role="alert">Sign-in failed. Check your credentials and connection, then try again.</p>}
    </form>
  </details>;
}
