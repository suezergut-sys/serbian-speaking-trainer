import { expect, it } from "vitest";
import { BackendError } from "../api/training";
import { transcriptionErrorMessage } from "../transcriptionError";

it.each([
  [new BackendError(503, { code: "transcription_empty" }), "Модель вернула пустую"],
  [new BackendError(503, { code: "transcription_unexpected_script" }), "неподдерживаемого алфавита"],
  [new BackendError(503, { code: "transcription_timeout" }), "Сервис распознавания не ответил вовремя"],
  [new BackendError(503, { code: "transcription_connection" }), "Сервер потерял связь"],
  [new BackendError(503, { code: "transcription_rate_limit" }), "квоты"],
  [new BackendError(413), "Запись слишком большая"],
  [new BackendError(401), "Сессия входа истекла"],
  [new TypeError("Failed to fetch"), "Проверьте интернет-соединение"],
  [new DOMException("timeout", "TimeoutError"), "Сервер не ответил вовремя"],
  [new DOMException("abort", "AbortError"), "был прерван"],
  [new Error("private data"), "Причину определить не удалось"],
  [new BackendError(502, { message: "secret", code: "unknown" }), "HTTP 502"],
])("explains transcription failure safely: %s", (error, expected) => {
  const message = transcriptionErrorMessage(error);
  expect(message).toContain(expected);
  expect(message).not.toMatch(/secret|private data|Failed to fetch/);
  expect(message).toContain("ввести ответ вручную");
});
