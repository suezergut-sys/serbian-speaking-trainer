import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";

import { getApiBaseUrl, setApiBaseUrl } from "./api/baseUrl";
import { addReviewPhrase, BackendError, createTopic, fetchNextExercise, fetchReviewSummary, fetchTopics, prepareReviewPhrase, revealWordHint, startTrainingSession, submitAttempt, transcribeAudio } from "./api/training";
import type { Attempt, AttemptTimings, Exercise, PreparedReviewPhrase, TopicListItem, TrainingSession, WordHint } from "./types/training";
import { supportsVoiceRecording, VoiceRecorder } from "./voiceRecorder";
import { StatisticsView } from "./StatisticsView";
import { AdminUsersView } from "./AdminUsersView";
import { fetchCurrentUser } from "./api/users";
import { initializeAuth, isAuthConfigured, onAuthStateChange, signInWithGoogle, signOut } from "./auth";
import type { CurrentUser } from "./types/auth";
import { LegalPage } from "./LegalPage";
import { SettingsView } from "./SettingsView";
import { displaySerbian, displaySerbianInRussianText, readSerbianAlphabet, saveSerbianAlphabet, toSerbianLatin, type SerbianAlphabet } from "./serbianScript";
import { AnswerResult } from "./AnswerResult";
import { finishUiTimingWhenVisible, startUiTiming } from "./performance";
import appLogo from "./assets/app-logo.png?inline";
import "./styles.css";

type BackendState = "checking" | "online" | "offline";
type VoiceState = "idle" | "connecting" | "recording" | "transcribing" | "error";
type AppView = "practice" | "statistics" | "settings" | "admin";

function PhraseLoading() {
  return <div className="phrase-loading auth-loading" role="status" aria-label="Подготовка фразы">
    <span className="auth-loading__ring"><img src={appLogo} alt="SerboTalk" /></span>
    <p>Подготовка фразы</p>
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
  return `после ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date)}`;
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
    repeat: <><path fill="currentColor" stroke="none" d="M2.4 8.1C5.6 1.1 15.7.6 21 5.1V2.5L24 8l-5.1 3.4.4-3.2C15.6 4.8 9.2 4.2 5.3 10.2Z"/><path fill="currentColor" stroke="none" d="M21.6 15.9C18.4 22.9 8.3 23.4 3 18.9v2.6L0 16l5.1-3.4-.4 3.2c3.7 3.4 10.1 4 14-2Z"/></>,
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
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  };
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.message}</svg>;
}

export default function App() {
  if (window.location.pathname === "/privacy") return <LegalPage kind="privacy" />;
  if (window.location.pathname === "/terms") return <LegalPage kind="terms" />;
  return <AuthenticatedApp />;
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
        if (active && lastToken === token) setAuthError("Не удалось загрузить профиль. Проверьте настройку Supabase Auth на backend.");
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

  if (!authReady) return <main className="auth-page auth-page--loading"><div className="auth-loading" role="status" aria-label="Авторизация и загрузка">
    <span className="auth-loading__ring"><img src={appLogo} alt="SerboTalk" /></span>
    <p>Авторизация и загрузка...</p>
  </div></main>;
  if (!isAuthConfigured()) return <main className="auth-page"><div className="auth-card panel"><h1>Нужна настройка входа</h1><p>Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в окружение frontend.</p></div></main>;
  if (!hasSession || !account) return <main className="auth-page"><div className="auth-card panel"><span className="brand__mark"><Icon name="message" size={34}/></span><h1>Добро пожаловать в SerboTalk</h1><p>Войдите или зарегистрируйтесь с Google, чтобы сохранять свой прогресс на всех устройствах.</p><button className="google-sign-in" type="button" onClick={() => void login()}>Войти через Google</button>{authError && <p className="error" role="alert">{authError}</p>}<nav className="auth-legal" aria-label="Правовая информация"><a href="/privacy">Конфиденциальность</a><a href="/terms">Условия</a></nav></div></main>;
  return <TrainerApp key={account.id} account={account} onAccountChange={setAccount} onSignOut={() => void signOut()} />;
}

function TrainerApp({ account, onAccountChange, onSignOut }: { account: CurrentUser; onAccountChange: (account: CurrentUser) => void; onSignOut: () => void }) {
  const [backendState, setBackendState] = useState<BackendState>("checking");
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState(getApiBaseUrl());
  const [view, setView] = useState<AppView>("practice");
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>();
  const [customTopic, setCustomTopic] = useState("");
  const [reviewPhraseCount, setReviewPhraseCount] = useState(0);
  const [newPhrase, setNewPhrase] = useState("");
  const [preparedPhrase, setPreparedPhrase] = useState<PreparedReviewPhrase>();
  const [phraseTopicId, setPhraseTopicId] = useState("");
  const [session, setSession] = useState<TrainingSession>();
  const [exercise, setExercise] = useState<Exercise>();
  const [exerciseNumber, setExerciseNumber] = useState(1);
  const [answer, setAnswer] = useState("");
  const [hasTranscript, setHasTranscript] = useState(false);
  const [alphabet, setAlphabet] = useState<SerbianAlphabet>(() => readSerbianAlphabet(account.id));
  const alphabetRef = useRef(alphabet);
  const [attempt, setAttempt] = useState<Attempt>();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [topicExhausted, setTopicExhausted] = useState(false);
  const [preparingPhrase, setPreparingPhrase] = useState(false);
  const [error, setError] = useState<string>();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
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
  const [androidPanel, setAndroidPanel] = useState(0);
  const voiceSupported = supportsVoiceRecording();
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => { startUiTiming("topics"); }, []);
  useEffect(() => {
    if (topics.length) finishUiTimingWhenVisible("topics", isNative ? ".android-topic-list .android-topic" : ".topics .topic");
  }, [topics, isNative]);
  useEffect(() => {
    if (exercise && !attempt) {
      const selector = isNative ? ".android-page .interactive-phrase" : ".practice-stage .interactive-phrase";
      if (presentedExerciseRef.current !== exercise.id && (isNative ? androidPanel === 1 : view === "practice")) {
        document.querySelector<HTMLElement>(selector)?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
        presentedExerciseRef.current = exercise.id;
      }
      finishUiTimingWhenVisible("first_phrase", selector);
      finishUiTimingWhenVisible("next_phrase", selector);
    }
  }, [exercise, attempt, isNative, androidPanel, view]);
  useEffect(() => {
    if (hasTranscript) finishUiTimingWhenVisible("transcription", isNative ? "#android-serbian-answer" : "#serbian-answer");
  }, [hasTranscript, isNative]);
  useEffect(() => {
    if (attempt) finishUiTimingWhenVisible("check", ".feedback");
  }, [attempt]);

  function invalidateFlow() {
    flowEpochRef.current += 1;
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

  function showAndroidPanel(panel: number) {
    const pager = androidPagerRef.current;
    if (panel !== 1) interruptVoice();
    setAndroidPanel(panel);
    if (!pager) return;
    const left = panel * pager.clientWidth;
    if (typeof pager.scrollTo === "function") pager.scrollTo({ left, behavior: "auto" });
    else pager.scrollLeft = left;
  }

  function saveConnectionSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setApiBaseUrl(apiEndpoint);
      window.location.reload();
    } catch {
      setError("Адрес сервера должен начинаться с http:// или https://");
    }
  }

  const refreshReviewSummary = useCallback((signal?: AbortSignal) => {
    const epoch = ++reviewSummaryEpochRef.current;
    return fetchReviewSummary(signal).then((summary) => {
      if (reviewSummaryEpochRef.current === epoch) setReviewPhraseCount(summary.phrase_count);
    });
  }, []);

  const loadCatalog = useCallback(() => {
    catalogControllerRef.current?.abort();
    const controller = new AbortController();
    catalogControllerRef.current = controller;
    const epoch = ++catalogEpochRef.current;
    fetchTopics(controller.signal)
      .then((availableTopics) => {
        if (catalogEpochRef.current !== epoch) return;
        setTopics(availableTopics);
        setSelectedTopic((current) => current ?? availableTopics[0]?.id);
        setBackendState("online");
        void refreshReviewSummary(controller.signal)
          .catch((requestError: unknown) => {
            if (catalogEpochRef.current !== epoch) return;
            if (requestError instanceof DOMException && requestError.name === "AbortError") return;
            setError("Не удалось загрузить фразы для повторения.");
          });
      })
      .catch(() => {
        if (catalogEpochRef.current !== epoch) return;
        setBackendState("offline");
      });
  }, [refreshReviewSummary]);

  function retryCatalog() {
    setBackendState("checking");
    setError(undefined);
    loadCatalog();
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
    let controller: AbortController | undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      catalogControllerRef.current?.abort();
      controller = new AbortController();
      const epoch = ++catalogEpochRef.current;
      void fetchTopics(controller.signal)
        .then((availableTopics) => {
          if (catalogEpochRef.current !== epoch) return;
          setTopics(availableTopics);
          setSelectedTopic((current) => current ?? availableTopics[0]?.id);
          setBackendState("online");
        })
        .catch(() => { if (catalogEpochRef.current === epoch) setBackendState("offline"); });
      void refreshReviewSummary(controller.signal).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { controller?.abort(); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [refreshReviewSummary]);
  const selectedTopicData = topics.find((topic) => topic.id === selectedTopic);
  const currentTopic = session?.topic ?? selectedTopicData;
  const isReviewMode = session?.topic.id === "review-phrases";
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
  }, [interruptVoice, isNative]);

  function showView(next: AppView) {
    if (next !== "practice") interruptVoice();
    setView(next);
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
      const transcript = await transcribeAudio(exerciseId, recording.audio, controller.signal);
      if (voiceEpochRef.current !== epoch) return;
      if (answerEditEpochRef.current === voiceStartEditEpochRef.current) {
        voiceTimingRef.current = recording.timing;
        setAnswer(displaySerbian(transcript.text, alphabetRef.current));
        setHasTranscript(true);
      }
      setVoiceState("idle");
    } catch {
      if (voiceEpochRef.current !== epoch) return;
      recorder.stop(); voiceRef.current = undefined; voiceTimingRef.current = undefined;
      setVoiceState("error"); setError("Не удалось расшифровать речь. Попробуйте записать короткую фразу ещё раз.");
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
    stopVoice(); setAnswer(""); setHasTranscript(false); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
    setSession(undefined); setExercise(undefined); setCompletedCount(0); setSessionComplete(false); setTopicExhausted(false);
    setPreparingPhrase(true); setError(undefined);
    const epoch = flowEpochRef.current;
    const controller = new AbortController();
    flowControllerRef.current = controller;
    try {
      const started = await startTrainingSession({ topic_id: topicId }, controller.signal);
      if (flowEpochRef.current !== epoch) return;
      setSession(started.session); setExercise(started.exercise); setExerciseNumber(1);
      setCompletedCount(started.session.completed_count ?? 0);
    } catch (requestError) {
      if (flowEpochRef.current !== epoch) return;
      setError(requestError instanceof BackendError && (requestError.code === "topic_empty" || requestError.status === 409)
        ? "В этой теме сейчас нет фраз для тренировки. Добавьте новую или дождитесь повторения."
        : "Не удалось начать тренировку. Проверьте, что backend запущен.");
    }
    finally { if (flowEpochRef.current === epoch) { flowControllerRef.current = undefined; setPreparingPhrase(false); } }
  }

  async function startReviewTraining() {
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
      setSession(started.session); setExercise(started.exercise); setExerciseNumber(1);
      setAnswer(""); setHasTranscript(false); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
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
      setExercise(next); setExerciseNumber((current) => isReviewMode ? current + 1 : Math.min(current + 1, session.requested_length));
      wordHintsRef.current = {}; savedHintsRef.current.clear();
      setAnswer(""); setHasTranscript(false); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
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
        setAnswer(""); setHasTranscript(false); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
        setError("Все фразы из карусели освоены. Отличная работа!");
      } else setError("Не удалось получить следующую фразу.");
    }
    finally { if (flowEpochRef.current === epoch) { advancingRef.current = false; flowControllerRef.current = undefined; setAdvancing(false); } }
  }

  async function checkAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exercise || !session || !hasTranscript || !answer.trim() || checkingRef.current || voiceBusy) return;
    startUiTiming("check");
    const transcript = toSerbianLatin(answer.trim());
    const timing = voiceTimingRef.current;
    const hintedWords = Object.keys(wordHintsRef.current).sort();
    const payload = JSON.stringify({ exerciseId: exercise.id, transcript, timing, hintedWords });
    const id = pendingAttemptRef.current?.payload === payload ? pendingAttemptRef.current.id : requestId();
    pendingAttemptRef.current = { payload, id };
    checkingRef.current = true;
    setChecking(true); setError(undefined); setActiveHint(undefined);
    const epoch = flowEpochRef.current;
    const controller = new AbortController();
    flowControllerRef.current = controller;
    try {
      const completed = await submitAttempt(exercise.id, transcript, timing, hintedWords, id, controller.signal);
      if (flowEpochRef.current !== epoch) return;
      pendingAttemptRef.current = undefined;
      setAttempt(completed);
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
    stopVoice(); setView("practice"); setSession(undefined); setExercise(undefined); setExerciseNumber(1);
    setAnswer(""); setHasTranscript(false); setAttempt(undefined); setError(undefined); setWordHints({}); setActiveHint(undefined); setCompletedCount(0); setSessionComplete(false); setTopicExhausted(false);
  }

  function selectTopic(topicId: string) {
    if (session || preparingPhrase || sessionComplete) resetTraining();
    setSelectedTopic(topicId); setCustomTopic("");
    setSession(undefined); setExercise(undefined);
    if (topics.find((topic) => topic.id === topicId)?.phrase_count) void startTraining(topicId);
  }

  async function saveCustomTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (customTopic.trim().length < 2) return;
    setLoading(true); setError(undefined);
    try {
      const created = await createTopic(customTopic.trim());
      setTopics((current) => [...current.filter((item) => item.id !== created.id), created]);
      setSelectedTopic(created.id); setPhraseTopicId(created.id); setCustomTopic("");
    } catch { setError("Не удалось создать тему."); }
    finally { setLoading(false); }
  }

  async function saveReviewPhrase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPhrase.trim()) return;
    setLoading(true); setError(undefined);
    try {
      if (!preparedPhrase) {
        const prepared = await prepareReviewPhrase(newPhrase.trim());
        setPreparedPhrase(prepared);
        setPhraseTopicId(selectedTopic ?? topics.find((topic) => topic.id === "misc")?.id ?? topics[0]?.id ?? "");
      } else if (phraseTopicId) {
        await addReviewPhrase(preparedPhrase, phraseTopicId);
        void refreshReviewSummary().catch(() => undefined);
        void fetchTopics().then(setTopics).catch(() => undefined);
        setNewPhrase(""); setPreparedPhrase(undefined); setPhraseTopicId("");
      }
    } catch { setError(preparedPhrase ? "Не удалось сохранить фразу." : "Не удалось создать канонический перевод. Проверьте настройки OpenAI."); }
    finally { setLoading(false); }
  }

  async function showWordHint(word: string) {
    if (!exercise || checkingRef.current) return;
    const normalized = word.toLocaleLowerCase("ru-RU");
    setActiveHint(normalized);
    const requestKey = `${hintEpochRef.current}:${normalized}`;
    if (hintRequestsRef.current.has(requestKey) || savedHintsRef.current.has(normalized)) return;
    const prepared = exercise.word_hints?.find((hint) => hint.word_ru.toLocaleLowerCase("ru-RU") === normalized);
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

  function renderPhrase() {
    // eslint-disable-next-line react-hooks/refs -- showWordHint reads refs only when the click handler runs.
    return <h2 id="exercise-title" className="interactive-phrase" aria-label={exercise?.source_ru ?? "Готовим фразу…"}>{exercise ? exercise.source_ru.split(/([А-Яа-яЁё]+)/g).filter(Boolean).map((part, index) => /^[А-Яа-яЁё]+$/.test(part) ? <span className="word-wrap" key={`${part}-${index}`}><button className={wordHints[part.toLocaleLowerCase("ru-RU")] ? "word-token is-used" : "word-token"} type="button" disabled={checking} onClick={() => void showWordHint(part)}>{part}</button>{activeHint === part.toLocaleLowerCase("ru-RU") && <span className="word-tooltip" role="status">{wordHints[part.toLocaleLowerCase("ru-RU")] ? displaySerbian(wordHints[part.toLocaleLowerCase("ru-RU")].translation_sr, alphabet) : "Загружаем…"}</span>}</span> : <span key={`${part}-${index}`}>{part}</span>) : "Готовим фразу…"}</h2>;
  }

  function renderFeedback(native: boolean) {
    if (!attempt) return null;
    const done = !isReviewMode && completedCount >= (session?.requested_length ?? 10);
    return <div className={`feedback ${native ? "android-feedback" : ""} feedback--${attempt.analysis.verdict}`}>
      <AnswerResult source={exercise?.source_ru ?? ""} answer={attempt.transcript_sr} attempt={attempt} alphabet={alphabet} />
      <div className="feedback__score"><span>{Math.round(attempt.overall_score * 100)}%</span><strong>{attempt.analysis.verdict === "correct" ? "Верно" : attempt.analysis.verdict === "mostly_correct" ? "Почти верно" : "Нужно доработать"}</strong></div>
      {attempt.hint_penalty > 0 && <div className="hint-penalty"><Icon name="bulb" /><span>Подсказки: −{Math.round(attempt.hint_penalty * 100)} баллов</span></div>}
      <p>{displaySerbianInRussianText(attempt.analysis.short_feedback_ru, alphabet)}</p>
      <details><summary>Разбор</summary><p>{displaySerbianInRussianText(attempt.analysis.detailed_feedback_ru, alphabet)}</p><div className="score-grid"><span>Смысл <b>{Math.round(attempt.analysis.semantic_score * 100)}</b></span><span>Грамматика <b>{Math.round(attempt.analysis.grammar_score * 100)}</b></span><span>Лексика <b>{Math.round(attempt.analysis.lexical_score * 100)}</b></span><span>Естественность <b>{Math.round(attempt.analysis.naturalness_score * 100)}</b></span></div>{attempt.analysis.issues.map((issue, index) => <p className="issue" key={`${issue.skill_key}-${issue.type}-${index}`}>{displaySerbianInRussianText(issue.evidence, alphabet)}{issue.correction ? ` → ${displaySerbianInRussianText(issue.correction, alphabet)}` : ""}</p>)}</details>
      <button className={native ? "android-primary" : "answer-submit"} type="button" disabled={advancing} onClick={() => void nextExercise()}>{advancing ? "Готовим…" : done ? "Завершить тренировку" : native ? "Следующая" : "Следующая фраза"}{!native && <Icon name="arrow" />}</button>
    </div>;
  }

  if (isNative) {
    return (
      <div className="android-shell">
        <header className="android-header">
          <strong>Serbo<span>Talk</span></strong>
          <nav aria-label="Панели приложения">
            <button type="button" aria-label="Темы" aria-current={androidPanel === 0 ? "page" : undefined} onClick={() => showAndroidPanel(0)}><Icon name="home" /></button>
            <button type="button" aria-label="Тренировка" aria-current={androidPanel === 1 ? "page" : undefined} onClick={() => showAndroidPanel(1)}><Icon name="mic" /></button>
            <button type="button" aria-label="Статистика" aria-current={androidPanel === 2 ? "page" : undefined} onClick={() => showAndroidPanel(2)}><Icon name="chart" /></button>
            <button type="button" aria-label="Настройки" aria-current={androidPanel === 3 ? "page" : undefined} onClick={() => showAndroidPanel(3)}><Icon name="settings" /></button>
          </nav>
        </header>

        <div
          className="android-pager"
          ref={androidPagerRef}
          onScroll={(event) => {
            const width = event.currentTarget.clientWidth;
            if (width) {
              const panel = Math.round(event.currentTarget.scrollLeft / width);
              if (panel !== 1) interruptVoice();
              setAndroidPanel(panel);
            }
          }}
        >
          <section className="android-page android-topics-page" aria-label="Выбор темы">
            <div className="android-topic-list" aria-label="Темы тренировки">
              <button className={isReviewMode ? "android-topic is-selected" : "android-topic"} type="button" disabled={reviewPhraseCount === 0} onClick={() => { showAndroidPanel(1); void startReviewTraining(); }}>
                <span className="topic__icon"><Icon name="repeat" /></span>
                <strong>Повторение</strong>
                <small>{reviewPhraseCount}<span>к повторению</span></small>
              </button>
              {topics.map((topic) => (
                <button className={selectedTopic === topic.id && !customTopic ? "android-topic is-selected" : "android-topic"} key={topic.id} type="button" onClick={() => { selectTopic(topic.id); showAndroidPanel(1); }}>
                  <span className={`topic__icon topic__icon--${topicIcons[topic.id] ?? "message"}`}><Icon name={topicIcons[topic.id] ?? "message"} /></span>
                  <strong>{topic.title_ru}</strong>
                  <small>{topic.phrase_count}<span> неизученных</span></small>
                </button>
              ))}
            </div>

            <details className="android-action-card">
              <summary><Icon name="plus" /> Своя тема</summary>
              <form onSubmit={saveCustomTopic}>
                <input value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} placeholder="Название темы" aria-label="Своя тема" />
                <button type="submit" disabled={loading || customTopic.trim().length < 2}>Создать</button>
              </form>
            </details>
            <details className="android-action-card">
              <summary><Icon name="plus" /> Добавить фразу</summary>
              <form onSubmit={saveReviewPhrase}>
                <input value={newPhrase} onChange={(event) => { setNewPhrase(event.target.value); setPreparedPhrase(undefined); }} placeholder="Фраза на русском" aria-label="Новая фраза для повторения" />
                {preparedPhrase && <div className="android-prepared-phrase" aria-label="Канонический перевод">
                  <strong lang={alphabet === "cyrillic" ? "sr-Cyrl" : "sr-Latn"}>{displaySerbian(preparedPhrase.canonical_sr, alphabet)}</strong>
                  <select aria-label="Тема для новой фразы" value={phraseTopicId} onChange={(event) => setPhraseTopicId(event.target.value)}>
                    <option value="">Выберите тему</option>
                    {topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.title_ru}</option>)}
                  </select>
                </div>}
                <button type="submit" disabled={loading || newPhrase.trim().length < 3 || Boolean(preparedPhrase && !phraseTopicId)}>{preparedPhrase ? "Сохранить" : "Перевести"}</button>
              </form>
            </details>
            {backendState === "offline" && <div className="android-error" role="alert">Нет подключения к сервису. <button type="button" onClick={retryCatalog}>Повторить загрузку тем</button></div>}
          </section>

          <section className="android-page android-training-page" aria-label="Тренировка">
            {preparingPhrase && !session ? <PhraseLoading /> : sessionComplete ? (
              <div className="practice-done"><h1>{topicExhausted ? "Все фразы темы пройдены" : "Тренировка завершена"}</h1><p>{topicExhausted ? `${completedCount} фраз проверено. В этой теме пока нет следующих фраз.` : `${completedCount} из ${session?.requested_length ?? 10} фраз проверено.`}</p><button className="android-primary" type="button" onClick={resetTraining}>Выбрать новую тему</button></div>
            ) : !session ? (
              <div className="android-training-start">
                <span className="topic__icon"><Icon name={topicIcons[currentTopic?.id ?? ""] ?? "message"} size={26} /></span>
                <h1>{customTopic.trim() || currentTopic?.title_ru || "Выберите тему"}</h1>
                {error && <p className="android-error" role="alert">{error}</p>}
              </div>
            ) : (
              <div className="android-training-content practice-card">
                <div className="android-training-meta"><span>{currentTopic?.title_ru}</span><small>{exerciseNumber}/{session.requested_length}</small></div>
                {!attempt && renderPhrase()}

                {!attempt ? <form className="android-answer" onSubmit={checkAnswer}>
                  {hasTranscript ? <><label className="sr-only" htmlFor="android-serbian-answer">Ваш ответ</label>
                    <textarea id="android-serbian-answer" value={answer} readOnly={checking} onChange={(event) => { answerEditEpochRef.current += 1; voiceTimingRef.current = undefined; setAnswer(event.target.value); }} placeholder="Введите ответ на сербском языке" rows={3} /></> : <p className="voice-prompt">Произнесите ответ в микрофон</p>}
                  {voiceState === "connecting" || voiceState === "recording" || voiceState === "transcribing" ? <button className="mic-button is-active" type="button" aria-label={voiceState === "recording" ? "Завершить запись" : "Остановить запись"} disabled={checking || voiceState === "transcribing"} onClick={voiceState === "recording" ? finishVoice : stopVoice}><Icon name="mic" size={34} /></button> : <button className="mic-button" type="button" aria-label="Ответить голосом" disabled={checking || !voiceSupported} onClick={startVoice}><Icon name="mic" size={34} /></button>}
                  {(!voiceSupported || voiceState !== "idle") && <p className="android-voice-state" role="status">{!voiceSupported ? "Микрофон недоступен. Разрешите доступ в настройках устройства." : voiceState === "connecting" ? "Подключаем микрофон…" : voiceState === "recording" ? "Запись" : voiceState === "transcribing" ? "Распознаём…" : "Повторите запись"}</p>}
                  {!hasTranscript && (voiceState === "error" || !voiceSupported) && <button type="button" onClick={enterAnswerManually}>Ввести ответ вручную</button>}
                  {hasTranscript && <button className="android-primary" type="submit" disabled={checking || voiceBusy || !answer.trim()}>{checking ? "Проверяем…" : "Проверить"}</button>}
                </form> : renderFeedback(true)}
                {error && <p className="android-error" role="alert">{error}</p>}
              </div>
            )}
          </section>

          <section className="android-page android-statistics-page" aria-label="Статистика">
            {androidPanel === 2 && <StatisticsView alphabet={alphabet} />}
            <footer className="android-service-bar">
              <span className="avatar">{account.display_name?.slice(0, 1).toLocaleUpperCase() || "A"}</span>
              <span><strong>{account.display_name || account.email}</strong><small>{account.daily_usage.limit === null ? `${account.daily_usage.used} фраз` : `${account.daily_usage.remaining} из ${account.daily_usage.limit}`}</small></span>
              <button type="button" onClick={onSignOut}>Выйти</button>
            </footer>
            {account.role === "admin" && <details className="android-action-card android-admin-settings">
              <summary><Icon name="settings" /> Backend</summary>
              <form onSubmit={saveConnectionSettings}><input value={apiEndpoint} onChange={(event) => setApiEndpoint(event.target.value)} aria-label="Адрес общего backend" /><button type="submit">Сохранить</button></form>
            </details>}
          </section>
          <section className="android-page android-settings-page" aria-label="Настройки приложения">
            <SettingsView alphabet={alphabet} onAlphabetChange={changeAlphabet} />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={resetTraining} aria-label="SerboTalk — к практике">
          <span className="brand__mark"><Icon name="message" size={28} /></span>
          <span className="brand__copy"><strong>Serbo<span>Talk</span></strong><small>Говори. Понимай. Будь ближе.</small></span>
        </button>
        <nav className="main-nav" aria-label="Основная навигация">
          <button className={view === "practice" ? "is-active" : ""} type="button" onClick={() => showView("practice")}><Icon name="home" />Практика</button>
          <button className={view === "statistics" ? "is-active" : ""} type="button" onClick={() => showView("statistics")}><Icon name="chart" />Статистика</button>
          <button className={view === "settings" ? "is-active" : ""} type="button" onClick={() => showView("settings")}><Icon name="settings" />Настройки</button>
          {account.role === "admin" && !Capacitor.isNativePlatform() && <button className={view === "admin" ? "is-active" : ""} type="button" onClick={() => showView("admin")}><Icon name="settings" />Пользователи</button>}
        </nav>
        <div className="profile">
          <div className={`connection connection--${backendState}`} role="status" aria-label={backendState === "online" ? "Backend готов" : backendState === "offline" ? "Backend недоступен" : "Подключение"}><span /></div>
          <span className="avatar">{account.display_name?.slice(0, 1).toLocaleUpperCase() || "A"}</span><span className="profile__copy"><strong>{account.display_name || account.email}</strong><small>{account.daily_usage.limit === null ? `${account.daily_usage.used} фраз · без лимита` : `${account.daily_usage.remaining} из ${account.daily_usage.limit} фраз осталось`}</small></span>
          <button className="sign-out-button" type="button" onClick={onSignOut}>Выйти</button>
          {account.role === "admin" && <button className="connection-settings-button" type="button" aria-label="Настроить подключение" onClick={() => setShowConnectionSettings((current) => !current)}><Icon name="settings" /></button>}
        </div>
      </header>

      {account.role === "admin" && showConnectionSettings && (
        <form className="connection-settings" onSubmit={saveConnectionSettings}>
          <label htmlFor="api-endpoint">Адрес общего backend</label>
          <input id="api-endpoint" value={apiEndpoint} onChange={(event) => setApiEndpoint(event.target.value)} placeholder="https://trainer.example.com" inputMode="url" />
          <button type="submit">Подключиться</button>
          <p>Эмулятор: http://10.0.2.2:8000. На телефоне укажите HTTPS-адрес или LAN-адрес компьютера с запущенным backend.</p>
        </form>
      )}

      {view === "admin" ? <AdminUsersView /> : view === "statistics" ? <StatisticsView alphabet={alphabet} /> : view === "settings" ? <SettingsView alphabet={alphabet} onAlphabetChange={changeAlphabet} /> : (
        <main className="workspace">
          <aside className="topics-panel panel">
            <div className="panel-heading"><h2>Темы для практики</h2><p>Выберите ситуацию и начните разговор на сербском языке</p></div>
            <button className={isReviewMode ? "review-topic is-selected" : "review-topic"} type="button" onClick={() => void startReviewTraining()}>
              <span className="topic__icon"><Icon name="repeat" /></span>
              <span className="topic__copy"><strong>Фразы для повторения</strong><small>{reviewPhraseCount ? `${reviewPhraseCount} требуют практики` : "Список пока пуст"}</small></span>
              <span className="review-topic__count">{reviewPhraseCount}</span>
            </button>
            <div className="topics" aria-label="Темы тренировки">
              {topics.map((topic) => (
                <button className={selectedTopic === topic.id && !customTopic ? "topic is-selected" : "topic"} key={topic.id} type="button" onClick={() => selectTopic(topic.id)}>
                  <span className={`topic__icon topic__icon--${topicIcons[topic.id] ?? "message"}`}><Icon name={topicIcons[topic.id] ?? "message"} /></span>
                  <span className="topic__copy"><strong>{topic.title_ru}</strong><small>{topic.description_ru}</small></span><span className="topic__unlearned"><strong>{topic.phrase_count}</strong><small>неизученных</small></span>
                </button>
              ))}
            </div>
            <details className="topic-action"><summary><Icon name="plus" /> Своя тема</summary><form className={customTopic ? "custom-topic is-selected" : "custom-topic"} onSubmit={saveCustomTopic}>
              <span className="topic__icon"><Icon name="plus" /></span><span className="custom-topic__copy"><strong>Своя тема</strong><small>Предложите свою ситуацию</small></span>
              <input value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} placeholder="Например: стоматолог" aria-label="Своя тема" />
              <button type="submit" disabled={loading || customTopic.trim().length < 2}>Создать пустую тему</button>
            </form></details>
            <details className="topic-action"><summary><Icon name="plus" /> Добавить фразу</summary><form className="add-phrase" onSubmit={saveReviewPhrase}>
              <div><span className="topic__icon"><Icon name="plus" /></span><span><strong>Добавить фразу</strong><small>Введите фразу на русском</small></span></div>
              <input value={newPhrase} onChange={(event) => { setNewPhrase(event.target.value); setPreparedPhrase(undefined); }} placeholder="Например: Я задержусь на десять минут" aria-label="Новая фраза для повторения" />
              {preparedPhrase && <div className="phrase-preparation" aria-label="Канонический перевод">
                <small>Канонический перевод</small><strong lang={alphabet === "cyrillic" ? "sr-Cyrl" : "sr-Latn"}>{displaySerbian(preparedPhrase.canonical_sr, alphabet)}</strong>
                <label>Тема<select aria-label="Тема для новой фразы" value={phraseTopicId} onChange={(event) => setPhraseTopicId(event.target.value)}>
                  <option value="">Выберите тему</option>
                  {topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.title_ru}</option>)}
                </select></label>
              </div>}
              <button type="submit" disabled={loading || newPhrase.trim().length < 3 || Boolean(preparedPhrase && !phraseTopicId)}>{preparedPhrase ? "Сохранить в тему" : "Создать перевод"}</button>
            </form></details>
            <div className="topics-panel__note"><Icon name="message" /><span>Каждый короткий разговор делает речь увереннее.</span></div>
          </aside>

          <section className="practice-stage" aria-label="Практика">
            {preparingPhrase && !session ? <PhraseLoading /> : sessionComplete ? (
              <div className="practice-done panel"><h1>{topicExhausted ? "Все фразы темы пройдены" : "Тренировка завершена"}</h1><p>{topicExhausted ? `${completedCount} фраз проверено. В этой теме пока нет следующих фраз.` : `${completedCount} из ${session?.requested_length ?? 10} фраз проверено.`}</p><button className="answer-submit" type="button" onClick={resetTraining}>Выбрать новую тему</button></div>
            ) : !session ? (
              <div className="welcome-card panel">
                <div className="welcome-card__glow"/><span className="welcome-card__icon"><Icon name={topicIcons[currentTopic?.id ?? ""] ?? "message"} size={32} /></span>
                <p className="kicker">Выбранная ситуация</p><h2>{customTopic.trim() || currentTopic?.title_ru || "Выберите тему"}</h2>
                <p>{selectedTopicData?.phrase_count === 0 ? "Тема пока пустая. Добавьте в неё фразы — автоматической генерации не будет." : currentTopic?.description_ru || "Темы загрузятся после подключения к backend."}</p>
                {backendState === "offline" && <button className="answer-submit" type="button" onClick={retryCatalog}>Повторить загрузку тем</button>}
                <div className="welcome-card__steps"><span><b>1</b> Получите фразу</span><span><b>2</b> Ответьте голосом</span><span><b>3</b> Разберите результат</span></div>
                {error && <p className="error" role="alert">{error}</p>}
              </div>
            ) : (
              <>
                <div className="practice-card panel">
                  <div className="card-title"><span><Icon name="message" /></span><h2>{isReviewMode ? "Карусель повторения" : "Основная фраза"}</h2><small>{isReviewMode ? `Фраза ${exerciseNumber}` : `${exerciseNumber} / ${session.requested_length}`}</small></div>
                  {!attempt && <div className="phrase-card__content"><span className="phrase-number">{String(exerciseNumber).padStart(2, "0")}</span><div><p className="kicker">Скажите по-сербски · нажмите на незнакомое слово</p>{renderPhrase()}</div></div>}
                  {!attempt ? (
                    <form onSubmit={checkAnswer}>
                      <div className="answer-input">
                        {hasTranscript ? <><label className="sr-only" htmlFor="serbian-answer">Ваш ответ</label><textarea id="serbian-answer" value={answer} readOnly={checking} onChange={(event) => { answerEditEpochRef.current += 1; voiceTimingRef.current = undefined; setAnswer(event.target.value); }} placeholder="Введите ответ на сербском языке" rows={4} /></> : <p className="voice-prompt">Произнесите ответ в микрофон. После распознавания текст можно исправить.</p>}
                        {voiceState === "connecting" || voiceState === "recording" || voiceState === "transcribing" ? <button className="mic-button is-active" type="button" aria-label={voiceState === "recording" ? "Завершить запись" : "Остановить запись"} disabled={checking || voiceState === "transcribing"} onClick={voiceState === "recording" ? finishVoice : stopVoice}><Icon name="mic" size={30} /></button> : <button className="mic-button" type="button" aria-label="Ответить голосом" disabled={checking || !voiceSupported} onClick={startVoice}><Icon name="mic" size={30} /></button>}
                      </div>
                      <div className="voice-status">{!voiceSupported ? "Микрофон недоступен. Разрешите доступ к нему в браузере или устройстве." : voiceState === "recording" ? "Идёт запись. Аудио не сохраняется" : voiceState === "transcribing" ? "Расшифровываем фразу…" : voiceState === "error" ? "Не удалось распознать ответ. Повторите запись." : hasTranscript ? "Введите ответ или исправьте распознанный текст." : "Нажмите на микрофон, чтобы ответить."}</div>
                      {!hasTranscript && (voiceState === "error" || !voiceSupported) && <button type="button" onClick={enterAnswerManually}>Ввести ответ вручную</button>}
                      {hasTranscript && <button className="answer-submit" type="submit" disabled={checking || voiceBusy || !answer.trim()}>{checking ? "Проверяем…" : "Проверить ответ"}<Icon name="arrow" /></button>}
                    </form>
                  ) : renderFeedback(false)}
                  {error && <p className="error" role="alert">{error}</p>}
                </div>
              </>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
