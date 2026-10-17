import { useEffect, useState } from "react";
import { initializeAuth, isAuthConfigured, onAuthStateChange, signInWithGoogle } from "./auth";
import { ReviewLogin } from "./ReviewLogin";
import { t } from "./i18n";

export function LandingLogin() {
  const [status, setStatus] = useState<"loading" | "signed-out" | "signed-in">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    initializeAuth().then(session => {
      if (active) setStatus(session ? "signed-in" : "signed-out");
    }).catch(() => {
      if (active) { setStatus("signed-out"); setError("Не удалось восстановить вход."); }
    });
    const unsubscribe = onAuthStateChange(session => {
      if (active && session) window.location.assign("/app");
      else if (active) setStatus("signed-out");
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  async function login() {
    if (busy) return;
    setBusy(true); setError(undefined);
    try { await signInWithGoogle("/app"); }
    catch { setError("Не удалось открыть вход через Google."); setBusy(false); }
  }

  return <section id="sign-in" className="landing-login" aria-labelledby="landing-login-title">
    <h3 id="landing-login-title">{t("Добро пожаловать в SerboTalk")}</h3>
    <p>{t("Войдите или зарегистрируйтесь с Google, чтобы сохранять свой прогресс на всех устройствах.")}</p>
    {status === "loading" ? <p role="status">{t("Авторизация и загрузка...")}</p>
      : status === "signed-in" ? <a className="landing-cta" href="/app">{t("Продолжить тренировку")} <span aria-hidden="true">↗</span></a>
      : <><button className="google-sign-in" type="button" disabled={busy || !isAuthConfigured()} onClick={() => void login()}>{t(busy ? "Открываем Google…" : "Войти через Google")}</button>{isAuthConfigured() && <ReviewLogin />}</>}
    {error && <p className="error" role="alert">{t(error)}</p>}
    {!isAuthConfigured() && <p role="alert">{t("Вход временно недоступен. Попробуйте позже.")}</p>}
    <nav className="auth-legal" aria-label={t("Правовая информация")}><a href="/privacy">{t("Конфиденциальность")}</a><a href="/terms">{t("Условия")}</a><a href="/delete-account">{t("Удаление аккаунта")}</a></nav>
  </section>;
}
