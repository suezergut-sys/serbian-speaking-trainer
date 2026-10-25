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
- [x] [PR #153](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/153) merged; runtime 1d8d8fa4895bb56e18465b1a6d33a7dc0bc9f9e3. Backend dpl_3LUJQmLFw9ohKjHFrp1v1m7VDTDi [deployment](https://serbian-speaking-trainer-9nokq1qem-suezerguts-projects.vercel.app) и web dpl_3HAnDTXpbmE3C6YZhiMobQ3AMgHC [deployment](https://serbian-speaking-trainer-mjjhdnk6o-suezerguts-projects.vercel.app) Ready/production/main; API и serbotalk.app aliases/SHA подтверждены Vercel API. Принятый CLI workflow из чистого git archive, backend первым.
- [x] Production migration a910bc57d302 → 6ccb82f56983 применена build; Supabase SELECT alembic_version подтвердил 6ccb82f56983, seed 0/0/0. OpenAPI содержит title_en в TopicListItem/TopicContext и topic_title_en в обеих statistics DTO. HTTP root/app/health 200, anonymous topics/custom-phrases 401.
- [x] Все 12/12 production browser mock scenarios RU/EN прошли на настоящем bundle (synthetic auth/API, без production writes и AI). В существующей авторизованной Chrome-сессии EN проверены Create topic, новая подсказка RU/EN, disabled empty save и legacy fallback; тема не сохранялась. Browser fixtures проверяют оба языковых направления, все экраны и reload.
- [x] Отдельный manual smoke существующего env text model: RU «Велосипедные прогулки» → “Bike rides”, EN “Weekend plans” → «Планы на выходные». Два коротких реальных AI-вызова вне автотестов, без DB writes/production тем/фраз, результат Pydantic-validated. Local evidence: artifacts/bilingual-topics-live-ai.json.
- [ ] Физическая Android-приёмка — следующий отдельно запрошенный APK.

Автотесты не вызывают OpenAI. Пользовательские темы production не создаются/удаляются для проверки. Local evidence вне Git: artifacts/bilingual-{topic-tests,topics-targeted,topics-quality,topics-browser}.log, bilingual-topics/*.png. Дополнительные evidence: bilingual-topics-{backend,frontend}-deployment.json, bilingual-topics-production-{browser.log,http.json}, bilingual-topics-api-schema.json, bilingual-topics/production-form.png.

## Рабочие копии

12 копий проверены чистыми и синхронизированы с runtime. Новые recovery-ветки не требовались; прежняя codex/recovery-before-139-20261024 сохранена. Doc-only follow-up фиксирует результаты без redeploy/APK; после его merge выполняется повторная синхронизация и проверка 12 HEAD/main/origin/status. Итоговый снимок вне Git: artifacts/bilingual-topics-worktrees-final.json.
