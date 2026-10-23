import { BackendError } from "./api/training";

export const topicLimitMessage = "Достигнут лимит: 5 пользовательских тем. Удалите свою тему, чтобы добавить новую.";
export const phraseLimitMessage = "Достигнут лимит: 30 фраз в теме. Удалите свою фразу, чтобы добавить новую.";
export function customContentError(error: unknown, fallback: string): string {
  if (!(error instanceof BackendError)) return fallback;
  const messages: Record<string, string> = {
    custom_topic_limit: topicLimitMessage,
    custom_phrase_limit: phraseLimitMessage,
    custom_total_phrase_limit: "Достигнут лимит: 150 своих фраз. Удалите свою фразу, чтобы добавить новую.",
    custom_topic_required: "Выберите свою пользовательскую тему. В готовые темы добавлять фразы нельзя.",
    phrase_preparation_expired: "Подготовленный перевод устарел. Подготовьте перевод заново.",
    phrase_preparation_used: "Этот перевод уже использован. Подготовьте перевод заново.",
    phrase_already_exists: "Такая фраза уже есть в другой теме. Чтобы перенести её, сначала удалите прежнюю фразу.",
  };
  if (error.code && messages[error.code]) return messages[error.code];
  if (Array.isArray(error.detail) && error.detail.some(item => item?.type === "phrase_word_limit")) return "Фраза должна содержать не более 15 слов.";
  return fallback;
}
