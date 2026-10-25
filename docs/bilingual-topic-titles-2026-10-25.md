# Двуязычные названия личных тем — 25.10.2026

## Реализация

- [x] Новое создание переводит название RU ↔ EN через existing env text model и версионированный topic_title_translation_v1.md. Модель возвращает только Pydantic TopicTitleTranslation (detected source language и translation); оригинал после прежней нормализации пробелов сохраняется в определённом языке. UI-language — подсказка для неоднозначных названий, а не жёсткое ограничение языка ввода.
- [x] title_ru хранит русский вариант, новый nullable title_en — английский. CreateTopicRequest.title_ru остаётся прежним полем исходного ввода для совместимости со старыми клиентами. Идентификатор как прежде от owner + normalized original; duplicate возвращает прежнюю запись без AI. Разные языковые формулировки считаются разными названиями, семантической дедупликации нет.
- [x] AI вызов до write-lock аккаунта, после него повторно проверяются duplicate и quota 5. Existing OpenAI timeout/retry и безопасная ошибка; invalid/unavailable translation → 503 topic_translation_unavailable, тема не создаётся, UI сохраняет draft и разрешает retry. Постоянный ключ только backend; слова/фразы не генерируются.
- [x] Миграция 6ccb82f56983 от a910bc57d302 добавляет nullable title_en. Старые темы и их оригиналы не переписываются и не вызывают AI на чтении; при отсутствии перевода отображается исходное название. Downgrade отказывается удалять колонку, если в ней есть переводы (нужен предварительный экспорт/отдельное решение).
- [x] List/TopicContext/statistics transport оба названия; shared RU/EN helper выбирает сохранённый вариант. Домашние карточки, Premium, selector фразы, подтверждение удаления, exercise topic/review topic и статистика используют локализованное название. Статистика сохраняет owner-scoped joins и прежнее число запросов. Testlab bootstrap узнаёт предыдущую схему.
- [x] Новые подсказка/loading/503 тексты добавлены RU/EN; тёмные controls прежние. Android version/package/assets/sync/build не менялись. Старый APK совместим с API, локализация новых имён входит в следующий отдельно запрошенный APK.

## Проверки и выпуск

- [x] scripts/check.ps1: 393 backend/scripts passed, 9 skipped (отдельный PostgreSQL testlab недоступен), 5 Node guards; 315 frontend tests, lint/TypeScript/production build. 12/12 browser scenarios: RU/EN create → error/retry → phrase selector/save → язык наоборот → home/reload → exercise → statistics → Premium, desktop/mobile/shared Android; admin custom-content regression.
- [ ] GitHub PR/merge; backend migration/deploy и web Ready/alias/SHA; production browser/HTTP/schema checks.
- [x] Отдельный manual smoke существующего env text model: RU «Велосипедные прогулки» → “Bike rides”, EN “Weekend plans” → «Планы на выходные». Два коротких реальных AI-вызова вне автотестов, без DB writes/production тем/фраз, результат Pydantic-validated. Local evidence: artifacts/bilingual-topics-live-ai.json.
- [ ] Физическая Android-приёмка — следующий отдельно запрошенный APK.

Автотесты не вызывают OpenAI. Пользовательские темы production не создаются/удаляются для проверки. Local evidence вне Git: artifacts/bilingual-{topic-tests,topics-targeted,topics-quality,topics-browser}.log, bilingual-topics/*.png. После doc-only evidence commit выполняется финальная синхронизация main/origin и всех 12 worktree.
