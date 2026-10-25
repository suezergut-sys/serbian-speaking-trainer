import { useState } from "react";
import { CustomContentForm } from "./CustomContentForm";
import { CustomContentManager } from "./CustomContentManager";
import { t } from "./i18n";
import type { SerbianAlphabet } from "./serbianScript";
import type { TopicListItem } from "./types/training";
import { PremiumBadge } from "./PremiumBadge";
import twoCoffees from "./assets/premium/two-coffees.webp";

export function PremiumView({ active, topics, alphabet, onTopicCreated, onChanged, onDeleted }: {
  active: boolean; topics: TopicListItem[]; alphabet: SerbianAlphabet;
  onTopicCreated: (topic: TopicListItem) => void; onChanged: () => void;
  onDeleted: (topicId?: string) => void;
}) {
  const [mode, setMode] = useState<"topic" | "phrase">();
  const [catalogVersion, setCatalogVersion] = useState(0);
  return <section className="premium-page" aria-label={t("Премиум")}>
    {!active ? <div className="premium-offer panel">
      <header className="premium-offer__hero"><PremiumBadge /><h1>{t("Премиум")}</h1></header>
      <ul>
        <li>{t("100 повторений в день")}</li>
        <li>{t("До 5 личных тем")}</li>
        <li>{t("До 30 фраз в каждой теме — 150 своих фраз всего")}</li>
      </ul>
      <button type="button" disabled>{t("КУПИТЬ")}</button>
      <p className="premium-offer__price">{t("Однократный платёж 5 евро")}</p>
      <img className="premium-offer__coffee" src={twoCoffees} alt={t("Две чашки кофе")} width="768" height="512" />
      <footer className="premium-offer__why"><h2>{t("Почему платно?")}</h2><p>{t("Приложение использует API-вызовы внешней модели OpenAI.")}</p></footer>
    </div> : <>
      <h1>{t("ПРЕМИУМ")}</h1>
      <div className="premium-actions">
        <button type="button" aria-pressed={mode === "topic"} onClick={() => setMode("topic")}>{t("Создать тему")}</button>
        <button type="button" aria-pressed={mode === "phrase"} onClick={() => setMode("phrase")}>{t("Создать фразу")}</button>
      </div>
      {mode && <CustomContentForm key={mode} mode={mode} topics={topics} alphabet={alphabet} onClose={() => setMode(undefined)} onCreateTopic={() => setMode("topic")}
        onTopicCreated={onTopicCreated} onPhraseSaved={() => { onChanged(); setCatalogVersion(value => value + 1); }} />}
      <CustomContentManager key={catalogVersion} browseTopics topics={topics} alphabet={alphabet} onClose={() => undefined} onDeleted={onDeleted} />
    </>}
  </section>;
}
