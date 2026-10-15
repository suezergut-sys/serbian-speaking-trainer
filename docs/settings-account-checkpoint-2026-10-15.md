# Оформление аккаунта и настроек — 15.10.2026

- [x] Иконка сообщения под флагами удалена; ru/en стабильная геометрия и выбор языка сохранены.
- [x] Отдельные account/deletion sections; имя/email/лимит используют доступную ширину, выход на мобильных — отдельная строка. Нет horizontal overflow на 320px.
- [x] Убрано примечание «По умолчанию выключено…» из UI/каталога; отладка — новое название и два сокращённых абзаца ru/en. Backend/хранение/очистка/доступ не изменены.
- [x] Targeted components: 17 passed. Browser: 12 passed (4 login layouts + 8 settings ru/en desktop/mobile/narrow/Android), включая ошибки и повтор PATCH отладки с mock API. Синтетические данные, OpenAI и реальные изменения аккаунта не используются.
- [x] Полный frontend: 209 passed / 20 files (--maxWorkers=1), lint, TypeScript и production build. App test и legacy week-navigation selector обновлены на новый заголовок «Аккаунт»; legacy mock дополнен уже существующим preferences endpoint.
- [x] [PR #104](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/104) merged, runtime SHA `6befe147b6a0feee86257af9e10e8a06c09e4488`. Frontend `dpl_AYNPbHyC8qQpCNQ918jTDjv6F5ZH` READY/production/main; основной alias https://serbian-speaking-trainer.vercel.app подтверждён Vercel API. 15.10.2026 после READY: 12/12 production browser checks (4 login + 8 settings ru/en desktop/mobile/320px/Capacitor-layout) прошли. Settings API перехвачен synthetic fixtures, реальные аккаунты/отладка/аудио не менялись. Публичные /, /privacy, /terms, /delete-account — 200.
- [x] Android metadata/package/APK прежние, backlog обновлён.
- [ ] APK по отдельной команде и физическая приёмка.
- [ ] Ручная приёмка владельцем.

Evidence (ignored): artifacts/settings-account/*, artifacts/login-flags/*, artifacts/settings-account-{release,alias,http}.json. Дополнительно 2/2 legacy week-navigation checks прошли после актуализации selector/preferences mock.
