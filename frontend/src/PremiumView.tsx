import { useState } from "react";
import { CustomContentForm } from "./CustomContentForm";
import { CustomContentManager } from "./CustomContentManager";
import { t } from "./i18n";
import type { SerbianAlphabet } from "./serbianScript";
import type { TopicListItem } from "./types/training";

export function PremiumView({ active, topics, alphabet, onTopicCreated, onChanged, onDeleted }: {
  active: boolean; topics: TopicListItem[]; alphabet: SerbianAlphabet;
  onTopicCreated: (topic: TopicListItem) => void; onChanged: () => void;
  onDeleted: (topicId?: string) => void;
}) {
  const [mode, setMode] = useState<"topic" | "phrase">();
  const [catalogVersion, setCatalogVersion] = useState(0);
  return <section className="premium-page" aria-label={t("Премиум")}>
    <h1>{t("ПРЕМИУМ")}</h1>
    {!active ? <div className="premium-offer panel">
      <ul><li>{t("100 повторений в день")}</li><li>{t("Возможность создавать свои фразы")}</li><li>{t("Возможность создавать свои темы")}</li></ul>
      <button type="button" disabled>{t("КУПИТЬ")}</button>
    </div> : <>
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
