import { useEffect, useRef, useState } from "react";
import { deleteCustomPhrase, deleteCustomTopic, fetchCustomPhrases } from "./api/training";
import { t, topicText } from "./i18n";
import { displaySerbian, type SerbianAlphabet } from "./serbianScript";
import type { ReviewPhrase, TopicListItem } from "./types/training";

export function CustomContentManager({ topics, alphabet, onDeleted, onClose, browseTopics = false }: {
  topics: TopicListItem[]; alphabet: SerbianAlphabet;
  onDeleted: (topicId?: string) => void; onClose: () => void;
  browseTopics?: boolean;
}) {
  const [phrases, setPhrases] = useState<ReviewPhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ kind: "topic" | "phrase"; id: string; title: string }>();
  const [message, setMessage] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string>();
  const confirmationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmation) {
      confirmationRef.current?.focus();
      confirmationRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [confirmation]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomPhrases(controller.signal).then(result => { if (!controller.signal.aborted) setPhrases(result); })
      .catch(() => { if (!controller.signal.aborted) setError("Не удалось загрузить свои фразы."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  async function remove() {
    if (!confirmation || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (confirmation.kind === "topic") {
        await deleteCustomTopic(confirmation.id);
        setPhrases(current => current.filter(phrase => phrase.topic_id !== confirmation.id));
        onDeleted(confirmation.id);
      } else {
        await deleteCustomPhrase(confirmation.id);
        setPhrases(current => current.filter(phrase => phrase.id !== confirmation.id));
        onDeleted();
      }
      setMessage(confirmation.kind === "topic" ? "Тема и все её фразы удалены." : "Фраза удалена.");
      setConfirmation(undefined);
    } catch {
      setError("Не удалось удалить. Повторите попытку.");
    } finally { setBusy(false); }
  }

  return <section className="custom-content-form custom-content-manager" aria-label={t("Свои темы и фразы")}>
    <h3>{t("Свои темы и фразы")}</h3>
    {!browseTopics && <button type="button" disabled={busy} onClick={onClose}>{t("Закрыть")}</button>}
    <p>{t("До 5 своих тем, до 30 фраз в каждой. Всего до 150 фраз.")}</p>
    <p>{t("Удаление темы удалит все её фразы из обучения и повторения. История выполненных попыток останется в статистике.")}</p>
    {loading && <p role="status">{t("Загружаем свои фразы…")}</p>}
    {error && <div role="alert"><p>{t(error)}</p>{!confirmation && <button type="button" disabled={busy} onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }}>{t("Повторить загрузку")}</button>}</div>}
    {message && <p role="status">{t(message)}</p>}
    {confirmation && <div ref={confirmationRef} tabIndex={-1} className="custom-content-confirmation" role="group" aria-label={t("Подтверждение удаления")}>
      <p>{t(confirmation.kind === "topic" ? "Удалить тему и все её фразы?" : "Удалить свою фразу?")}</p>
      <strong>{confirmation.title}</strong>
      <button type="button" disabled={busy} onClick={() => void remove()}>{t(busy ? "Удаляем…" : "Подтвердить удаление")}</button>
      <button type="button" disabled={busy} onClick={() => { setConfirmation(undefined); setError(""); }}>{t("Отмена")}</button>
    </div>}
    {topics.filter(topic => topic.is_custom).map(topic => <div className="custom-content-item" key={topic.id}>
      {browseTopics ? <button className="premium-topic" type="button" aria-pressed={selectedTopic === topic.id} disabled={busy || Boolean(confirmation)} onClick={() => { setSelectedTopic(topic.id); setMessage(""); }}>
        <strong>{topicText(topic.id, topic.title_ru)}</strong>
        <span>{t("Фраз: ")}{loading ? topic.custom_phrase_count ?? 0 : phrases.filter(phrase => phrase.topic_id === topic.id).length}</span>
      </button> : <><strong>{topicText(topic.id, topic.title_ru)}</strong><span>{topic.custom_phrase_count ?? phrases.filter(phrase => phrase.topic_id === topic.id).length} / 30</span></>}
      <button type="button" disabled={busy || Boolean(confirmation)} onClick={() => setConfirmation({ kind: "topic", id: topic.id, title: topic.title_ru })}>{t("Удалить тему")}</button>
    </div>)}
    {!loading && phrases.length === 0 && <p>{t("Своих фраз пока нет.")}</p>}
    {browseTopics && !selectedTopic && phrases.length > 0 && <p>{t("Выберите тему, чтобы увидеть фразы.")}</p>}
    {browseTopics && selectedTopic && !loading && !phrases.some(phrase => phrase.topic_id === selectedTopic) && <p>{t("В этой теме пока нет своих фраз.")}</p>}
    {phrases.filter(phrase => !browseTopics || phrase.topic_id === selectedTopic).map(phrase => <div className="custom-content-item" key={phrase.id}>
      <strong>{phrase.source_ru}</strong>
      {!browseTopics && <><span>{displaySerbian(phrase.canonical_sr, alphabet)}</span><small>{topicText(phrase.topic_id, phrase.topic_title ?? "")}</small></>}
      <button type="button" disabled={busy || Boolean(confirmation)} onClick={() => setConfirmation({ kind: "phrase", id: phrase.id, title: phrase.source_ru })}>{t("Удалить фразу")}</button>
    </div>)}
  </section>;
}
