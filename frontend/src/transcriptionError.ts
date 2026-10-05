import { BackendError } from "./api/training";

const reasons: Record<string, string> = {
  transcription_not_configured: "Распознавание не настроено на сервере.",
  transcription_timeout: "Сервис распознавания не ответил вовремя.",
  transcription_connection: "Сервер потерял связь с сервисом распознавания.",
  transcription_empty: "Модель вернула пустую расшифровку — речь не распознана.",
  transcription_invalid_response: "Модель вернула некорректный ответ.",
  transcription_unexpected_script: "Модель вернула текст с символами неподдерживаемого алфавита.",
  transcription_audio_rejected: "Сервис распознавания отклонил формат или содержимое записи.",
  transcription_provider_auth: "Сервис распознавания отклонил доступ сервера. Требуется проверка настройки сервера.",
  transcription_rate_limit: "Сервис распознавания сообщил об ограничении запросов или квоты.",
  transcription_provider_error: "Сервис распознавания вернул ошибку.",
};

export function transcriptionErrorMessage(error: unknown): string {
  let reason = "Причину определить не удалось.";
  if (error instanceof BackendError) {
    reason = (error.code && reasons[error.code]) || ({
      401: "Сессия входа истекла. Войдите снова.",
      403: "Нет доступа к распознаванию.",
      404: "Текущее упражнение больше недоступно.",
      413: "Запись слишком большая. Запишите более короткую фразу.",
      415: "Запись пуста или её формат не поддерживается.",
      422: "Сервер отклонил данные запроса.",
      429: "Слишком много запросов. Подождите немного.",
    } as Record<number, string>)[error.status] || `Сервер вернул ошибку HTTP ${error.status}.`;
  } else if ((error instanceof Error || error instanceof DOMException) && error.name === "TimeoutError") {
    reason = "Сервер не ответил вовремя.";
  } else if (error instanceof TypeError) {
    reason = "Не удалось связаться с сервером. Проверьте интернет-соединение.";
  } else if ((error instanceof Error || error instanceof DOMException) && error.name === "AbortError") {
    reason = "Запрос распознавания был прерван.";
  }
  return `Не удалось расшифровать речь. ${reason} Можно повторить запись или ввести ответ вручную.`;
}
