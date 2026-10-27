# Мягкие подсказки при первом входе — 27.10.2026

База: `a4b46055989ff6621d7296ead850e681360ee32e`.

- [x] `UserService.sync` при создании профиля задаёт `assistance_enabled=True`. Первый вход web и Android использует общий API; существующий выбор не меняется. Пользователь может выключить подсказки, повторный вход и перезапуск сохраняют выбор.
- [x] 30 backend tests: preferences, preference migration, users API. Новые проверки первого GET `/api/auth/me` и `/preferences` выполняются для web/Android с реальным auth sync и mocked identity; повторный bootstrap/смена метаданных не сбрасывает true/false. Отдельный service regression проверяет обе настройки.
- [x] 14 shared UI component tests (`useAssistancePreference`, `SettingsView`), включая RU/EN, восстановление серверного значения и синхронизацию клиентов. Typecheck/production web build passed; Vite предупреждает о большом chunk. OpenAI и реальные уведомления не вызываются.
- [x] ORM/DDL не меняются: изменение относится к onboarding-сервису, миграция и пересчёт существующих строк не нужны. Тексты UI неизменны.
- [x] Код и проверки: `4d0e295b552fa264ab5709b0d95b1785dba2fa44`, commit/push и [PR #174](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/174). GitHub MERGEABLE/CLEAN, checks не назначены (statusCheckRollup пуст). Документ доказательств обновлён отдельным commit.
- [x] PR #174 merged; backend production READY на `62248b136a6ded84f384bb28db4164431de07f45`, deployment `dpl_F4afejVG1q1GEvz9DnJ48GUvCPxL`. [Deployment](https://serbian-speaking-trainer-268nepx0i-suezerguts-projects.vercel.app), [production API](https://serbian-speaking-trainer-api.vercel.app/api/health).
- [x] Production alias и gitCommitSha совпадают; чистый git archive. Build seed: 0 skills/topics/phrases added. Env names проверены, без изменения значений. /app и оба /api/health=200, /api/auth/me без авторизации=401. Runtime error logs пустые.
- [x] Авторизованный browser smoke на serbotalk.app после deploy: приложение/темы/настройки загружаются; сохранённое off существующего аккаунта осталось off. Browser console errors=0. Исходная пользовательская вкладка с платёжной формой сохранена.
- [ ] Реальный первый вход нового аккаунта web/Android — ручная приёмка отдельно; создание production-аккаунта не выполнялось. Default нового профиля подтверждён integration tests с реальным auth sync и mocked identity.
- [x] Android sync/build не выполнялись, версия 1.41/code51 прежняя. После публикации backend новый default работает и в текущем APK.

Исходно все 12 копий чистые на main. Recovery/WIP не требовались; после публикации PR основная папка возвращена на main `a4b46055989ff6621d7296ead850e681360ee32e` = origin/main; все 12 копий чистые на том же SHA. Изменение сохранено в опубликованной ветке `codex/default-soft-hints`. Предыдущий PR #173 с экраном Premium независим и этим изменением не сливается.


## Согласованность копий после выпуска

Runtime SHA: `62248b136a6ded84f384bb28db4164431de07f45`. Последующий commit с доказательствами меняет только документацию; повторный deploy/APK не выполняется. Основная папка main и все 11 неактивных detached worktree после documentation PR синхронизируются с итоговым origin/main; исторические ветки сохраняются. Recovery не требовались. Незавершённое: ручная приёмка первого входа нового production-аккаунта на web/телефоне. Независимый Premium PR #173 остаётся открытым.

Проверка production: 27.10.2026 22:59 MSK. Private ignored evidence: `artifacts/default-soft-hints-release/deployment-verified.json`, `http-verified.json`, `runtime-sha.txt`, чистый архив `source.zip`.
