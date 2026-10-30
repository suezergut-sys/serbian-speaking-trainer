import { useState } from "react";
import { addReviewPhrase, createTopic, prepareReviewPhrase } from "./api/training";
import { t, topicText } from "./i18n";
import { displaySerbian, type SerbianAlphabet } from "./serbianScript";
import type { PreparedReviewPhrase, TopicListItem } from "./types/training";
import { customContentError, phraseLimitMessage, topicLimitMessage } from "./customContentErrors";
import { sortedPersonalTopics } from "./personalTopics";

export function CustomContentForm({ mode, topics, selectedTopic, alphabet, onTopicCreated, onPhraseSaved, onClose, onManage, onCreateTopic }: {
  mode: "topic" | "phrase"; topics: TopicListItem[]; selectedTopic?: string; alphabet: SerbianAlphabet;
  onTopicCreated: (topic: TopicListItem) => void; onPhraseSaved: () => void; onClose: () => void;
  onManage?: () => void; onCreateTopic?: () => void;
}) {
  const ownTopics = sortedPersonalTopics(topics);
  const [text, setText] = useState("");
  const [topicId, setTopicId] = useState(ownTopics.find(topic => topic.id === selectedTopic)?.id ?? ownTopics[0]?.id ?? "");
  const [prepared, setPrepared] = useState<PreparedReviewPhrase>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const clean = text.trim().replace(/\s+/g, " ");

  const words = clean ? clean.split(/\s+/).length : 0;
  const selected = ownTopics.find(topic => topic.id === topicId);
  const limitMessage = mode === "topic" ? ownTopics.length >= 5 ? topicLimitMessage : "" : (selected?.custom_phrase_count ?? 0) >= 30 ? phraseLimitMessage : "";
  const blocked = Boolean(limitMessage) || (mode === "phrase" && (words > 15 || !selected));

  async function submit() {
    if (busy || blocked || clean.length < (mode === "topic" ? 2 : 3)) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      if (mode === "topic") {
        onTopicCreated(await createTopic(clean));
        setText(""); setSaved(true);
      } else if (!prepared) {
        setPrepared(await prepareReviewPhrase(clean));
      } else {
        await addReviewPhrase(prepared, topicId);
        onPhraseSaved();
        setText(""); setPrepared(undefined); setSaved(true);
      }
    } catch (failure) {
      setError(customContentError(failure, mode === "topic" ? "Не удалось сохранить тему. Повторите попытку." : prepared ? "Не удалось сохранить фразу. Повторите попытку." : "Не удалось подготовить перевод. Повторите попытку."));
    } finally { setBusy(false); }
  }

  return <form className="custom-content-form" aria-label={t(mode === "topic" ? "Добавить тему" : "Добавить фразу")} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <label>{t(mode === "topic" ? "Название темы" : "Фраза на русском языке")}
      <input value={text} minLength={mode === "topic" ? 2 : 3} maxLength={mode === "topic" ? 160 : 240} required disabled={busy} onChange={event => { setText(event.target.value); setPrepared(undefined); setSaved(false); setError(""); }} />
    </label>
    {mode === "topic" ? <><p>{t("Тема пока пустая. Добавьте в неё фразы — автоматической генерации не будет.")}</p><p>{t("Название автоматически переводится на русский и английский.")}</p><p>{t("Свои темы: ")}{ownTopics.length} / 5</p></> : <>
      <p>{t("Слов: ")}{words} / 15</p>
      {words > 15 && <p role="alert">{t("Фраза должна содержать не более 15 слов.")}</p>}
      <p>{t("Канонический перевод формирует модель. Редактирование перевода недоступно.")}</p>
      <p>{t("Повторное добавление той же фразы не меняет её перевод и прогресс.")}</p>
      {ownTopics.length === 0 ? <p role="status">{t("Сначала создайте свою тему для фраз.")}</p> : <label>{t("Тема для фразы")}<select value={topicId} required disabled={busy} onChange={event => setTopicId(event.target.value)}>
        {ownTopics.map(topic => <option key={topic.id} value={topic.id}>{topicText(topic.id, topic.title_ru, topic.title_en)}</option>)}
      </select><span>{t("Своих фраз в теме: ")}{selected?.custom_phrase_count ?? 0} / 30</span></label>}
      {prepared && <>
        {prepared.source_versions && <div className="custom-content-translation">
          <p lang="ru"><strong>{t("Русская версия")}: </strong>{prepared.source_versions.ru}</p>
          <p lang="en"><strong>{t("Английская версия")}: </strong>{prepared.source_versions.en}</p>
        </div>}
        <p className="custom-content-translation" role="status">{displaySerbian(prepared.canonical_sr, alphabet)}</p>
        <button type="button" disabled={busy} onClick={() => { setPrepared(undefined); setError(""); }}>{t("Подготовить перевод заново")}</button>
      </>}
    </>}
    {limitMessage && <p role="alert">{t(limitMessage)}</p>}
    {error && <p role="alert">{t(error)}</p>}
    {saved && <p role="status">{t(mode === "topic" ? "Тема сохранена." : "Фраза сохранена.")}</p>}
    <button type="submit" disabled={busy || blocked || clean.length < (mode === "topic" ? 2 : 3)}>{t(busy ? mode === "topic" ? "Переводим название…" : (mode === "phrase" && !prepared ? "Готовим перевод…" : "Сохраняем…") : mode === "topic" ? "Сохранить тему" : prepared ? "Сохранить фразу" : "Подготовить перевод")}</button>
    {mode === "phrase" && ownTopics.length === 0 && onCreateTopic && <button type="button" disabled={busy} onClick={onCreateTopic}>{t("Создать свою тему")}</button>}
    {onManage && <button type="button" disabled={busy} onClick={onManage}>{t("Удалить свои фразы или темы")}</button>}
    <button type="button" disabled={busy} onClick={onClose}>{t("Закрыть")}</button>
  </form>;
}
