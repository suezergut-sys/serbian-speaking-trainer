# Домашние темы Premium — 24.10.2026

- [x] С домашней панели удалены обе карточки добавления, формы и прежняя кнопка управления личным каталогом. Создание и управление доступны во вкладке Premium.
- [x] Личные темы premium/admin остаются среди тем тренировки и получают рамку 1 px var(--gold) в обычном/selected/hover состояниях. Preset темы и темы free не получают золотую рамку; owner-scoped API сохраняется.
- [x] Общая реализация desktop/mobile/shared Android UI RU/EN; новые тексты не добавлялись, версии/package/native assets не менялись.
- [x] 306 frontend tests, lint, TypeScript и production build passed. 21/21 browser mock scenarios: RU/EN × desktop/mobile/shared Android, free/premium и admin, создание через Premium, home/reload/gold 1 px, прежние статистика/настройки. Unit regression отдельно проверяет отсутствие gold у preset/free.
- [ ] Web PR/merge, Vercel Ready/alias/SHA, production browser smoke и авторизованный экран владельца.
- [ ] Android build/sync и физическая приёмка — будущий отдельно запрошенный релиз; текущий APK 1.39/code49 прежний.

Backend и API не менялись; автоматические проверки используют synthetic auth/API без вызовов OpenAI. Локальные доказательства вне Git: artifacts/premium-home-{tests,lint,build,browser}.log и premium-home/*.png. После doc-only follow-up выполняется финальная синхронизация всех 12 рабочих копий.
