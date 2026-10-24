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
- [x] [PR #145](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/145) merged; runtime `35dfddceaf3f2299caefff20d9a3654824f14089`. Web deployment `dpl_8Q3AtNW4nhcoSVQ1nWJxRqrSj9am` Ready/production/main; API подтвердил SHA и alias serbotalk.app. [Deployment](https://serbian-speaking-trainer-a89kmbnlj-suezerguts-projects.vercel.app). Root/app/privacy/terms/health 200, anonymous me/topics 401. Все 20 production browser mock scenarios RU/EN passed, реальная авторизованная сессия показывает v.1.39 и ShareApp; ошибки frontend/backend за проверенный интервал: 0/0.
- [x] [GitHub v1.39](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.39) опубликован как latest; tag/target совпал с runtime, server asset digest/size и обратная загрузка совпали с APK/Downloads. [APK](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.39/SerboTalk-andorid16-1.39.apk). Репозиторий private: для скачивания нужна авторизация GitHub.
- [ ] Физическая установка, email/Google OAuth, системное меню share, микрофон/динамик и реальная речь на телефоне. Browser Android-layout не заменяет физическую приёмку. Google Play/AAB отдельно.

Локальные evidence вне Git: `artifacts/release-1.39-quality.log`, `artifacts/android-1.39-*`, `artifacts/email-otp/`.

## Рабочие копии и доказательства

- [x] Исходная основная папка сохранена commit/push в `codex/recovery-before-139-20261024`, commit `506afa7` (65 файлов, без секретов/бинарного аудио/artifacts). Снимок не сливается в main: его проверенные изменения уже включены.
- [x] Основная папка обновлена main → origin/main fast-forward, остальные 11 копий проверены и синхронизируются тем же финальным SHA; прежние ветки и отдельные detached commits сохранены. Активных сторонних локальных задач проекта не обнаружено.
- [x] Накопленный PR #60 перенесён в #145 и закрыт как superseded.

Финальный doc/test-only follow-up добавляет параметры production smoke для ShareApp и записывает эти результаты, без изменения runtime/APK. После его merge выполняется повторная проверка 12/12 HEAD и пустого Git status; итоговый снимок — `artifacts/android-1.39-worktrees-final.json`. SHA deploy/APK остаётся 35dfddceaf3f2299caefff20d9a3654824f14089.

APK в Downloads: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.39.apk`. Evidence: `artifacts/android-1.39-{deployment,http-smoke,github-api,verification}.json`, `*-production-browser.log`, `*-signature.txt`, `*-badging.txt`, `*-frontend-errors.jsonl`, `*-backend-errors.jsonl`.
