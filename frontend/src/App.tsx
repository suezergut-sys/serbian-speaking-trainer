import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

import { getApiBaseUrl, setApiBaseUrl } from "./api/baseUrl";
import { addReviewPhrase, BackendError, createTopic, fetchNextExercise, fetchReviewPhrases, fetchTopics, prepareReviewPhrase, revealWordHint, startTrainingSession, submitAttempt, transcribeAudio } from "./api/training";
import type { Attempt, AttemptTimings, Exercise, PreparedReviewPhrase, ReviewPhrase, TopicListItem, TrainingSession, WordHint } from "./types/training";
import { supportsVoiceRecording, VoiceRecorder } from "./voiceRecorder";
import { StatisticsView } from "./StatisticsView";
import { AdminUsersView } from "./AdminUsersView";
import { fetchCurrentUser } from "./api/users";
import { initializeAuth, isAuthConfigured, onAuthStateChange, signInWithGoogle, signOut } from "./auth";
import type { CurrentUser } from "./types/auth";
import { LegalPage } from "./LegalPage";
import "./styles.css";

type BackendState = "checking" | "online" | "offline";
type VoiceState = "idle" | "connecting" | "recording" | "transcribing" | "error";
type AppView = "practice" | "statistics" | "progress" | "admin";

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
    const syncAccount = async (sessionPresent: boolean) => {
      if (!active) return;
      setHasSession(sessionPresent);
      if (!sessionPresent) { setAccount(undefined); setAuthReady(true); return; }
      try { setAccount(await fetchCurrentUser()); setAuthError(undefined); }
      catch { setAuthError("Не удалось загрузить профиль. Проверьте настройку Supabase Auth на backend."); }
      finally { if (active) setAuthReady(true); }
    };
    initializeAuth().then((session) => syncAccount(Boolean(session))).catch(() => {
      if (active) { setAuthError("Не удалось восстановить вход."); setAuthReady(true); }
    });
    const unsubscribe = onAuthStateChange((session) => {
      window.setTimeout(() => { void syncAccount(Boolean(session)); }, 0);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  async function login() {
    setAuthError(undefined);
    try { await signInWithGoogle(); }
    catch { setAuthError("Не удалось открыть вход через Google."); }
  }

  if (!authReady) return <main className="auth-page"><div className="auth-card panel"><p>Проверяем вход…</p></div></main>;
  if (!isAuthConfigured()) return <main className="auth-page"><div className="auth-card panel"><h1>Нужна настройка входа</h1><p>Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в окружение frontend.</p></div></main>;
  if (!hasSession || !account) return <main className="auth-page"><div className="auth-card panel"><span className="brand__mark"><Icon name="message" size={34}/></span><h1>Добро пожаловать в SerboTalk</h1><p>Войдите или зарегистрируйтесь с Google, чтобы сохранять свой прогресс на всех устройствах.</p><button className="google-sign-in" type="button" onClick={() => void login()}>Войти через Google</button>{authError && <p className="error" role="alert">{authError}</p>}<nav className="auth-legal" aria-label="Правовая информация"><a href="/privacy">Конфиденциальность</a><a href="/terms">Условия</a></nav></div></main>;
  return <TrainerApp account={account} onAccountChange={setAccount} onSignOut={() => void signOut()} />;
}

function TrainerApp({ account, onAccountChange, onSignOut }: { account: CurrentUser; onAccountChange: (account: CurrentUser) => void; onSignOut: () => void }) {
  const [backendState, setBackendState] = useState<BackendState>("checking");
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState(getApiBaseUrl());
  const [view, setView] = useState<AppView>("practice");
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>();
  const [customTopic, setCustomTopic] = useState("");
  const [reviewPhrases, setReviewPhrases] = useState<ReviewPhrase[]>([]);
  const [newPhrase, setNewPhrase] = useState("");
  const [preparedPhrase, setPreparedPhrase] = useState<PreparedReviewPhrase>();
  const [phraseTopicId, setPhraseTopicId] = useState("");
  const [session, setSession] = useState<TrainingSession>();
  const [exercise, setExercise] = useState<Exercise>();
  const [exerciseNumber, setExerciseNumber] = useState(1);
  const [answer, setAnswer] = useState("");
  const [attempt, setAttempt] = useState<Attempt>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [wordHints, setWordHints] = useState<Record<string, WordHint>>({});
  const [activeHint, setActiveHint] = useState<string>();
  const voiceRef = useRef<VoiceRecorder | undefined>(undefined);
  const voiceTimingRef = useRef<AttemptTimings | undefined>(undefined);
  const androidPagerRef = useRef<HTMLDivElement | null>(null);
  const [androidPanel, setAndroidPanel] = useState(0);
  const voiceSupported = supportsVoiceRecording();
  const isNative = Capacitor.isNativePlatform();

  function showAndroidPanel(panel: number) {
    const pager = androidPagerRef.current;
    setAndroidPanel(panel);
    if (!pager) return;
    const left = panel * pager.clientWidth;
    if (typeof pager.scrollTo === "function") pager.scrollTo({ left, behavior: "smooth" });
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

  useEffect(() => {
    const controller = new AbortController();
    fetchTopics(controller.signal)
      .then((availableTopics) => {
        setTopics(availableTopics);
        setSelectedTopic((current) => current ?? availableTopics[0]?.id);
        setBackendState("online");
        void fetchReviewPhrases(controller.signal)
          .then(setReviewPhrases)
          .catch((requestError: unknown) => {
            if (requestError instanceof DOMException && requestError.name === "AbortError") return;
            setError("Не удалось загрузить фразы для повторения.");
          });
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setBackendState("offline");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => voiceRef.current?.stop(), []);
  const selectedTopicData = topics.find((topic) => topic.id === selectedTopic);
  const currentTopic = session?.topic ?? selectedTopicData;
  const isReviewMode = session?.topic.id === "review-phrases";

  function stopVoice() {
    if (voiceRef.current) { voiceRef.current.stop(); voiceRef.current = undefined; }
    voiceTimingRef.current = undefined;
    setVoiceState("idle");
  }

  async function finishVoice() {
    const recorder = voiceRef.current;
    if (!recorder || !exercise) return;
    setVoiceState("transcribing"); setError(undefined);
    try {
      const recording = await recorder.finish();
      voiceRef.current = undefined;
      voiceTimingRef.current = recording.timing;
      setAnswer((await transcribeAudio(exercise.id, recording.audio)).text);
      setVoiceState("idle");
    } catch {
      recorder.stop(); voiceRef.current = undefined; voiceTimingRef.current = undefined;
      setVoiceState("error"); setError("Не удалось расшифровать речь. Попробуйте записать короткую фразу ещё раз.");
    }
  }

  async function startVoice() {
    if (!exercise || !voiceSupported) return;
    stopVoice(); setAnswer(""); setError(undefined); setVoiceState("connecting");
    const recorder = new VoiceRecorder(); voiceRef.current = recorder;
    try { await recorder.start(); if (voiceRef.current === recorder) setVoiceState("recording"); }
    catch { recorder.stop(); if (voiceRef.current === recorder) voiceRef.current = undefined; setVoiceState("error"); setError("Не удалось получить доступ к микрофону. Проверьте разрешение браузера."); }
  }

  async function startTraining() {
    stopVoice(); setAnswer(""); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
    setLoading(true); setError(undefined);
    try {
      const started = await startTrainingSession(
        selectedTopic
              ? { topic_id: selectedTopic }
              : {},
      );
      setSession(started.session); setExercise(started.exercise); setExerciseNumber(1);
    } catch (requestError) {
      setSession(undefined); setExercise(undefined);
      setError(requestError instanceof BackendError && requestError.status === 409
        ? "В этой теме сейчас нет фраз для тренировки. Добавьте новую или дождитесь повторения."
        : "Не удалось начать тренировку. Проверьте, что backend запущен.");
    }
    finally { setLoading(false); }
  }

  async function startReviewTraining() {
    if (session) resetTraining();
    setSelectedTopic(undefined); setCustomTopic(""); setError(undefined);
    if (!reviewPhrases.length) {
      setError("Пока нет фраз для повторения. Добавьте фразу ниже или выполните обычную тренировку.");
      return;
    }
    setLoading(true);
    try {
      const started = await startTrainingSession({ review_mode: true });
      setSession(started.session); setExercise(started.exercise); setExerciseNumber(1);
      setAnswer(""); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
    } catch {
      setError("Не удалось запустить повторение фраз.");
    } finally { setLoading(false); }
  }

  async function nextExercise() {
    if (!session) return;
    stopVoice(); setLoading(true); setError(undefined);
    try { setExercise(await fetchNextExercise(session.id)); setExerciseNumber((current) => Math.min(current + 1, session.requested_length)); setAnswer(""); setAttempt(undefined); setWordHints({}); setActiveHint(undefined); }
    catch (requestError) {
      if (isReviewMode && requestError instanceof BackendError && requestError.status === 409) {
        setSession(undefined); setExercise(undefined); setReviewPhrases([]);
        setAnswer(""); setAttempt(undefined); setWordHints({}); setActiveHint(undefined);
        setError("Все фразы из карусели освоены. Отличная работа!");
      } else setError("Не удалось получить следующую фразу.");
    }
    finally { setLoading(false); }
  }

  async function checkAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exercise || !answer.trim()) return;
    setLoading(true); setError(undefined); setActiveHint(undefined); if (voiceRef.current) stopVoice();
    try {
      setAttempt(await submitAttempt(exercise.id, answer.trim(), voiceTimingRef.current, Object.keys(wordHints)));
      setReviewPhrases(await fetchReviewPhrases());
      onAccountChange(await fetchCurrentUser());
    }
    catch (requestError) { setError(requestError instanceof BackendError && requestError.status === 429 ? "Дневной лимит 10 фраз исчерпан. Новые фразы будут доступны после 00:00 UTC." : "Не удалось проверить ответ. Попробуйте ещё раз."); }
    finally { setLoading(false); }
  }

  function resetTraining() {
    stopVoice(); setView("practice"); setSession(undefined); setExercise(undefined); setExerciseNumber(1);
    setAnswer(""); setAttempt(undefined); setError(undefined); setWordHints({}); setActiveHint(undefined);
  }

  function selectTopic(topicId: string) {
    if (session) resetTraining();
    setSelectedTopic(topicId); setCustomTopic("");
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
        const created = await addReviewPhrase(preparedPhrase, phraseTopicId);
        setReviewPhrases((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setTopics(await fetchTopics());
        setNewPhrase(""); setPreparedPhrase(undefined); setPhraseTopicId("");
      }
    } catch { setError(preparedPhrase ? "Не удалось сохранить фразу." : "Не удалось создать канонический перевод. Проверьте настройки OpenAI."); }
    finally { setLoading(false); }
  }

  async function showWordHint(word: string) {
    if (!exercise) return;
    const normalized = word.toLocaleLowerCase("ru-RU");
    setActiveHint(normalized);
    if (wordHints[normalized]) return;
    const prepared = exercise.word_hints?.find((hint) => hint.word_ru.toLocaleLowerCase("ru-RU") === normalized);
    if (prepared) {
      setWordHints((current) => ({ ...current, [normalized]: { ...prepared, is_learning: true } }));
      void revealWordHint(exercise.id, word).catch(() => {
        setError(`Перевод слова «${word}» показан, но его не удалось добавить в неизученные.`);
      });
      return;
    }
    try {
      const hint = await revealWordHint(exercise.id, word);
      setWordHints((current) => ({ ...current, [normalized]: hint }));
    } catch { setError(`Для слова «${word}» перевод пока недоступен.`); }
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
          </nav>
        </header>

        <div
          className="android-pager"
          ref={androidPagerRef}
          onScroll={(event) => {
            const width = event.currentTarget.clientWidth;
            if (width) setAndroidPanel(Math.round(event.currentTarget.scrollLeft / width));
          }}
        >
          <section className="android-page android-topics-page" aria-label="Выбор темы">
            <h1>Темы</h1>
            <div className="android-topic-list" aria-label="Темы тренировки">
              <button className={isReviewMode ? "android-topic is-selected" : "android-topic"} type="button" disabled={loading || reviewPhrases.length === 0} onClick={() => { showAndroidPanel(1); void startReviewTraining(); }}>
                <span className="topic__icon"><Icon name="progress" /></span>
                <strong>Повторение</strong>
                <small>{reviewPhrases.length}</small>
              </button>
              {topics.map((topic) => (
                <button className={selectedTopic === topic.id && !customTopic ? "android-topic is-selected" : "android-topic"} key={topic.id} type="button" onClick={() => { selectTopic(topic.id); showAndroidPanel(1); }}>
                  <span className={`topic__icon topic__icon--${topicIcons[topic.id] ?? "message"}`}><Icon name={topicIcons[topic.id] ?? "message"} /></span>
                  <strong>{topic.title_ru}</strong>
                  <small>{topic.phrase_count}</small>
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
                  <strong>{preparedPhrase.canonical_sr}</strong>
                  <select aria-label="Тема для новой фразы" value={phraseTopicId} onChange={(event) => setPhraseTopicId(event.target.value)}>
                    <option value="">Выберите тему</option>
                    {topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.title_ru}</option>)}
                  </select>
                </div>}
                <button type="submit" disabled={loading || newPhrase.trim().length < 3 || Boolean(preparedPhrase && !phraseTopicId)}>{preparedPhrase ? "Сохранить" : "Перевести"}</button>
              </form>
            </details>
            {backendState === "offline" && <p className="android-error" role="alert">Нет подключения к сервису.</p>}
          </section>

          <section className="android-page android-training-page" aria-label="Тренировка">
            {!session ? (
              <div className="android-training-start">
                <span className="topic__icon"><Icon name={topicIcons[currentTopic?.id ?? ""] ?? "message"} size={26} /></span>
                <h1>{customTopic.trim() || currentTopic?.title_ru || "Выберите тему"}</h1>
                <button type="button" disabled={loading || backendState !== "online" || !selectedTopic || selectedTopicData?.phrase_count === 0} onClick={startTraining}>{loading ? "Загрузка…" : "Начать"}</button>
              </div>
            ) : (
              <div className="android-training-content">
                <div className="android-training-meta"><span>{currentTopic?.title_ru}</span><small>{exerciseNumber}/{session.requested_length}</small></div>
                <h1 className="interactive-phrase" aria-label={exercise?.source_ru ?? "Готовим фразу…"}>{exercise ? exercise.source_ru.split(/([А-Яа-яЁё]+)/g).filter(Boolean).map((part, index) => /^[А-Яа-яЁё]+$/.test(part) ? <span className="word-wrap" key={`${part}-${index}`}><button className={wordHints[part.toLocaleLowerCase("ru-RU")] ? "word-token is-used" : "word-token"} type="button" onClick={() => showWordHint(part)}>{part}</button>{activeHint === part.toLocaleLowerCase("ru-RU") && <span className="word-tooltip" role="status">{wordHints[part.toLocaleLowerCase("ru-RU")]?.translation_sr ?? "Загружаем…"}</span>}</span> : <span key={`${part}-${index}`}>{part}</span>) : "Готовим фразу…"}</h1>

                {!attempt ? <form className="android-answer" onSubmit={checkAnswer}>
                  <label className="sr-only" htmlFor="android-serbian-answer">Ваш ответ</label>
                  <textarea id="android-serbian-answer" value={answer} onChange={(event) => { if (voiceRef.current) stopVoice(); voiceTimingRef.current = undefined; setAnswer(event.target.value); }} placeholder="Ответ на сербском" rows={3} />
                  {voiceState === "connecting" || voiceState === "recording" || voiceState === "transcribing" ? <button className="mic-button is-active" type="button" aria-label={voiceState === "recording" ? "Завершить запись" : "Остановить запись"} disabled={voiceState === "transcribing"} onClick={voiceState === "recording" ? finishVoice : stopVoice}><Icon name="mic" size={34} /></button> : <button className="mic-button" type="button" aria-label="Ответить голосом" disabled={!voiceSupported} onClick={startVoice}><Icon name="mic" size={34} /></button>}
                  {voiceState !== "idle" && <p className="android-voice-state" role="status">{voiceState === "connecting" ? "Подключаем микрофон…" : voiceState === "recording" ? "Запись" : voiceState === "transcribing" ? "Распознаём…" : "Повторите запись"}</p>}
                  <button className="android-primary" type="submit" disabled={loading || !answer.trim()}>{loading ? "Проверяем…" : "Проверить"}</button>
                </form> : <div className={`android-feedback feedback--${attempt.analysis.verdict}`}>
                  <div className="feedback__score"><span>{Math.round(attempt.overall_score * 100)}%</span><strong>{attempt.analysis.verdict === "correct" ? "Верно" : attempt.analysis.verdict === "mostly_correct" ? "Почти верно" : "Попробуйте ещё"}</strong></div>
                  <p>{attempt.analysis.short_feedback_ru}</p>
                  <div className="correction"><small>Правильный вариант</small><span>{attempt.analysis.corrected_sr}</span></div>
                  <details><summary>Разбор</summary><p>{attempt.analysis.detailed_feedback_ru}</p></details>
                  <button className="android-primary" type="button" disabled={loading} onClick={nextExercise}>{loading ? "Загрузка…" : "Следующая"}</button>
                </div>}
                {error && <p className="android-error" role="alert">{error}</p>}
              </div>
            )}
          </section>

          <section className="android-page android-statistics-page" aria-label="Статистика">
            <StatisticsView />
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
          <button className={view === "practice" ? "is-active" : ""} type="button" onClick={() => setView("practice")}><Icon name="home" />Практика</button>
          <button className={view === "statistics" ? "is-active" : ""} type="button" onClick={() => setView("statistics")}><Icon name="chart" />Статистика</button>
          <button className={view === "progress" ? "is-active" : ""} type="button" onClick={() => setView("progress")}><Icon name="progress" />Прогресс</button>
          {account.role === "admin" && !Capacitor.isNativePlatform() && <button className={view === "admin" ? "is-active" : ""} type="button" onClick={() => setView("admin")}><Icon name="settings" />Пользователи</button>}
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

      {view === "admin" ? <AdminUsersView /> : view === "statistics" ? <StatisticsView /> : view === "progress" ? (
        <main className="placeholder-page">
          <div className="placeholder-page__icon"><Icon name="progress" size={34} /></div>
          <p className="kicker">Раздел в разработке</p><h1>Прогресс</h1>
          <p>Здесь появятся данные ваших тренировок. Сейчас можно продолжать практику — ответы уже учитываются системой обучения.</p>
          <button type="button" onClick={() => setView("practice")}>Вернуться к практике <Icon name="arrow" /></button>
        </main>
      ) : (
        <main className="workspace">
          <aside className="topics-panel panel">
            <div className="panel-heading"><h2>Темы для практики</h2><p>Выберите ситуацию и начните разговор на сербском языке</p></div>
            <button className={isReviewMode ? "review-topic is-selected" : "review-topic"} type="button" disabled={loading} onClick={() => void startReviewTraining()}>
              <span className="topic__icon"><Icon name="progress" /></span>
              <span className="topic__copy"><strong>Фразы для повторения</strong><small>{reviewPhrases.length ? `${reviewPhrases.length} требуют практики` : "Список пока пуст"}</small></span>
              <span className="review-topic__count">{reviewPhrases.length}</span>
            </button>
            <div className="topics" aria-label="Темы тренировки">
              {topics.map((topic) => (
                <button className={selectedTopic === topic.id && !customTopic ? "topic is-selected" : "topic"} key={topic.id} type="button" onClick={() => selectTopic(topic.id)}>
                  <span className={`topic__icon topic__icon--${topicIcons[topic.id] ?? "message"}`}><Icon name={topicIcons[topic.id] ?? "message"} /></span>
                  <span className="topic__copy"><strong>{topic.title_ru}</strong><small>{topic.description_ru}</small></span><span className="topic__arrow">›</span>
                </button>
              ))}
            </div>
            <form className={customTopic ? "custom-topic is-selected" : "custom-topic"} onSubmit={saveCustomTopic}>
              <span className="topic__icon"><Icon name="plus" /></span><span className="custom-topic__copy"><strong>Своя тема</strong><small>Предложите свою ситуацию</small></span>
              <input value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} placeholder="Например: стоматолог" aria-label="Своя тема" />
              <button type="submit" disabled={loading || customTopic.trim().length < 2}>Создать пустую тему</button>
            </form>
            <form className="add-phrase" onSubmit={saveReviewPhrase}>
              <div><span className="topic__icon"><Icon name="plus" /></span><span><strong>Добавить фразу</strong><small>Введите фразу на русском</small></span></div>
              <input value={newPhrase} onChange={(event) => { setNewPhrase(event.target.value); setPreparedPhrase(undefined); }} placeholder="Например: Я задержусь на десять минут" aria-label="Новая фраза для повторения" />
              {preparedPhrase && <div className="phrase-preparation" aria-label="Канонический перевод">
                <small>Канонический перевод</small><strong>{preparedPhrase.canonical_sr}</strong>
                <label>Тема<select aria-label="Тема для новой фразы" value={phraseTopicId} onChange={(event) => setPhraseTopicId(event.target.value)}>
                  <option value="">Выберите тему</option>
                  {topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.title_ru}</option>)}
                </select></label>
              </div>}
              <button type="submit" disabled={loading || newPhrase.trim().length < 3 || Boolean(preparedPhrase && !phraseTopicId)}>{preparedPhrase ? "Сохранить в тему" : "Создать перевод"}</button>
            </form>
            <div className="topics-panel__note"><Icon name="message" /><span>Каждый короткий разговор делает речь увереннее.</span></div>
          </aside>

          <section className="practice-stage" aria-labelledby="page-title">
            <div className="stage-heading"><p>Сербский язык · A2</p><h1 id="page-title">Практикуйтесь в реальных ситуациях</h1><span>Формулируйте ответ на сербском и получайте понятную обратную связь.</span></div>
            {!session ? (
              <div className="welcome-card panel">
                <div className="welcome-card__glow"/><span className="welcome-card__icon"><Icon name={topicIcons[currentTopic?.id ?? ""] ?? "message"} size={32} /></span>
                <p className="kicker">Выбранная ситуация</p><h2>{customTopic.trim() || currentTopic?.title_ru || "Выберите тему"}</h2>
                <p>{selectedTopicData?.phrase_count === 0 ? "Тема пока пустая. Добавьте в неё фразы — автоматической генерации не будет." : currentTopic?.description_ru || "Темы загрузятся после подключения к backend."}</p>
                <div className="welcome-card__steps"><span><b>1</b> Получите фразу</span><span><b>2</b> Ответьте голосом или текстом</span><span><b>3</b> Разберите результат</span></div>
                {error && <p className="error" role="alert">{error}</p>}
                <button className="primary" type="button" disabled={loading || backendState !== "online" || !selectedTopic || selectedTopicData?.phrase_count === 0} onClick={startTraining}>{selectedTopicData?.phrase_count === 0 ? "Сначала добавьте фразу" : loading ? "Готовим первую фразу…" : "Начать тренировку"}<Icon name="arrow" /></button>
              </div>
            ) : (
              <>
                <div className="phrase-card panel">
                  <div className="card-title"><span><Icon name="message" /></span><h2>{isReviewMode ? "Карусель повторения" : "Основная фраза"}</h2><small>{isReviewMode ? `Фраза ${exerciseNumber}` : `${exerciseNumber} / ${session.requested_length}`}</small></div>
                  <div className="phrase-card__content"><span className="phrase-number">{String(exerciseNumber).padStart(2, "0")}</span><div><p className="kicker">Скажите по-сербски · нажмите на незнакомое слово</p><h3 id="exercise-title" className="interactive-phrase" aria-label={exercise?.source_ru ?? "Готовим фразу…"}>{exercise ? exercise.source_ru.split(/([А-Яа-яЁё]+)/g).filter(Boolean).map((part, index) => /^[А-Яа-яЁё]+$/.test(part) ? <span className="word-wrap" key={`${part}-${index}`}><button className={wordHints[part.toLocaleLowerCase("ru-RU")] ? "word-token is-used" : "word-token"} type="button" onClick={() => showWordHint(part)}>{part}</button>{activeHint === part.toLocaleLowerCase("ru-RU") && <span className="word-tooltip" role="status">{wordHints[part.toLocaleLowerCase("ru-RU")]?.translation_sr ?? "Загружаем…"}<small>Подсказка учтена · −8 баллов</small></span>}</span> : <span key={`${part}-${index}`}>{part}</span>) : "Готовим фразу…"}</h3></div></div>
                  {exercise && <div className="skills" aria-label="Целевые навыки">{exercise.targeted_skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}
                </div>
                <div className="answer-card panel">
                  <div className="card-title"><span><Icon name="pencil" /></span><h2>Ваш ответ</h2>{!attempt && <small className="live-dot">Говорите на сербском</small>}</div>
                  {!attempt ? (
                    <form onSubmit={checkAnswer}>
                      <label className="sr-only" htmlFor="serbian-answer">Ваш ответ</label>
                      <div className="answer-input">
                        <textarea id="serbian-answer" value={answer} onChange={(event) => { if (voiceRef.current) stopVoice(); voiceTimingRef.current = undefined; setAnswer(event.target.value); }} placeholder="Введите или произнесите свой ответ…" rows={4} autoFocus />
                        {voiceState === "connecting" || voiceState === "recording" || voiceState === "transcribing" ? <button className="mic-button is-active" type="button" aria-label={voiceState === "recording" ? "Завершить запись" : "Остановить запись"} disabled={voiceState === "transcribing"} onClick={voiceState === "recording" ? finishVoice : stopVoice}><Icon name="mic" size={30} /></button> : <button className="mic-button" type="button" aria-label="Ответить голосом" disabled={!voiceSupported} onClick={startVoice}><Icon name="mic" size={30} /></button>}
                      </div>
                      <div className="voice-status">{!voiceSupported ? "Микрофон недоступен — используйте текст" : voiceState === "recording" ? "Идёт запись. Аудио не сохраняется" : voiceState === "transcribing" ? "Расшифровываем фразу…" : voiceState === "error" ? "Можно повторить или ввести ответ вручную" : "Микрофон или клавиатура — как вам удобнее"}</div>
                      <div className="encouragement"><span><Icon name="bulb" /> Не бойтесь делать ошибки</span><span><Icon name="check" /> Говорите естественно</span></div>
                      <button className="answer-submit" type="submit" disabled={loading || !answer.trim()}>{loading ? "Анализируем…" : "Проверить ответ"}<Icon name="arrow" /></button>
                    </form>
                  ) : (
                    <div className="submitted-answer"><small>Ваш вариант</small><p>{answer}</p><span><Icon name="arrow" /> Подробный разбор показан справа</span></div>
                  )}
                </div>
                {error && <p className="error" role="alert">{error}</p>}
              </>
            )}
          </section>

          <aside className={attempt ? "info-panel result-panel panel" : "info-panel result-panel result-panel--empty panel"}>
            <div className="panel-heading panel-heading--icon"><Icon name={attempt ? "check" : "progress"} /><div><h2>Анализ ответа</h2><p>{attempt ? "Результат текущей попытки" : "Появится после проверки"}</p></div></div>
            {attempt ? <div className={`feedback feedback--${attempt.analysis.verdict}`}>
              <div className="feedback__score"><span>{Math.round(attempt.overall_score * 100)}%</span><strong>{attempt.analysis.verdict === "correct" ? "Верно" : attempt.analysis.verdict === "mostly_correct" ? "Почти верно" : "Нужно доработать"}</strong></div>
              {attempt.hint_penalty > 0 && <div className="hint-penalty"><Icon name="bulb" /><span>Подсказки: −{Math.round(attempt.hint_penalty * 100)} баллов</span></div>}
              <p>{attempt.analysis.short_feedback_ru}</p><div className="correction"><small>Канонический вариант</small><span>{attempt.analysis.corrected_sr}</span></div>
              {(attempt.learner_updates?.length ?? 0) > 0 && <div className="mastery-list" aria-label="Прогресс навыков">{attempt.learner_updates?.map((skill) => <div key={skill.skill_key}><span>{skill.title_ru}</span><div><i style={{ width: `${Math.round(skill.mastery * 100)}%` }}/></div><b>{Math.round(skill.mastery * 100)}%</b></div>)}</div>}
              <details><summary>Подробный разбор</summary><p>{attempt.analysis.detailed_feedback_ru}</p><div className="score-grid"><span>Смысл <b>{Math.round(attempt.analysis.semantic_score * 100)}</b></span><span>Грамматика <b>{Math.round(attempt.analysis.grammar_score * 100)}</b></span><span>Лексика <b>{Math.round(attempt.analysis.lexical_score * 100)}</b></span><span>Естественность <b>{Math.round(attempt.analysis.naturalness_score * 100)}</b></span></div>{attempt.analysis.issues.map((issue, index) => <p className="issue" key={`${issue.skill_key}-${issue.type}-${index}`}><b>{issue.skill_key}</b>: {issue.evidence}{issue.correction ? ` → ${issue.correction}` : ""}</p>)}</details>
              <button className="answer-submit" type="button" disabled={loading} onClick={nextExercise}>{loading ? "Готовим…" : "Следующая фраза"}<Icon name="arrow" /></button>
            </div> : <div className="result-empty"><span><Icon name="chart" size={30} /></span><p>Ответьте на фразу — здесь появятся оценка, исправление и прогресс навыков.</p></div>}
          </aside>
        </main>
      )}
    </div>
  );
}
