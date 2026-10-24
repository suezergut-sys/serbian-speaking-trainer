# SerboTalk 1.39 / code49 — весь накопленный набор

24.10.2026 владелец поручил собрать все накопленные изменения, опубликовать web и выпустить APK. Номер 1.39 / versionCode 49 подтверждён отдельно. Имя: `SerboTalk-andorid16-1.39.apk`.

## Состав

- [x] Email-вход через существующий Supabase Auth, Resend SMTP и подтверждённый auth.serbotalk.app; RU/EN запрос/проверка кода, cooldown и ошибки. Реальный вход владельца и восстановление прежнего прогресса проверены. [Подробности](email-otp-2026-10-24.md).
- [x] «Поделиться приложением» в общих настройках: Capacitor Share 8.0.3, Web Share, clipboard/manual fallback; RU/EN, cancel/busy/error. [Исходная постановка](share-app-checkpoint-2026-10-22.md).
- [x] Весь клиент личного каталога из уже опубликованного PR #143: темы/фразы, подготовка/сохранение, квоты 5 × 30, удаление. Backend уже опубликован, дополнительных миграций/деплоя сервера нет.
- [x] Накопленные регрессии подсветки ответов RU/EN и обоих алфавитов; документы диагностики, premium-доступа, обзора старого тестирования и черновиков Google Play включены. Карточка/трек Play Console не изменяются этим выпуском.
- [x] Сверена вся грязная рабочая копия с origin/main: backend/API/migration/custom-content файлы уже соответствуют #143/#144; локальные ShareApp и тесты добавлены в изолированный release worktree без потери изменений владельца.

- [x] Дополнительно перенесены накопленные правила/documentation PR #60 с актуальными AGENTS; runtime/APK от этого не меняется. Финальная синхронизация рабочих копий учитывается отдельно.

## Проверки и выпуск

- [x] Полный scripts/check.ps1: 377 backend/scripts passed, 8 skipped, 5 Node guards; 299 frontend tests; lint, TypeScript и production web build.
- [x] 20 browser mock scenarios RU/EN: email login, invalid code/session restore, ShareApp, custom catalogs; desktop/mobile/shared Android layout. Автотесты не обращаются к AI.
- [x] Production Vercel env `VITE_EMAIL_OTP_ENABLED=true`; Android public build env включает тот же флаг.
- [x] pnpm android:cloud-apk: BUILD SUCCESSFUL, 128 tasks. APK 1.39/code49/min24/target36. Production HTTPS API, email OTP, каталог и SharePlugin присутствуют; 8 dist / 10 public assets побайтно совпали с sync/APK. Landing/testlab/local API/secrets отсутствуют. apksigner verify прошёл, сертификат SHA256 1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0 совпал с прежним. Размер 4560626 bytes; APK SHA256 `347172214aea610b91dd68658ea7b50c57777f6716cc6510d13fcfbf1839064a`. Копия Downloads проверена.
- [ ] Merge PR, web deployment Ready и production smoke.
- [ ] GitHub release/tag/asset digest и обратная загрузка.
- [ ] Физическая установка, email/Google OAuth, системное меню share, микрофон/динамик и реальная речь на телефоне. Browser Android-layout не заменяет физическую приёмку. Google Play/AAB отдельно.

Локальные evidence вне Git: `artifacts/release-1.39-quality.log`, `artifacts/android-1.39-*`, `artifacts/email-otp/`.
