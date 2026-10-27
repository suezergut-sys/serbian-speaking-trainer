# Мягкие подсказки при первом входе — 27.10.2026

База: `a4b46055989ff6621d7296ead850e681360ee32e`.

- [x] `UserService.sync` при создании профиля задаёт `assistance_enabled=True`. Первый вход web и Android использует общий API; существующий выбор не меняется. Пользователь может выключить подсказки, повторный вход и перезапуск сохраняют выбор.
- [x] 30 backend tests: preferences, preference migration, users API. Новые проверки первого GET `/api/auth/me` и `/preferences` выполняются для web/Android с реальным auth sync и mocked identity; повторный bootstrap/смена метаданных не сбрасывает true/false. Отдельный service regression проверяет обе настройки.
- [x] 14 shared UI component tests (`useAssistancePreference`, `SettingsView`), включая RU/EN, восстановление серверного значения и синхронизацию клиентов. Typecheck/production web build passed; Vite предупреждает о большом chunk. OpenAI и реальные уведомления не вызываются.
- [x] ORM/DDL не меняются: изменение относится к onboarding-сервису, миграция и пересчёт существующих строк не нужны. Тексты UI неизменны.
- [x] Код и проверки: `4d0e295b552fa264ab5709b0d95b1785dba2fa44`, commit/push и [PR #174](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/174). GitHub MERGEABLE/CLEAN, checks не назначены (statusCheckRollup пуст). Документ доказательств обновлён отдельным commit.
- [ ] Merge/production backend и ручная приёмка первого входа — отдельно.
- [x] Android sync/build не выполнялись, версия 1.41/code51 прежняя. После публикации backend новый default работает и в текущем APK.

Исходно все 12 копий чистые на main. Recovery/WIP не требовались; после публикации PR основная папка возвращена на main `a4b46055989ff6621d7296ead850e681360ee32e` = origin/main; все 12 копий чистые на том же SHA. Изменение сохранено в опубликованной ветке `codex/default-soft-hints`. Предыдущий PR #173 с экраном Premium независим и этим изменением не сливается.
