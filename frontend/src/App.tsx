import { t, useLanguage, setLanguage, getLanguage, getLocale, localizedPhrase, topicText } from "./i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";

import { BackendError, fetchNextExercise, fetchReviewSummary, fetchTopics, revealWordHint, startTrainingSession, submitAttempt, transcribeAudio } from "./api/training";
import type { Attempt, AttemptTimings, Exercise, TopicListItem, TrainingSession, WordHint } from "./types/training";
import { supportsVoiceRecording, VoiceRecorder } from "./voiceRecorder";
import { DeferredPanel } from "./DeferredPanel";
import { fetchCurrentUser } from "./api/users";
import { initializeAuth, isAuthConfigured, onAuthStateChange, signInWithGoogle, signOut } from "./auth";
import type { CurrentUser } from "./types/auth";
import { LegalPage } from "./LegalPage";
import { ReviewLogin } from "./ReviewLogin";
import { EmailLogin } from "./EmailLogin";
import { assistedText } from "./transcriptionAssistance";
import { transcriptionErrorMessage } from "./transcriptionError";
import { TranscriptionAssistanceView, type AssistanceDraft } from "./TranscriptionAssistanceView";
import { useAssistancePreference } from "./useAssistancePreference";
import { useMobileLayout } from "./useMobileLayout";
import { SettingsView } from "./SettingsView";
import { CustomContentManager } from "./CustomContentManager";
import { CustomContentForm } from "./CustomContentForm";
import { PremiumBadge } from "./PremiumBadge";
import { WordHintToken } from "./WordHintToken";
import { isSourceWord, splitSourcePhrase } from "./sourceWords";
import { hasUnexpectedLetterScript, displaySerbian, displaySerbianInRussianText, readSerbianAlphabet, saveSerbianAlphabet, toSerbianLatin, type SerbianAlphabet } from "./serbianScript";
import { AnswerResult } from "./AnswerResult";
import { RewardOverlay } from "./RewardOverlay";
import { useRewards } from "./useRewards";
import { finishUiTimingWhenVisible, startUiTiming } from "./performance";
import appLogo from "./assets/app-logo.png?inline";
import messages from "./locales/en.json";
import "./styles.css";

type BackendState = "checking" | "online" | "offline";
type VoiceState = "idle" | "connecting" | "recording" | "transcribing" | "error";
type AppView = "practice" | "statistics" | "settings" | "admin";
type StartupState = "loading" | "ready" | "fallback";
const transcriptionBreakMessage = "Проблемы с работой внешней моделью. Сделайте перерыв и вернитесь к обучению позже";

function displayFeedback(text: string, alphabet: SerbianAlphabet): string {
  return getLanguage() === "en" || !/[А-Яа-яЁё]/.test(text) ? t(text) : displaySerbianInRussianText(text, alphabet);
}

const loadStatistics = (retryUrl?: string) => (retryUrl
  ? import(/* @vite-ignore */ retryUrl) as Promise<typeof import("./StatisticsView")>
  : import("./StatisticsView")).then(({ StatisticsView }) => ({ default: StatisticsView }));
const loadAdminUsers = (retryUrl?: string) => (retryUrl
  ? import(/* @vite-ignore */ retryUrl) as Promise<typeof import("./AdminUsersView")>
  : import("./AdminUsersView")).then(({ AdminUsersView }) => ({ default: AdminUsersView }));

function AnswerActions({ answer, loading, native, voiceState, voiceSupported, startVoice, finishVoice, stopVoice }: {
  answer: string; loading: boolean; native: boolean; voiceState: VoiceState; voiceSupported: boolean;
  startVoice: () => void; finishVoice: () => void; stopVoice: () => void;
}) {
  const busy = voiceState === "connecting" || voiceState === "recording" || voiceState === "transcribing";
  return <div className="answer-actions">
    {answer.trim() && <button className="answer-check-button" type="submit" form="practice-answer-form" aria-label={t(loading ? "Проверяем…" : native ? "Проверить" : "Проверить ответ")} disabled={loading || busy || hasUnexpectedLetterScript(answer)}><Icon name="tick" size={40} /></button>}
    <button className={`mic-button${busy ? " is-active" : ""}${answer.trim() && !busy ? " mic-button--retry" : ""}`} type="button"
      aria-label={t(busy ? voiceState === "recording" ? "Завершить запись" : "Остановить запись" : answer.trim() ? "Записать заново" : "Ответить голосом")}
      disabled={loading || !voiceSupported || voiceState === "transcribing"}
      onClick={busy ? voiceState === "recording" ? finishVoice : stopVoice : startVoice}>
      {answer.trim() && !busy && <span className="mic-retry-ring"><Icon name="retry" size={52} /></span>}
      <Icon name="mic" size={30} />
    </button>
  </div>;
}

function PhraseLoading() {
  return <div className="phrase-loading auth-loading" role="status" aria-label={t("Подготовка фразы")}>
    <span className="auth-loading__ring"><img src={appLogo} alt="SerboTalk" /></span>
    <p>{t("Подготовка фразы")}</p>
  </div>;
}

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (digit) => {
    const value = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    return (digit === "x" ? value : (value & 3) | 8).toString(16);
  });
}

function resetTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "после обновления лимита";
  return `после ${new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date)}`;
}

const topicIcons: Record<string, string> = {
  "job-interview": "briefcase", bank: "bank", vacation: "sun", cafe: "cup",
  work: "laptop", doctor: "heart", rent: "home", transport: "bus",
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-4.5A7 7 0 0 1 3 13V8a5 5 0 0 1 5-5h9a4 4 0 0 1 4 4Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V2"/></>,
    progress: <><path d="M4 18h16M6 15l4-4 3 2 5-7"/><path d="M16 6h2v2"/></>,
    repeat: <><path d="M20.49 9.5a8.85 8.85 0 0 0-17.1-.1M3.51 14.5a8.85 8.85 0 0 0 17.1.1" strokeWidth="2.4"/><path d="m16 7 4.5 2.5 1-5M8 17l-4.5-2.5-1 5" strokeWidth="2.4"/></>,
    retry: <><path d="M3 10a9 9 0 0 1 16-4l2 2M21 14a9 9 0 0 1-16 4l-2-2" strokeWidth="2.8"/><path fill="currentColor" stroke="none" d="M21.4 3.7 22 9.5 16.3 8.2ZM2.6 20.3 2 14.5l5.7 1.3Z"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/></>,
    bank: <><path d="m3 9 9-5 9 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    cup: <><path d="M5 8h12v6a6 6 0 0 1-12 0Z"/><path d="M17 10h2a3 3 0 0 1 0 6h-3M7 3v2M11 3v2M15 3v2"/></>,
    laptop: <><rect x="4" y="4" width="16" height="12" rx="1"/><path d="M2 19h20M9 19h6"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
    bus: <><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2M16 19v2M8 15h.01M16 15h.01M8 7h8"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    pencil: <><path d="m4 16-1 5 5-1L19 9l-4-4Z"/><path d="m13 7 4 4"/></>,
    bulb: <><path d="M9 18h6M10 22h4"/><path d="M8.5 15.5A7 7 0 1 1 15.5 15.5c-.9.7-1.3 1.3-1.5 2.5h-4c-.2-1.2-.6-1.8-1.5-2.5Z"/></>,
    tick: <path d="m5 12 4 4L19 6" />,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  };
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t(paths[name] ?? paths.message)}</svg>;
}

export default function App() {
  const language = useLanguage();
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  if (window.location.pathname === "/privacy") return <LegalPage kind="privacy" />;
  if (window.location.pathname === "/terms") return <LegalPage kind="terms" />;
  if (window.location.pathname === "/delete-account") return <LegalPage kind="delete-account" />;
  return <AuthenticatedApp />;
}

function LoginLanguageButton() {
  const language = useLanguage();
  return <div className="login-languages" role="group" aria-label={t("Язык интерфейса")}>
    {(["ru", "en"] as const).map(locale => <button key={locale} className="login-language" type="button" aria-label={t(locale === "ru" ? "Выбрать русский язык" : "Выбрать английский язык")} aria-pressed={language === locale} onClick={() => setLanguage(locale)}>
      <svg aria-hidden="true" viewBox="0 0 60 60" width="36" height="36">
        {locale === "ru" ? <><path fill="#fff" d="M0 0h60v20H0z"/><path fill="#0039a6" d="M0 20h60v20H0z"/><path fill="#d52b1e" d="M0 40h60v20H0z"/></> : <>
          <path fill="#012169" d="M0 0h60v60H0z"/><path stroke="#fff" strokeWidth="12" d="m0 0 60 60M60 0 0 60"/><path stroke="#c8102e" strokeWidth="4" d="m0 0 60 60M60 0 0 60"/><path stroke="#fff" strokeWidth="20" d="M30 0v60M0 30h60"/><path stroke="#c8102e" strokeWidth="12" d="M30 0v60M0 30h60"/>
        </>}
      </svg>
    </button>)}
  </div>;
}

// Both translations participate in layout so switching languages never moves the form.
function LoginCopy({ as: Tag, text, href }: { as: "h1" | "p" | "a"; text: keyof typeof messages; href?: string }) {
  const language = useLanguage();
  return <Tag className="login-copy" href={href}>{(["ru", "en"] as const).map(locale => <span key={locale} lang={locale} aria-hidden={language !== locale} className={language !== locale ? "login-copy__sizing" : undefined}>{locale === "ru" ? text : messages[text]}</span>)}</Tag>;
}

function AuthenticatedApp() {
  const [authReady, setAuthReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [account, setAccount] = useState<CurrentUser>();
  const [authError, setAuthError] = useState<string>();

  useEffect(() => {
    let active = true;
    let lastToken: string | null | undefined;
    const syncAccount = async (session: Session | null) => {
      if (!active) return;
      const token = session?.access_token ?? null;
      if (lastToken === token) return;
      lastToken = token;
      setHasSession(Boolean(session));
      if (!session) { setAccount(undefined); setAuthReady(true); return; }
      try {
        const user = await fetchCurrentUser();
        if (active && lastToken === token) { setAccount(user); setAuthError(undefined); }
      } catch {
        if (active && lastToken === token) setAuthError("Не удалось загрузить профиль. Проверьте подключение к интернету и повторите вход.");
      } finally {
        if (active && lastToken === token) setAuthReady(true);
      }
    };
    initializeAuth().then(syncAccount).catch(() => {
      if (active) { setAuthError("Не удалось восстановить вход."); setAuthReady(true); }
    });
    const unsubscribe = onAuthStateChange((session) => {
      window.setTimeout(() => { void syncAccount(session); }, 0);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  async function login() {
    setAuthError(undefined);
    try { await signInWithGoogle(); }
    catch { setAuthError("Не удалось открыть вход через Google."); }
  }

  if (!authReady) return <main className="auth-page auth-page--loading"><div className="auth-loading" role="status" aria-label={t("Авторизация и загрузка")}>
    <span className="auth-loading__ring"><img src={appLogo} alt="SerboTalk" /></span>
    <p>{t("Авторизация и загрузка...")}</p>
  </div></main>;
  if (!isAuthConfigured()) return <main className="auth-page"><div className="auth-card panel"><LoginLanguageButton /><h1>{t("Нужна настройка входа")}</h1><p>{t("Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в окружение frontend.")}</p></div></main>;
  if (!hasSession || !account) return <main className="auth-page"><div className="auth-card panel"><LoginLanguageButton /><LoginCopy as="h1" text="Добро пожаловать в SerboTalk" /><LoginCopy as="p" text="Войдите или зарегистрируйтесь, чтобы сохранять свой прогресс на всех устройствах." /><button className="google-sign-in" type="button" onClick={() => void login()}>{t("Войти через Google")}</button><EmailLogin /><ReviewLogin />{authError && <p className="error" role="alert">{t(authError)}</p>}<nav className="auth-legal" aria-label={t("Правовая информация")}><LoginCopy as="a" href="/privacy" text="Конфиденциальность" /><LoginCopy as="a" href="/terms" text="Условия" /><LoginCopy as="a" href="/delete-account" text="Удаление аккаунта" /></nav></div></main>;
  return <TrainerApp key={account.id} account={account} onAccountChange={setAccount} onSignOut={() => void signOut()} />;
}

function TrainerApp({ account, onAccountChange, onSignOut }: { account: CurrentUser; onAccountChange: (account: CurrentUser) => void; onSignOut: () => void }) {
  const [backendState, setBackendState] = useState<BackendState>("checking");
  const [startupState, setStartupState] = useState<StartupState>("loading");
  const [view, setView] = useState<AppView>("practice");
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>();
  const [contentForm, setContentForm] = useState<"topic" | "phrase" | "manage">();
  const [customTopic, setCustomTopic] = useState("");
  const [reviewPhraseCount, setReviewPhraseCount] = useState(0);
  const [session, setSession] = useState<TrainingSession>();
  const [exercise, setExercise] = useState<Exercise>();
  const [answer, setAnswer] = useState("");
  const [hasTranscript, setHasTranscript] = useState(false);
  const { enabled: assistanceEnabled, saving: assistanceSaving, error: assistanceError, change: changeAssistance, refresh: refreshAssistance } = useAssistancePreference(account.assistance_enabled ?? false);
  const [assistanceDraft, setAssistanceDraft] = useState<AssistanceDraft>();
  const [alphabet, setAlphabet] = useState<SerbianAlphabet>(() => readSerbianAlphabet(account.id));
  const alphabetRef = useRef(alphabet);
  const [attempt, setAttempt] = useState<Attempt>();
  const { reward, prepareReward, celebrate } = useRewards();
  const [checking, setChecking] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [topicExhausted, setTopicExhausted] = useState(false);
  const [preparingPhrase, setPreparingPhrase] = useState(false);
  const [error, setError] = useState<string>();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const unexpectedScriptStreakRef = useRef(0);
  const [transcriptionBreakRecommended, setTranscriptionBreakRecommended] = useState(false);
  const [wordHints, setWordHints] = useState<Record<string, WordHint>>({});
  const [activeHint, setActiveHint] = useState<string>();
  const wordHintsRef = useRef<Record<string, WordHint>>({});
  const savedHintsRef = useRef(new Set<string>());
  const hintRequestsRef = useRef(new Map<string, AbortController>());
  const voiceRef = useRef<VoiceRecorder | undefined>(undefined);
  const voiceTimingRef = useRef<AttemptTimings | undefined>(undefined);
  const nextExerciseRef = useRef<{ sessionId: string; requestId: string; promise: Promise<Exercise>; controller: AbortController } | undefined>(undefined);
  const pendingAttemptRef = useRef<{ payload: string; id: string } | undefined>(undefined);
  const checkingRef = useRef(false);
  const advancingRef = useRef(false);
  const nextRequestIdRef = useRef<string | undefined>(undefined);
  const flowEpochRef = useRef(0);
  const voiceEpochRef = useRef(0);
  const answerEditEpochRef = useRef(0);
  const voiceStartEditEpochRef = useRef(0);
  const hintEpochRef = useRef(0);
  const flowControllerRef = useRef<AbortController | undefined>(undefined);
  const voiceControllerRef = useRef<AbortController | undefined>(undefined);
  const catalogEpochRef = useRef(0);
  const catalogControllerRef = useRef<AbortController | undefined>(undefined);
  const reviewSummaryEpochRef = useRef(0);
  const accountRefreshEpochRef = useRef(0);
  const androidPagerRef = useRef<HTMLDivElement | null>(null);
  const presentedExerciseRef = useRef<string | undefined>(undefined);
  const initialExerciseTimingPendingRef = useRef(false);
  const [androidPanel, setAndroidPanel] = useState(() => Capacitor.isNativePlatform() ? 0 : 1);
  const [statisticsPage, setStatisticsPage] = useState<"activity" | "phrases">("activity");
  const androidBackHandlerRef = useRef<() => void>(() => undefined);
  const voiceSupported = supportsVoiceRecording();
  const isNative = Capacitor.isNativePlatform();
  const { compact, shell: mobileShellRef } = useMobileLayout(startupState !== "loading" && !isNative);
  const mobileLayout = isNative || compact;
  const visiblePanel = !isNative && view !== "practice" ? view === "statistics" ? 2 : 3 : androidPanel;

  useEffect(() => { startUiTiming("topics"); }, []);
  useEffect(() => {
    if (startupState !== "loading" && topics.length) finishUiTimingWhenVisible("topics", mobileLayout ? ".android-topic-list .android-topic" : ".topics .topic");
  }, [topics, mobileLayout, startupState]);
  useEffect(() => {
    if (exercise && !attempt) {
      const selector = mobileLayout ? ".android-page .interactive-phrase" : ".practice-stage .interactive-phrase";
      if (presentedExerciseRef.current !== exercise.id && (mobileLayout ? visiblePanel === 1 : view === "practice")) {
        document.querySelector<HTMLElement>(selector)?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
        presentedExerciseRef.current = exercise.id;
      }
      finishUiTimingWhenVisible("first_phrase", selector);
      finishUiTimingWhenVisible("next_phrase", selector);
    }
  }, [exercise, attempt, mobileLayout, visiblePanel, view]);
  useEffect(() => {
    if (hasTranscript) finishUiTimingWhenVisible("transcription", mobileLayout ? "#android-serbian-answer" : "#serbian-answer");
  }, [hasTranscript, mobileLayout]);
  useEffect(() => {
    if (attempt) finishUiTimingWhenVisible("check", ".feedback");
  }, [attempt]);

  function invalidateFlow() {
    flowEpochRef.current += 1;
    initialExerciseTimingPendingRef.current = false;
    hintEpochRef.current += 1;
    flowControllerRef.current?.abort();
    flowControllerRef.current = undefined;
    savedHintsRef.current.clear();
    wordHintsRef.current = {};
    nextExerciseRef.current?.controller.abort();
    nextExerciseRef.current = undefined;
    nextRequestIdRef.current = undefined;
    pendingAttemptRef.current = undefined;
    checkingRef.current = false;
    advancingRef.current = false;
    setChecking(false); setAdvancing(false); setPreparingPhrase(false);
  }

  function changeAlphabet(next: SerbianAlphabet) {
    alphabetRef.current = next;
    setAnswer((current) => displaySerbian(current, next));
    setAlphabet(next);
    saveSerbianAlphabet(account.id, next);
  }

  const refreshReviewSummary = useCallback((signal?: AbortSignal) => {
    const epoch = ++reviewSummaryEpochRef.current;
    return fetchReviewSummary(signal).then((summary) => {
      if (reviewSummaryEpochRef.current === epoch) setReviewPhraseCount(summary.phrase_count);
    });
  }, []);

  const loadCatalog = useCallback(() => {
    catalogControllerRef.current?.abort();
    flowControllerRef.current?.abort();
    flowEpochRef.current += 1;
    flowControllerRef.current = undefined;
    checkingRef.current = false;
    advancingRef.current = false;
    const controller = new AbortController();
    catalogControllerRef.current = controller;
    const epoch = ++catalogEpochRef.current;
    const summaryEpoch = ++reviewSummaryEpochRef.current;
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted || catalogEpochRef.current !== epoch) return;
      setChecking(false); setAdvancing(false); setPreparingPhrase(false);
      setStartupState("loading");
      setBackendState("checking");
      setError(undefined);
      const [topicsResult, summaryResult] = await Promise.allSettled([
        fetchTopics(controller.signal), fetchReviewSummary(controller.signal),
      ]);
      if (controller.signal.aborted || catalogEpochRef.current !== epoch) return;
      if (topicsResult.status === "rejected") {
        setBackendState("offline");
        setError("Не удалось загрузить темы. Проверьте соединение и попробуйте снова.");
        setStartupState("fallback");
        return;
      }
      const availableTopics = topicsResult.value;
      const firstTopic = availableTopics.find((topic) => topic.phrase_count > 0);
      setTopics(availableTopics);
      setSelectedTopic(firstTopic?.id);
      setBackendState("online");
      if (summaryResult.status === "rejected") {
        setError("Не удалось загрузить фразы для повторения. Выберите тему или повторите загрузку.");
        setStartupState("fallback");
        return;
      }
      const reviewCount = summaryResult.value.phrase_count;
      if (reviewSummaryEpochRef.current === summaryEpoch) setReviewPhraseCount(reviewCount);
      setSelectedTopic(reviewCount > 0 ? undefined : firstTopic?.id);
      if (reviewCount === 0 && !firstTopic) {
        setError("Пока нет фраз для тренировки. Добавьте фразу или создайте тему.");
        setStartupState("fallback");
        return;
      }
      if (!Capacitor.isNativePlatform()) startUiTiming("first_phrase");
      flowControllerRef.current = controller;
      try {
        let started;
        if (reviewCount > 0) {
          try {
            started = await startTrainingSession({ review_mode: true }, controller.signal);
          } catch (requestError) {
            if (!(requestError instanceof BackendError && requestError.code === "review_queue_empty")) throw requestError;
            if (reviewSummaryEpochRef.current === summaryEpoch) setReviewPhraseCount(0);
            if (!firstTopic) {
              setError("Пока нет фраз для тренировки. Добавьте фразу или создайте тему.");
              setStartupState("fallback");
              return;
            }
            setSelectedTopic(firstTopic.id);
            started = await startTrainingSession({ topic_id: firstTopic.id }, controller.signal);
          }
        } else {
          started = await startTrainingSession({ topic_id: firstTopic!.id }, controller.signal);
        }
        if (controller.signal.aborted || catalogEpochRef.current !== epoch) return;
        setSession(started.session); setExercise(started.exercise);
        setCompletedCount(started.session.completed_count ?? 0);
        if (Capacitor.isNativePlatform()) initialExerciseTimingPendingRef.current = true;
        setStartupState("ready");
      } catch {
        if (controller.signal.aborted || catalogEpochRef.current !== epoch) return;
        setError("Не удалось подготовить первую фразу. Выберите тему или повторите загрузку.");
        setStartupState("fallback");
      } finally {
        if (catalogEpochRef.current === epoch) flowControllerRef.current = undefined;
      }
    })();
  }, []);

  const refreshReadyCatalog = useCallback(() => {
    catalogControllerRef.current?.abort();
    const controller = new AbortController();
    catalogControllerRef.current = controller;
    const epoch = ++catalogEpochRef.current;
    setBackendState("checking");
    void fetchTopics(controller.signal)
      .then((availableTopics) => {
        if (controller.signal.aborted || catalogEpochRef.current !== epoch) return;
        setTopics(availableTopics);
        setSelectedTopic((current) => current ?? availableTopics.find((topic) => topic.phrase_count > 0)?.id);
        setBackendState("online");
      })
      .catch(() => {
        if (!controller.signal.aborted && catalogEpochRef.current === epoch) setBackendState("offline");
      });
    void refreshReviewSummary(controller.signal).catch(() => undefined);
  }, [refreshReviewSummary]);

  function retryCatalog() {
    if (startupState === "ready") refreshReadyCatalog();
    else loadCatalog();
  }

  useEffect(() => {
    loadCatalog();
    return () => { catalogEpochRef.current += 1; catalogControllerRef.current?.abort(); };
  }, [loadCatalog]);

  useEffect(() => () => {
    flowEpochRef.current += 1;
    catalogEpochRef.current += 1;
    reviewSummaryEpochRef.current += 1;
    accountRefreshEpochRef.current += 1;
    voiceEpochRef.current += 1;
    hintEpochRef.current += 1;
    flowControllerRef.current?.abort();
    voiceControllerRef.current?.abort();
    for (const request of hintRequestsRef.current.values()) request.abort();
    hintRequestsRef.current.clear();
    nextExerciseRef.current?.controller.abort();
    catalogControllerRef.current?.abort();
    voiceRef.current?.stop();
  }, []);
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (startupState === "ready" && document.visibilityState === "visible") refreshReadyCatalog();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [refreshReadyCatalog, startupState]);
  const selectedTopicData = topics.find((topic) => topic.id === selectedTopic);
  const currentTopic = session?.topic ?? selectedTopicData;
  const isReviewMode = session?.topic.id === "review-phrases";
  const phraseTopicTitle = isReviewMode
    ? `${t("Фразы для повторения")}${exercise?.topic_title_ru ? ` / ${topicText(exercise.topic_id, exercise.topic_title_ru)}` : ""}`
    : currentTopic ? topicText(currentTopic.id, currentTopic.title_ru) : "";
  const voiceBusy = voiceState === "connecting" || voiceState === "recording" || voiceState === "transcribing";

  const stopVoice = useCallback(() => {
    voiceEpochRef.current += 1;
    voiceControllerRef.current?.abort();
    voiceControllerRef.current = undefined;
    if (voiceRef.current) { voiceRef.current.stop(); voiceRef.current = undefined; }
    voiceTimingRef.current = undefined;
    setVoiceState("idle");
  }, []);

  const interruptVoice = useCallback(() => {
    if (!voiceRef.current && !voiceControllerRef.current) return;
    stopVoice();
    setVoiceState("error");
    setError("Запись прервана. Текущая фраза и текст ответа сохранены. Запишите ответ снова или введите его вручную.");
  }, [stopVoice]);

  function showAndroidPanel(panel: number) {
    const pager = androidPagerRef.current;
    if (panel === 1 && initialExerciseTimingPendingRef.current) {
      initialExerciseTimingPendingRef.current = false;
      startUiTiming("first_phrase");
    }
    if (panel !== 1) interruptVoice();
    setAndroidPanel(panel);
    if (!isNative) {
      setView(panel === 2 ? "statistics" : panel === 3 ? "settings" : "practice");
      return;
    }
    if (!pager) return;
    const left = panel * pager.clientWidth;
    if (typeof pager.scrollTo === "function") pager.scrollTo({ left, behavior: "auto" });
    else pager.scrollLeft = left;
  }

  useEffect(() => {
    androidBackHandlerRef.current = () => {
      if (androidPanel === 2 && statisticsPage === "phrases") {
        setStatisticsPage("activity");
      } else if (androidPanel !== 0) {
        showAndroidPanel(session && androidPanel > 1 ? 1 : 0);
      } else {
        interruptVoice();
        void CapacitorApp.exitApp().catch(() => undefined);
      }
    };
  });

  useEffect(() => {
    if (!isNative) return;
    let active = true;
    let handle: { remove: () => Promise<void> } | undefined;
    void CapacitorApp.addListener("backButton", () => {
      if (active) androidBackHandlerRef.current();
    }).then((listener) => {
      if (active) handle = listener;
      else void listener.remove().catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (handle) void handle.remove().catch(() => undefined);
    };
  }, [isNative]);

  useEffect(() => {
    let active = true;
    const onVisibilityChange = () => {
      if (active && document.visibilityState === "hidden") interruptVoice();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    let nativeListener: { remove: () => Promise<void> } | undefined;
    if (isNative) {
      void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (active && !isActive) interruptVoice();
        if (active && isActive) void refreshAssistance();
      }).then((listener) => {
        if (active) nativeListener = listener;
        else void listener.remove().catch(() => undefined);
      }).catch(() => undefined);
    }
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (nativeListener) void nativeListener.remove().catch(() => undefined);
    };
  }, [interruptVoice, isNative, refreshAssistance]);

  function showView(next: AppView) {
    if (next !== "practice") interruptVoice();
    setView(next);
    if (!isNative) setAndroidPanel(next === "statistics" ? 2 : next === "settings" || next === "admin" ? 3 : 1);
  }

  async function finishVoice() {
    const recorder = voiceRef.current;
    if (!recorder || !exercise) return;
    const epoch = voiceEpochRef.current;
    const exerciseId = exercise.id;
    const controller = new AbortController();
    voiceControllerRef.current = controller;
    setVoiceState("transcribing"); setError(undefined);
    try {
      const recording = await recorder.finish();
      if (voiceEpochRef.current !== epoch) return;
      voiceRef.current = undefined;
      startUiTiming("transcription");
      const transcript = await transcribeAudio(exerciseId, recording.audio, controller.signal, assistanceEnabled, alphabetRef.current);
      if (voiceEpochRef.current !== epoch) return;
      const unexpectedScript = hasUnexpectedLetterScript(transcript.text);
      unexpectedScriptStreakRef.current = unexpectedScript ? unexpectedScriptStreakRef.current + 1 : 0;
      setTranscriptionBreakRecommended(unexpectedScriptStreakRef.current >= 3);
      if (answerEditEpochRef.current === voiceStartEditEpochRef.current) {
        voiceTimingRef.current = recording.timing;
        setAnswer(transcript.review_required ? transcript.text : displaySerbian(transcript.text, alphabetRef.current));
        if (transcript.review_required) voiceTimingRef.current = undefined;
        setHasTranscript(true);
        setAssistanceDraft(transcript.transcription_id || transcript.assistance_status ? { response: transcript, selected: (transcript.changes ?? []).flatMap((c, i) => c.action === "applied" ? [i] : []), edited: false } : undefined);
      }
      setVoiceState("idle");
    } catch (error) {
      if (voiceEpochRef.current !== epoch) return;
      unexpectedScriptStreakRef.current = error instanceof BackendError && error.code === "transcription_unexpected_script" ? unexpectedScriptStreakRef.current + 1 : 0;
      setTranscriptionBreakRecommended(unexpectedScriptStreakRef.current >= 3);
      recorder.stop(); voiceRef.current = undefined; voiceTimingRef.current = undefined;
      setVoiceState("error"); setError(transcriptionErrorMessage(error));
    } finally {
      if (voiceEpochRef.current === epoch) voiceControllerRef.current = undefined;
    }
  }

  async function startVoice() {
    if (!exercise || !voiceSupported) return;
    stopVoice(); voiceStartEditEpochRef.current = answerEditEpochRef.current;
    setError(undefined); setVoiceState("connecting");
    const epoch = voiceEpochRef.current;
    const recorder = new VoiceRecorder(); voiceRef.current = recorder;
    try { await recorder.start(); if (voiceEpochRef.current === epoch && voiceRef.current === recorder) setVoiceState("recording"); }
    catch { recorder.stop(); if (voiceEpochRef.current !== epoch) return; if (voiceRef.current === recorder) voiceRef.current = undefined; setVoiceState("error"); setError("Не удалось получить доступ к микрофону. Проверьте разрешение браузера."); }
  }

  function enterAnswerManually() {
    voiceTimingRef.current = undefined;
    setHasTranscript(true);
    setVoiceState("idle");
    setError(undefined);
  }

  async function startTraining(topicId: string) {
    startUiTiming("first_phrase");
    invalidateFlow();
    stopVoice(); setAnswer(""); setAssistanceDraft(undefined); setHasTranscript(false); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
    setSession(undefined); setExercise(undefined); setCompletedCount(0); setSessionComplete(false); setTopicExhausted(false);
    setPreparingPhrase(true); setError(undefined);
    const epoch = flowEpochRef.current;
    const controller = new AbortController();
    flowControllerRef.current = controller;
    try {
      const started = await startTrainingSession({ topic_id: topicId }, controller.signal);
      if (flowEpochRef.current !== epoch) return;
      setSession(started.session); setExercise(started.exercise);
      setCompletedCount(started.session.completed_count ?? 0);
      setStartupState("ready");
    } catch (requestError) {
      if (flowEpochRef.current !== epoch) return;
      setError(requestError instanceof BackendError && (requestError.code === "topic_empty" || requestError.status === 409)
        ? "В этой теме сейчас нет фраз для тренировки. Добавьте новую или дождитесь повторения."
        : "Не удалось начать тренировку. Проверьте, что backend запущен.");
    }
    finally { if (flowEpochRef.current === epoch) { flowControllerRef.current = undefined; setPreparingPhrase(false); } }
  }

  async function startReviewTraining() {
    if (isReviewMode && session && exercise && !sessionComplete) return;
    startUiTiming("first_phrase");
    invalidateFlow(); stopVoice();
    setSession(undefined); setExercise(undefined); setCompletedCount(0); setSessionComplete(false); setTopicExhausted(false);
    setSelectedTopic(undefined); setCustomTopic(""); setError(undefined);
    if (!reviewPhraseCount) {
      setError("Пока нет фраз для повторения. Добавьте фразу ниже или выполните обычную тренировку.");
      return;
    }
    setPreparingPhrase(true);
    const epoch = flowEpochRef.current;
    const controller = new AbortController();
    flowControllerRef.current = controller;
    try {
      const started = await startTrainingSession({ review_mode: true }, controller.signal);
      if (flowEpochRef.current !== epoch) return;
      setSession(started.session); setExercise(started.exercise);
      setAnswer(""); setAssistanceDraft(undefined); setHasTranscript(false); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
      setStartupState("ready");
    } catch (requestError) {
      if (flowEpochRef.current !== epoch) return;
      if (requestError instanceof BackendError && requestError.code === "review_queue_empty") {
        reviewSummaryEpochRef.current += 1;
        setReviewPhraseCount(0);
      }
      setError(requestError instanceof BackendError && requestError.code === "review_queue_empty" ? "Все фразы из карусели освоены. Отличная работа!" : "Не удалось запустить повторение фраз.");
    } finally { if (flowEpochRef.current === epoch) { flowControllerRef.current = undefined; setPreparingPhrase(false); } }
  }

  async function nextExercise() {
    if (!session || advancingRef.current) return;
    if (!isReviewMode && completedCount >= session.requested_length) { setSessionComplete(true); return; }
    startUiTiming("next_phrase");
    advancingRef.current = true;
    hintEpochRef.current += 1;
    stopVoice(); setAdvancing(true); setError(undefined);
    const epoch = flowEpochRef.current;
    const request = nextExerciseRef.current?.sessionId === session.id ? nextExerciseRef.current : undefined;
    const id = request?.requestId ?? nextRequestIdRef.current ?? requestId();
    nextRequestIdRef.current = id;
    const controller = request?.controller ?? new AbortController();
    flowControllerRef.current = controller;
    try {
      const next = await (request?.promise ?? fetchNextExercise(session.id, id, controller.signal));
      if (flowEpochRef.current !== epoch) return;
      nextExerciseRef.current = undefined; nextRequestIdRef.current = undefined;
      setExercise(next);
      wordHintsRef.current = {}; savedHintsRef.current.clear();
      setAnswer(""); setAssistanceDraft(undefined); setHasTranscript(false); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
    }
    catch (requestError) {
      if (flowEpochRef.current !== epoch) return;
      nextExerciseRef.current = undefined;
      if (requestError instanceof BackendError && requestError.code === "session_completed") {
        setSessionComplete(true);
      } else if (!isReviewMode && requestError instanceof BackendError && requestError.code === "topic_empty") {
        setTopicExhausted(true); setSessionComplete(true);
      } else if (isReviewMode && requestError instanceof BackendError && (requestError.code === "review_queue_empty" || requestError.status === 409)) {
        reviewSummaryEpochRef.current += 1;
        setSession(undefined); setExercise(undefined); setReviewPhraseCount(0);
        setAnswer(""); setAssistanceDraft(undefined); setHasTranscript(false); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
        setError("Все фразы из карусели освоены. Отличная работа!");
      } else setError("Не удалось получить следующую фразу.");
    }
    finally { if (flowEpochRef.current === epoch) { advancingRef.current = false; flowControllerRef.current = undefined; setAdvancing(false); } }
  }

  function toggleTranscriptionChange(index: number) {
    if (!assistanceDraft || assistanceDraft.edited || checking || voiceBusy) return;
    const selected = assistanceDraft.selected.includes(index) ? assistanceDraft.selected.filter(i => i !== index) : [...assistanceDraft.selected, index];
    answerEditEpochRef.current += 1;
    setAnswer(displaySerbian(assistedText(assistanceDraft.response, selected), alphabet));
    setAssistanceDraft({ ...assistanceDraft, selected });
  }

  async function checkAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exercise || !session || !hasTranscript || !answer.trim() || checkingRef.current || voiceBusy || hasUnexpectedLetterScript(answer)) return;
    startUiTiming("check");
    prepareReward();
    const transcript = toSerbianLatin(answer.trim());
    const timing = voiceTimingRef.current;
    const hintedWords = Object.keys(wordHintsRef.current).sort();
    const assistance = assistanceDraft?.response.transcription_id ? { transcription_id: assistanceDraft.response.transcription_id, accepted_transcription_changes: assistanceDraft.selected.filter(i => assistanceDraft.response.changes![i].action === "suggested") } : undefined;
    const payload = JSON.stringify({ exerciseId: exercise.id, transcript, timing, hintedWords, assistance });
    const id = pendingAttemptRef.current?.payload === payload ? pendingAttemptRef.current.id : requestId();
    pendingAttemptRef.current = { payload, id };
    checkingRef.current = true;
    setChecking(true); setError(undefined); setActiveHint(undefined);
    const epoch = flowEpochRef.current;
    const controller = new AbortController();
    flowControllerRef.current = controller;
    try {
      const completed = await submitAttempt(exercise.id, transcript, timing, hintedWords, id, controller.signal, assistance);
      if (flowEpochRef.current !== epoch) return;
      pendingAttemptRef.current = undefined;
      setAttempt(completed);
      celebrate(completed);
      hintEpochRef.current += 1;
      const count = completedCount + 1;
      setCompletedCount(count);
      const accountEpoch = ++accountRefreshEpochRef.current;
      if (completed.daily_usage) onAccountChange({ ...account, daily_usage: completed.daily_usage });
      if (isReviewMode || count < session.requested_length) {
        const nextController = new AbortController();
        const nextId = requestId();
        nextRequestIdRef.current = nextId;
        const prepared = fetchNextExercise(session.id, nextId, nextController.signal);
        nextExerciseRef.current = { sessionId: session.id, requestId: nextId, promise: prepared, controller: nextController };
        void prepared.catch(() => {
          if (nextExerciseRef.current?.promise === prepared) nextExerciseRef.current = undefined;
        });
      }
      const refreshSideData = () => {
        void refreshReviewSummary().catch(() => undefined);
        void fetchTopics().then((availableTopics) => { if (flowEpochRef.current === epoch) setTopics(availableTopics); }).catch(() => undefined);
        if (!completed.daily_usage) void fetchCurrentUser().then((updated) => { if (flowEpochRef.current === epoch && accountRefreshEpochRef.current === accountEpoch) onAccountChange(updated); }).catch(() => undefined);
      };
      refreshSideData();
    }
    catch (requestError) {
      if (flowEpochRef.current !== epoch) return;
      if (requestError instanceof BackendError && requestError.status === 429) setError(`Дневной лимит фраз исчерпан. Новые фразы будут доступны ${resetTimeLabel(account.daily_usage.resets_at)}.`);
      else if (requestError instanceof BackendError && requestError.code === "analysis_unavailable") setError("Сервис проверки временно недоступен. Ответ сохранён на экране — попробуйте проверить ещё раз.");
      else if (requestError instanceof BackendError && requestError.code === "attempt_in_progress") setError("Проверка ещё выполняется. Ответ сохранён — попробуйте ещё раз через несколько секунд.");
      else if (requestError instanceof BackendError && requestError.code === "attempt_request_conflict") { pendingAttemptRef.current = undefined; setError("Ответ изменился во время проверки. Повторите отправку."); }
      else setError("Не удалось проверить ответ. Попробуйте ещё раз.");
    }
    finally { if (flowEpochRef.current === epoch) { checkingRef.current = false; flowControllerRef.current = undefined; setChecking(false); } }
  }

  function resetTraining() {
    invalidateFlow();
    stopVoice(); setView("practice"); setSession(undefined); setExercise(undefined);
    setAnswer(""); setAssistanceDraft(undefined); setHasTranscript(false); setAttempt(undefined); setError(undefined); setWordHints({}); setActiveHint(undefined); setCompletedCount(0); setSessionComplete(false); setTopicExhausted(false);
  }

  function returnToTopics() {
    resetTraining();
    setSelectedTopic(undefined); setCustomTopic("");
    if (mobileLayout) showAndroidPanel(0);
  }

  const reviewFinished = error === "Все фразы из карусели освоены. Отличная работа!";

  function selectTopic(topicId: string) {
    if (session?.topic.id === topicId && exercise && !sessionComplete) return;
    if (session || preparingPhrase || sessionComplete) resetTraining();
    setSelectedTopic(topicId); setCustomTopic("");
    setSession(undefined); setExercise(undefined);
    if (topics.find((topic) => topic.id === topicId)?.phrase_count) void startTraining(topicId);
  }

  async function showWordHint(word: string, localHint?: Pick<WordHint, "word_ru" | "translation_sr">) {
    if (!exercise || checkingRef.current) return;
    const normalized = word.toLocaleLowerCase("ru-RU");
    setActiveHint(current => current === normalized ? undefined : normalized);
    const requestKey = `${hintEpochRef.current}:${normalized}`;
    if (hintRequestsRef.current.has(requestKey) || savedHintsRef.current.has(normalized)) return;
    const prepared = localHint ?? exercise.word_hints?.find((hint) => hint.word_ru.toLocaleLowerCase("ru-RU") === normalized);
    const epoch = flowEpochRef.current;
    const hintEpoch = hintEpochRef.current;
    if (prepared && !wordHintsRef.current[normalized]) {
      const opened = { ...prepared, is_learning: true };
      wordHintsRef.current = { ...wordHintsRef.current, [normalized]: opened };
      setWordHints(wordHintsRef.current);
    }
    if (wordHintsRef.current[normalized]) setError(undefined);
    const controller = new AbortController();
    hintRequestsRef.current.set(requestKey, controller);
    try {
      const hint = await revealWordHint(exercise.id, word, controller.signal);
      if (flowEpochRef.current === epoch && hintEpochRef.current === hintEpoch) {
        savedHintsRef.current.add(normalized);
        wordHintsRef.current = { ...wordHintsRef.current, [normalized]: hint };
        setWordHints(wordHintsRef.current);
      }
    } catch {
      if (flowEpochRef.current === epoch && hintEpochRef.current === hintEpoch) setError(
        wordHintsRef.current[normalized]
          ? `Перевод слова «${word}» показан, но сохранение не удалось. Нажмите на слово ещё раз, чтобы повторить.`
          : `Для слова «${word}» перевод пока недоступен. Нажмите на слово ещё раз, чтобы повторить.`,
      );
    } finally {
      if (hintRequestsRef.current.get(requestKey) === controller) hintRequestsRef.current.delete(requestKey);
    }
  }

  function refreshCustomContent() {
    void Promise.allSettled([fetchTopics().then(setTopics), refreshReviewSummary()]).then(results => {
      if (results.some(result => result.status === "rejected")) setError("Не удалось обновить каталог. Повторите загрузку тем.");
    });
  }

  function renderContentForm() {
    if (account.role !== "admin") return null;
    return <>
      <button className="custom-content-manage-button" type="button" onClick={() => { interruptVoice(); setContentForm("manage"); }}>{t("Свои темы и фразы")}</button>
      {contentForm === "manage" ? <CustomContentManager topics={topics} alphabet={alphabet} onClose={() => setContentForm(undefined)} onDeleted={topicId => {
        interruptVoice(); resetTraining();
        if (topicId) { setTopics(current => current.filter(topic => topic.id !== topicId)); if (selectedTopic === topicId) setSelectedTopic(undefined); }
        refreshCustomContent();
      }} /> : contentForm ? <CustomContentForm key={contentForm} mode={contentForm} topics={topics} selectedTopic={selectedTopic} alphabet={alphabet}
        onClose={() => setContentForm(undefined)} onManage={() => setContentForm("manage")} onCreateTopic={() => setContentForm("topic")}
        onTopicCreated={topic => setTopics(current => [...current.filter(item => item.id !== topic.id), topic])}
        onPhraseSaved={refreshCustomContent} /> : null}
    </>;
  }

  function renderPhrase() {
    const localized = localizedPhrase(exercise?.source_ru ?? "");
    return <h2 id="exercise-title" className="interactive-phrase" aria-label={exercise ? localized.source : t("Готовим фразу…")}>
      {exercise ? splitSourcePhrase(localized.source).map((part, index) => {
        if (!isSourceWord(part)) return <span key={index}>{part}</span>;
        const localHint = Object.hasOwn(localized.hints, part.toLowerCase()) ? localized.hints[part.toLowerCase()] : undefined;
        const word = part;
        const normalized = word.toLocaleLowerCase("ru-RU");
        const hasHint = localHint || exercise.word_hints?.some(hint => hint.word_ru.toLocaleLowerCase("ru-RU") === normalized);
        if (!hasHint && !/[А-Яа-яЁё]/.test(part)) return <span key={index}>{part}</span>;
        return <WordHintToken key={`${part}-${index}`} word={part} used={Boolean(wordHints[normalized])} disabled={checking || Boolean(attempt)} onDismiss={() => setActiveHint(undefined)} active={activeHint === normalized && (mobileLayout ? visiblePanel === 1 : view === "practice")} translation={wordHints[normalized] ? [displaySerbian(localHint?.translation_sr ?? wordHints[normalized].translation_sr, alphabet), localHint?.note ? t(localHint.note) : ""].filter(Boolean).join(" · ") : t("Загружаем…")} onClick={() => void showWordHint(word, localHint ? { word_ru: word, translation_sr: localHint.translation_sr } : undefined)} />;
      }) : t("Готовим фразу…")}
    </h2>;
  }

  function renderFeedback(native: boolean) {
    if (!attempt) return null;
    const scorePercent = Math.round(attempt.overall_score * 100);
    return <div className={`feedback ${native ? "android-feedback" : ""} feedback--${attempt.analysis.verdict}`}>
      <AnswerResult answer={attempt.transcript_sr} attempt={attempt} alphabet={alphabet} />
      {attempt.overall_score !== 1 && <div className="feedback__score"><span>{scorePercent}%</span><strong>{t(attempt.analysis.verdict === "correct" ? "Верно" : attempt.analysis.verdict === "mostly_correct" ? "Почти верно" : "Нужно доработать")}</strong></div>}
      {attempt.hint_penalty > 0 && <div className="hint-penalty"><Icon name="bulb" /><span>{t("Подсказки: −")}{Math.round(attempt.hint_penalty * 100)}%</span></div>}
      {scorePercent < 100 && <details><summary>{t("Разбор")}</summary><p>{displayFeedback(attempt.analysis.detailed_feedback_ru, alphabet)}</p>{attempt.analysis.issues.map((issue, index) => <p className="issue" key={`${issue.skill_key}-${issue.type}-${index}`}>{displaySerbian(issue.evidence, alphabet)}{t(issue.correction ? ` → ${displaySerbian(issue.correction, alphabet)}` : "")}{issue.explanation_ru && <span className="issue-explanation">{displayFeedback(issue.explanation_ru, alphabet)}</span>}</p>)}</details>}
    </div>;
  }

  function renderPractice(compact: boolean) {
    const answerId = compact ? "android-serbian-answer" : "serbian-answer";
    const done = !isReviewMode && completedCount >= (session?.requested_length ?? 10);
    return <div className={`practice-card exercise-layout${compact ? " android-training-content" : " panel"}`}>
      <RewardOverlay reward={reward?.kind !== "twenty" ? reward : undefined} />
      <div className="exercise-scroll">
        <div className="exercise-topic">{phraseTopicTitle}</div>
        {!attempt && <div className="exercise-source">{renderPhrase()}</div>}
        {!attempt ? <form id="practice-answer-form" className="exercise-answer" onSubmit={checkAnswer}>
          {hasTranscript && <div className="exercise-answer-frame result-phrase"><label htmlFor={answerId}>{t("Ваш ответ")}</label>
            <textarea id={answerId} value={answer} readOnly={checking} onChange={(event) => { answerEditEpochRef.current += 1; voiceTimingRef.current = undefined; setAssistanceDraft(current => current ? { ...current, edited: true } : undefined); setAnswer(event.target.value); }} placeholder={t("Введите ответ на сербском языке")} rows={3} /></div>}
          {hasUnexpectedLetterScript(answer) && <p className="transcription-script-warning" role="alert">{t("В расшифровке есть буквы вне сербского алфавита. Исправьте текст перед проверкой или запишите ответ заново.")}</p>}
          {transcriptionBreakRecommended && <p className="transcription-script-warning" role="alert">{t(transcriptionBreakMessage)}</p>}
          <TranscriptionAssistanceView draft={assistanceDraft} alphabet={alphabet} disabled={checking || voiceBusy} onToggle={toggleTranscriptionChange} />
          {!hasTranscript && (voiceState === "error" || !voiceSupported) && <button type="button" onClick={enterAnswerManually}>{t("Ввести ответ вручную")}</button>}
        </form> : renderFeedback(compact)}
        {error && <p className="error" role="alert">{t(error)}</p>}
      </div>
      <div className="exercise-controls">
        {!attempt ? <>
          <AnswerActions answer={answer} loading={checking} native={isNative} voiceState={voiceState} voiceSupported={voiceSupported} startVoice={() => void startVoice()} finishVoice={() => void finishVoice()} stopVoice={stopVoice} />
          <div className="exercise-voice-status" role="status">{t(!voiceSupported ? "Микрофон недоступен. Разрешите доступ к нему в браузере или устройстве." : voiceState === "connecting" ? "Подключаем микрофон…" : voiceState === "recording" ? "Идёт запись. Аудио не сохраняется" : voiceState === "transcribing" ? "Расшифровываем фразу…" : voiceState === "error" ? "Не удалось распознать ответ. Повторите запись." : hasTranscript ? "Введите ответ или исправьте распознанный текст." : "Нажмите на микрофон, чтобы ответить.")}</div>
        </> : <button className={compact ? "android-primary" : "answer-submit"} type="button" disabled={advancing} onClick={() => void nextExercise()}>{t(advancing ? "Готовим…" : done ? "Завершить тренировку" : compact ? "Следующая" : "Следующая фраза")}{!compact && <Icon name="arrow" />}</button>}
      </div>
    </div>;
  }

  if (startupState === "loading") return <main className="auth-page auth-page--loading"><PhraseLoading /></main>;

  if (mobileLayout) {
    return (
      <div ref={isNative ? undefined : mobileShellRef} className={`android-shell${isNative ? "" : " mobile-web-shell"}`}>
        <RewardOverlay reward={reward?.kind === "twenty" ? reward : undefined} />
        <header className="android-header">
          <strong>Serbo<span>Talk</span></strong>
          <nav aria-label={t("Панели приложения")}>
            <button type="button" aria-label={t("Темы")} aria-current={visiblePanel === 0 ? "page" : undefined} onClick={() => showAndroidPanel(0)}><Icon name="home" /></button>
            <button type="button" aria-label={t("Тренировка")} aria-current={visiblePanel === 1 ? "page" : undefined} onClick={() => showAndroidPanel(1)}><Icon name="mic" /></button>
            <button type="button" aria-label={t("Статистика")} aria-current={visiblePanel === 2 ? "page" : undefined} onClick={() => showAndroidPanel(2)}><Icon name="chart" /></button>
            <button type="button" aria-label={t("Настройки")} aria-current={visiblePanel === 3 ? "page" : undefined} onClick={() => showAndroidPanel(3)}><Icon name="settings" /></button>
          </nav>
        </header>

        <div
          className="android-pager"
          aria-label={t("Содержимое панели")}
          ref={androidPagerRef}
          onScroll={(event) => {
            if (!isNative) return;
            const width = event.currentTarget.clientWidth;
            if (width) {
              const panel = Math.round(event.currentTarget.scrollLeft / width);
              if (panel === 1 && initialExerciseTimingPendingRef.current) {
                initialExerciseTimingPendingRef.current = false;
                startUiTiming("first_phrase");
              }
              if (panel !== 1) interruptVoice();
              setAndroidPanel(panel);
            }
          }}
        >
          <section className="android-page android-topics-page" hidden={!isNative && visiblePanel !== 0} aria-label={t("Выбор темы")}>
            <div className="android-topic-list" aria-label={t("Темы тренировки")}>
              <button className={isReviewMode ? "android-topic is-selected" : "android-topic"} type="button" disabled={reviewPhraseCount === 0} onClick={() => { showAndroidPanel(1); void startReviewTraining(); }}>
                <span className="topic__icon"><Icon name="repeat" /></span>
                <strong>{t("Повторение")}</strong>
                <small>{reviewPhraseCount}<span>{t("к повторению")}</span></small>
              </button>
              {topics.map((topic) => (
                <button className={selectedTopic === topic.id && !customTopic ? "android-topic is-selected" : "android-topic"} key={topic.id} type="button" onClick={() => { selectTopic(topic.id); showAndroidPanel(1); }}>
                  <span className={`topic__icon topic__icon--${topicIcons[topic.id] ?? "message"}`}><Icon name={topicIcons[topic.id] ?? "message"} /></span>
                  <strong>{topicText(topic.id, topic.title_ru)}</strong>
                  <small>{topic.phrase_count}<span>{t(" неизученных")}</span></small>
                </button>
              ))}
              <button className={account.role === "admin" ? "android-topic android-topic--add" : "android-topic android-topic--premium"} type="button" disabled={account.role !== "admin"} onClick={() => { interruptVoice(); setContentForm("topic"); }}>
                <span className="topic__icon"><Icon name="plus" /></span>
                <strong>{t("+ добавить тему")}</strong>{account.role !== "admin" && <PremiumBadge />}
              </button>
              <button className={account.role === "admin" ? "android-topic android-topic--add" : "android-topic android-topic--premium"} type="button" disabled={account.role !== "admin"} onClick={() => { interruptVoice(); setContentForm("phrase"); }}>
                <span className="topic__icon"><Icon name="plus" /></span>
                <strong>{t("+ добавить фразу")}</strong>{account.role !== "admin" && <PremiumBadge />}
              </button>
            </div>

            {renderContentForm()}
            {(startupState === "fallback" || backendState === "offline") && <div className="android-error" role="alert">{t(startupState === "fallback" ? error : "Нет подключения к сервису.")} <button type="button" onClick={retryCatalog}>{t("Повторить загрузку")}</button></div>}
          </section>

          <section className="android-page android-training-page" hidden={!isNative && visiblePanel !== 1} aria-label={t("Тренировка")}>
            {preparingPhrase && !session ? <PhraseLoading /> : sessionComplete ? (
              <div className="practice-done"><h1>{t(topicExhausted ? "Все фразы темы пройдены" : "Тренировка завершена")}</h1><p>{t(topicExhausted ? `${completedCount} фраз проверено. В этой теме пока нет следующих фраз.` : `${completedCount} из ${session?.requested_length ?? 10} фраз проверено.`)}</p><button className="android-primary" type="button" onClick={() => { resetTraining(); if (mobileLayout) showAndroidPanel(0); }}>{t("Выбрать новую тему")}</button></div>
            ) : !session && reviewFinished ? (
              <div className="review-complete">
                <button className="review-home" type="button" aria-label={t("Выбрать тему")} onClick={returnToTopics}><Icon name="home" size={32} /></button>
                <p className="review-congratulations" role="status">{t(error)}</p>
              </div>
            ) : !session ? (
              <div className="android-training-start">
                <span className="topic__icon"><Icon name={topicIcons[currentTopic?.id ?? ""] ?? "message"} size={26} /></span>
                <h1>{customTopic.trim() || (currentTopic ? topicText(currentTopic.id, currentTopic.title_ru) : t("Выберите тему"))}</h1>
                {!isNative && <button className="android-primary" type="button" onClick={returnToTopics}>{t("Выбрать тему")}</button>}
                {error && <p className="android-error" role="alert">{t(error)}</p>}
              </div>
            ) : (
              renderPractice(true)
            )}
          </section>

          <section className="android-page android-statistics-page" hidden={!isNative && visiblePanel !== 2} aria-label={t("Статистика")}>
            {visiblePanel === 2 && <DeferredPanel load={loadStatistics} panelProps={{ alphabet, page: statisticsPage, onPageChange: setStatisticsPage }} label={t("статистику")} />}

          </section>
          <section className="android-page android-settings-page" hidden={!isNative && visiblePanel !== 3} aria-label={t("Настройки приложения")}>
            {!isNative && view === "admin" ? <><button className="mobile-admin-link" type="button" onClick={() => showAndroidPanel(3)}>{t("← Настройки")}</button><DeferredPanel load={loadAdminUsers} panelProps={{}} label={t("пользователей")} /></> : <>
            <SettingsView alphabet={alphabet} onAlphabetChange={changeAlphabet} account={account} onSignOut={onSignOut} assistanceEnabled={assistanceEnabled} assistanceSaving={assistanceSaving} assistanceError={assistanceError} onAssistanceChange={enabled => { interruptVoice(); void changeAssistance(enabled); }} />
            {!isNative && account.role === "admin" && <button className="mobile-admin-link" type="button" onClick={() => setView("admin")}>{t("Пользователи")}</button>}
            </>}

          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <RewardOverlay reward={reward?.kind === "twenty" ? reward : undefined} />
      <header className="topbar">
        <button className="brand" type="button" onClick={resetTraining} aria-label={t("SerboTalk — к практике")}>
          <span className="brand__mark"><Icon name="message" size={28} /></span>
          <span className="brand__copy"><strong>Serbo<span>Talk</span></strong><small>{t("Говори. Понимай. Будь ближе.")}</small></span>
        </button>
        <nav className="main-nav" aria-label={t("Основная навигация")}>
          <button className={view === "practice" ? "is-active" : ""} type="button" onClick={() => showView("practice")}><Icon name="home" />{t("Практика")}</button>
          <button className={view === "statistics" ? "is-active" : ""} type="button" onClick={() => showView("statistics")}><Icon name="chart" />{t("Статистика")}</button>
          <button className={view === "settings" ? "is-active" : ""} type="button" onClick={() => showView("settings")}><Icon name="settings" />{t("Настройки")}</button>
          {account.role === "admin" && !Capacitor.isNativePlatform() && <button className={view === "admin" ? "is-active" : ""} type="button" onClick={() => showView("admin")}><Icon name="settings" />{t("Пользователи")}</button>}
        </nav>
        <div className="profile">
          <div className={`connection connection--${backendState}`} role="status" aria-label={t(backendState === "online" ? "Backend готов" : backendState === "offline" ? "Backend недоступен" : "Подключение")}><span /></div>
          {backendState === "offline" && <button className="connection-settings-button" type="button" aria-label={t("Повторить загрузку тем")} onClick={retryCatalog}><Icon name="repeat" /></button>}
        </div>
      </header>



      {view === "admin" ? <DeferredPanel key="admin" load={loadAdminUsers} panelProps={{}} label={t("пользователей")} /> : view === "statistics" ? <DeferredPanel key="statistics" load={loadStatistics} panelProps={{ alphabet, page: statisticsPage, onPageChange: setStatisticsPage }} label={t("статистику")} /> : view === "settings" ? <SettingsView alphabet={alphabet} onAlphabetChange={changeAlphabet} account={account} onSignOut={onSignOut} assistanceEnabled={assistanceEnabled} assistanceSaving={assistanceSaving} assistanceError={assistanceError} onAssistanceChange={enabled => { interruptVoice(); void changeAssistance(enabled); }} /> : (
        <main className="workspace">
          <aside className="topics-panel panel">
            <div className="panel-heading"><h2>{t("Темы для практики")}</h2><p>{t("Выберите ситуацию и начните разговор на сербском языке")}</p></div>
            <div className="topics desktop-topic-grid" aria-label={t("Темы тренировки")}>
              <button className={isReviewMode ? "review-topic desktop-topic-card is-selected" : "review-topic desktop-topic-card"} type="button" onClick={() => void startReviewTraining()}>
                <span className="topic__icon"><Icon name="repeat" /></span>
                <span className="topic__copy"><strong>{t("Фразы для повторения")}</strong><small className="sr-only">{t(reviewPhraseCount ? `${reviewPhraseCount} требуют практики` : "Список пока пуст")}</small></span>
                <span className="review-topic__count">{reviewPhraseCount}</span>
              </button>
              {topics.map((topic) => (
                <button className={selectedTopic === topic.id && !customTopic ? "topic desktop-topic-card is-selected" : "topic desktop-topic-card"} key={topic.id} type="button" onClick={() => selectTopic(topic.id)}>
                  <span className={`topic__icon topic__icon--${topicIcons[topic.id] ?? "message"}`}><Icon name={topicIcons[topic.id] ?? "message"} /></span>
                  <span className="topic__copy"><strong>{topicText(topic.id, topic.title_ru)}</strong></span>
                  <span className="topic__unlearned"><strong>{topic.phrase_count}</strong><small>{t("неизученных")}</small></span>
                </button>
              ))}
              <button className={account.role === "admin" ? "desktop-topic-card" : "desktop-topic-card desktop-topic-card--premium"} type="button" disabled={account.role !== "admin"} onClick={() => { interruptVoice(); setContentForm("topic"); }}>
                <span className="topic__icon"><Icon name="plus" /></span><strong>{t("+ добавить тему")}</strong>{account.role !== "admin" && <PremiumBadge />}
              </button>
              <button className={account.role === "admin" ? "desktop-topic-card" : "desktop-topic-card desktop-topic-card--premium"} type="button" disabled={account.role !== "admin"} onClick={() => { interruptVoice(); setContentForm("phrase"); }}>
                <span className="topic__icon"><Icon name="plus" /></span><strong>{t("+ добавить фразу")}</strong>{account.role !== "admin" && <PremiumBadge />}
              </button>
            </div>
            {renderContentForm()}
            <div className="topics-panel__note"><Icon name="message" /><span>{t("Каждый короткий разговор делает речь увереннее.")}</span></div>
          </aside>

          <section className={`practice-stage${preparingPhrase && !session ? " is-preparing" : ""}`} aria-label={t("Практика")}>
            {preparingPhrase && !session ? <PhraseLoading /> : sessionComplete ? (
              <div className="practice-done panel"><h1>{t(topicExhausted ? "Все фразы темы пройдены" : "Тренировка завершена")}</h1><p>{t(topicExhausted ? `${completedCount} фраз проверено. В этой теме пока нет следующих фраз.` : `${completedCount} из ${session?.requested_length ?? 10} фраз проверено.`)}</p><button className="answer-submit" type="button" onClick={() => { resetTraining(); if (mobileLayout) showAndroidPanel(0); }}>{t("Выбрать новую тему")}</button></div>
            ) : !session && reviewFinished ? (
              <div className="review-complete">
                <button className="review-home" type="button" aria-label={t("Выбрать тему")} onClick={returnToTopics}><Icon name="home" size={32} /></button>
                <p className="review-congratulations" role="status">{t(error)}</p>
              </div>
            ) : !session ? (
              <div className="welcome-card panel">
                <div className="welcome-card__glow"/><span className="welcome-card__icon"><Icon name={topicIcons[currentTopic?.id ?? ""] ?? "message"} size={32} /></span>
                <p className="kicker">{t("Выбранная ситуация")}</p><h2>{customTopic.trim() || (currentTopic ? topicText(currentTopic.id, currentTopic.title_ru) : t("Выберите тему"))}</h2>
                <p>{t(selectedTopicData?.phrase_count === 0 ? "Тема пока пустая. Добавьте в неё фразы — автоматической генерации не будет." : currentTopic?.description_ru || "Темы загрузятся после подключения к backend.")}</p>
                {(startupState === "fallback" || backendState === "offline") && <button className="answer-submit" type="button" onClick={retryCatalog}>{t("Повторить загрузку")}</button>}
                <div className="welcome-card__steps"><span><b>1</b>{t(" Получите фразу")}</span><span><b>2</b>{t(" Ответьте голосом")}</span><span><b>3</b>{t(" Разберите результат")}</span></div>
                {error && <p className="error" role="alert">{t(error)}</p>}
              </div>
            ) : (
              renderPractice(false)
            )}
          </section>
        </main>
      )}
    </div>
  );
}
