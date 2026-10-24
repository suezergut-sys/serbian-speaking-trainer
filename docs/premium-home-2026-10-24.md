# Домашние темы Premium — 24.10.2026

- [x] С домашней панели удалены обе карточки добавления, формы и прежняя кнопка управления личным каталогом. Создание и управление доступны во вкладке Premium.
- [x] Личные темы premium/admin остаются среди тем тренировки и получают рамку 1 px var(--gold) в обычном/selected/hover состояниях. Preset темы и темы free не получают золотую рамку; owner-scoped API сохраняется.
- [x] Общая реализация desktop/mobile/shared Android UI RU/EN; новые тексты не добавлялись, версии/package/native assets не менялись.
- [x] 306 frontend tests, lint, TypeScript и production build passed. 21/21 browser mock scenarios: RU/EN × desktop/mobile/shared Android, free/premium и admin, создание через Premium, home/reload/gold 1 px, прежние статистика/настройки. Unit regression отдельно проверяет отсутствие gold у preset/free.
- [x] [PR #149](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/149) merged. Runtime 7eef170b89aa4f8f79f78610702806cca39b5f7e; deployment dpl_7ZmaQB2SghQpyxnhNsKPJzR6G85H Ready/production/main. [Deployment](https://serbian-speaking-trainer-cx381ziu6-suezerguts-projects.vercel.app), serbotalk.app alias и SHA подтверждены Vercel API. Принятый CLI workflow из чистого git archive; backend не перевыпускался.
- [x] 18/18 production browser mock scenarios RU/EN × desktop/mobile/shared Android, free/premium и admin. Home/reload/gold 1 px и создание/удаление через Premium проверены на настоящем production bundle с synthetic auth/API; AI/production данные не затронуты.
- [x] HTTP root/app/health: 200, anonymous topics/custom-phrases: 401. В существующей авторизованной Chrome-сессии (EN, без личных тем) home открывается без карточек создания/старого manager. Gold проверен production mock-сценариями, настоящие данные не создавались/удалялись. Проверено 24.10.2026 (МСК).
- [ ] Android build/sync и физическая приёмка — будущий отдельно запрошенный релиз; текущий APK 1.39/code49 прежний.

Backend и API не менялись; автоматические проверки используют synthetic auth/API без вызовов OpenAI. Локальные доказательства вне Git: artifacts/premium-home-{tests,lint,build,browser}.log и premium-home/*.png. Дополнительные evidence: premium-home-deployment-api.json, premium-home-production-browser.log, premium-home-production-http.json, premium-home/production-authenticated-home.png.

## Рабочие копии

Все 12 копий проверены чистыми и синхронизированы на runtime; новые recovery-ветки не требовались, прежняя codex/recovery-before-139-20261024 сохранена. Доказательства идут doc-only follow-up, без повторного deploy/APK. После merge документации выполняется повторная синхронизация и проверка 12 HEAD/main/origin и git status, снимок artifacts/premium-home-worktrees-final.json.
