import { getLocale, topicText } from "./i18n";
import type { TopicListItem } from "./types/training";

export function sortedPersonalTopics(topics: TopicListItem[]): TopicListItem[] {
  const collator = new Intl.Collator(getLocale(), { sensitivity: "base", numeric: true });
  return topics.filter(topic => topic.is_custom).sort((left, right) =>
    collator.compare(topicText(left.id, left.title_ru, left.title_en), topicText(right.id, right.title_ru, right.title_en)) ||
    left.id.localeCompare(right.id));
}
