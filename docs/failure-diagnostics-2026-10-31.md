# Проверка ответа: причина сбоя и классификация ошибок

31.10.2026. Владелец сообщил о недоступной проверке в desktop/mobile и отдельно потребовал классификацию ошибок внешней модели, разбора и возврата результата.

## Диагноз инцидента

Для проверенного упражнения последние вызовы `answer_analyzer_v4.md` в разрешённой owner-диагностике завершались HTTP200/status completed, без provider_error. Аудиополя не читались и не экспортировались. Следовательно, для этого воспроизведения это не timeout/квота внешнего провайдера.

Модель выдала замечание, меняющее точку на вопросительный знак. Backend корректно запрещает исправления без содержательного изменения слов, но повторно отправлял тот же запрос без объяснения причины отказа. После двух одинаково неприемлемых разборов возвращался общий503 `analysis_unavailable`. Ошибка возникала уже после завершения capture внешнего вызова, поэтому в прежнем debug log были успешный HTTP200 и `error_json=null`. Одна и та же серверная логика обслуживает web и Android.

Исправление: версионированный prompt v5 особо исключает пунктуацию/регистр расшифровки из речевых ошибок; второй, последний вызов получает закрытый код `previous_validation_failure`, например `non_lexical_correction`, и заново оценивает исходные слова. Защита от выдуманного evidence/skill, бессодержательных исправлений и загрязнения Ijekavica не ослабляется. Если второй результат тоже недопустим, оценка и прогресс не записываются; возвращается уже классифицированная ошибка.

## Общий контракт диагностики

| `kind` | Где возникла ошибка | Примеры `stage / reason` |
| --- | --- | --- |
| `external_model` | Не удалось успешно вызвать провайдера или модель отказала | `configuration / not_configured`, `provider_request / timeout`, `connection`, `rate_limit`, `quota`, `authentication`, `provider_status`, `model_refusal` |
| `response_parse` | Полученный ответ нельзя использовать: структура или проверяемое содержание | `structured_output / invalid_schema`, `missing_output`, `incomplete_output`, `internal_parse_failure`; `serbian_policy / ekavica_violation`; `grounding / unsupported_evidence`, `non_lexical_correction`, `unknown_skill`, `missing_issue`, `contradictory_verdict`, `dialect_verdict`, `canonical_changed` |
| `response_return` | Сохранение/сериализация/возврат конечного API-ответа или его получение клиентом | Сервер: `persistence / persistence_failed`, `serialization / serialization_failed`, `server_return / server_return_failed`. Только клиент: `client_network / connection`, `client_timeout / timeout`, `client_response_decode / invalid_json` |

Клиентский network/timeout не объявляется доказанным отказом внешней модели: запрос мог не дойти до backend либо результат мог сохраниться, а доставка оборваться. Нельзя достоверно подтвердить сетевую доставку ответа одним серверным логом.

Безопасные поля `failure`: `kind`, `stage`, `reason`, `retryable`, `diagnostic_id`, необязательный HTTP `provider_status`. Модель полей валидируется Pydantic с закрытыми enum. Тело провайдера, секреты, transcript и аудио в общие логи/API не включаются. Неизвестное локальное исключение разбора не объявляется сбоем внешней модели.

Пример совместимого ответа:

```json
{"detail":{"code":"analysis_unavailable","message":"Answer analysis is temporarily unavailable. Please retry.","retryable":true,"failure":{"kind":"response_parse","stage":"grounding","reason":"non_lexical_correction","retryable":true,"diagnostic_id":"49d2c9b9-5978-402b-90d6-3822f88d1ae2","provider_status":null}}}
```

Старый `analysis_unavailable` сохранён, чтобы Android1.44 продолжал корректно обрабатывать ошибку. Новый web различает три класса и показывает безопасный ID. Текст ответа и idempotency key попытки при повторе сохраняются. Признак retryable не означает автоматическую отправку или гарантированный успех следующего запроса.

## Связь логов

- Клиент создаёт UUID `X-Request-ID`; сервер принимает только валидный UUID, остальные значения заменяет своим. ID хранится в ContextVar на время запроса, возвращается в заголовке (разрешён CORS) и в диагностике ошибки. ID не является правом доступа к логам.
- В обычных platform logs сохраняется только JSON метаданных `application_failure`: warning для отклонённой промежуточной попытки, error для окончательной ошибки. Произвольные exception messages/SQL/provider body туда не печатаются.
- При включённой отладке разрешённого администратора те же метаданные попадают в owner-scoped `application.failure`. Каждый debug model call получает `_diagnostic_id`, в том числе при raw-response capture. Это связывает успешный ответ модели с последующим отказом содержательной проверки.
- Новая таблица/миграция не нужны. Сохраняются существующие авторизация владельца, отключение/полная очистка отладки и ограничения временного аудио. Новые диагностические записи вообще не содержат аудио.
- Текстовые AI-вызовы, распознавание речи и возвращаемые HTTP-ошибки используют общий классификатор. Ошибка необязательной помощи расшифровке фиксируется даже при безопасном fallback на исходный текст. Сбои FastAPI response validation/SQLAlchemy/необработанные ошибки возвращают безопасную классификацию, без внутренних деталей.
- Если процесс/инфраструктура падает до выполнения middleware либо отправка уже началась, сервер не гарантирует JSON с этой классификацией; клиент фиксирует свой этап получения и ID. Намеренная отмена при смене упражнения не объявляется аварией.

## Как разбирать следующий инцидент

1. Сохранить показанный пользователю диагностический ID и время, без аудио/платёжных данных.
2. Найти ID в platform logs (`application_failure`, уровни warning/error). Проверить kind/stage/reason и provider_status, а не делать вывод только по503 или200 модели.
3. Для разрешённого debug-admin при включённой отладке сопоставить `_diagnostic_id` модели и `application.failure`. Не искать записи других владельцев по одному ID и не включать отладку автоматически.
4. `external_model`: проверить конфигурацию, status/reason, квоту/доступность. `response_parse`: воспроизвести schema/grounding/policy без реального AI в unit tests. `response_return`: проверить сохранённый idempotent результат/SQL/response schema; не создавать новую попытку до выяснения статуса предыдущей.
5. При только клиентском network/timeout сначала выяснить, дошёл ли запрос и сохранён ли результат. Отсутствие серверного лога не доказывает сбой модели.

## Проверки и отдельные статусы

- [x] Unit/integration tests: внешние HTTP429 quota/rate-limit,401,400,500, timeout, schema, punctuation grounding/retry RU/EN и оба алфавита; HTTP500 persistence/serialization, безопасный error body, request ID, сброс контекста; отсутствие списания попытки; owner debug/disable и отсутствие audio в новых записях.
- [x] Полный backend/scripts: 518 passed / 9 PostgreSQL skips; frontend366 passed/40files, lint/typecheck/production build. Автотесты не вызывают OpenAI. Логи вне Git: `artifacts/diagnostics-*`.
- [x] Финальная browser matrix: 12/12 RU/EN × desktop/shared Android × три категории. Ответ и прежний idempotency key сохраняются, ID виден, overflow отсутствует. Screenshot EN Android просмотрен. Первый native mock использовал desktop-название кнопки; selector исправлен на существующий native aria-label, runtime из-за этого не менялся.
- [x] [PR #187](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/187) merged. Backend и web production READY на runtime SHA `ed642fe4cf3e53448d61dad8e1d023453ca6bec2`. Backend deployment `dpl_8JXPqCwPReSXPTcjmGjD3VUip8WP`, alias `serbian-speaking-trainer-api.vercel.app`; frontend `dpl_FMZgN9ozt1jV8bsxswRkntm2PBiB`, alias `serbotalk.app`. SHA/alias подтверждены Vercel API.
- [x] Production `/api/health`, OpenAPI, `/app` и web rewrite `/api/health` возвращают200. Request ID проходит backend/rewrite; Android CORS preflight с `https://localhost`/X-Request-ID возвращает200. Прямой browser origin `serbotalk.app` к API намеренно не разрешён: web использует same-origin rewrite. Первоначальный probe `/health` дал404, правильный путь `/api/health` проверен отдельно.
- [x] 12/12 browser scenarios повторены на реальном production bundle: RU/EN × desktop/shared Android × три класса. API/микрофон только синтетические, персональные данные и прогресс не менялись. Backend error log query после публикации не вернул error-событий; это ограниченная проверка окна15мин, не доказательство отсутствия любых сбоев.
- [x] Отдельные ручные реальные AI-пробы исходного текста (вне автотестов, без DB writes): первый вызов analyzer по-прежнему исчерпал обе попытки на `response_parse/grounding/non_lexical_correction`; вызов provider с причиной retry и следующий полный вызов analyzer вернули `correct`, issues0. Последний диагностический ID `f159b4e5-303e-4186-815c-d53c05364a30`. Использовано уже существующее локальное backend-окружение, production-секреты не извлекались. Первый технический запуск с неправильным env path завершился not_configured до обращения к AI.
- [ ] Повторная приёмка владельцем с реальным учебным ответом через production API/устройство. Ручные AI-пробы подтверждают возможный успешный результат, но показывают сохраняющуюся недетерминированность модели: исключение пунктуации и информированный retry уменьшают причину сбоя, не гарантируют его полного устранения. При повторе ошибка теперь диагностируется, некорректная оценка не записывается.
- [ ] Новые тексты/ID на физическом Android потребуют отдельного будущего APK. Текущий1.44 получает серверный prompt/классификацию без пересборки; общая ошибка на его экране может остаться прежней, метаданные уже будут в API и логах.

Документ и классификатор не подтверждают исправление всех возможных ошибок. Публикация в Google Play, версия1.44 и подписанный AAB не меняются; production access application остаётся отдельным процессом.

## Состояние исходников и копий

Runtime опубликован из `ed642fe`; последующий evidence commit меняет только документацию и не требует повторного deploy/APK. До синхронизации все12 рабочих копий были чистыми, уникальной незавершённой работы/recovery-веток не было. После merge evidence повторяется проверка main==origin/main и всех12 чистых копий на итоговом SHA; SHA и фактический результат сообщаются отдельно в итоговом отчёте.
