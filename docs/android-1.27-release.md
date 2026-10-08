# SerboTalk 1.27 — Android и web

08.10.2026 владелец явно поручил публикацию web и выпуск APK, заранее подтвердив 1.27. Android versionCode — 37. Весь текущий backlog включает версию приложения в настройках, словарные подсказки с отступами 12 px и увеличенным шрифтом, удаление счётчика текущей фразы и процентную подпись штрафа за подсказки. Расчёт оценки и длина сессии сохранены.

- [x] Реализация и предыдущие проверки: 186 frontend tests / 17 files; lint/typecheck/build; Chrome mock 4 passed на web/native layout 320/390 px. [Доказательства](word-hints-layout-checkpoint.md).
- [x] Метаданные 1.27/code37 и версия настроек: 18 targeted tests passed.
- [x] `pnpm android:cloud-apk`: production Android build → cap sync → assembleProdDebug, BUILD SUCCESSFUL, 109 tasks.
- [x] Package com.serbiantalk.trainer, 1.27/code37, minSDK24/targetSDK36; signature v2 verified. Certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с 1.26.
- [x] Все 7 dist files совпали с APK. Absolute API `https://serbian-speaking-trainer-api.vercel.app`, HTTPS WebView; testlab/local config/mixedContent отсутствуют. Единственная строка localhost относится к неиспользуемому значению по умолчанию Supabase SDK; приложение явно передаёт production URL.
- [x] Копии artifacts/Downloads совпали. `SerboTalk-andorid16-1.27.apk`: 4 431 674 bytes, SHA-256 `f788d18b0403523f257e8e1c70925b93f4dce48ddd15c4e04ed43078a1e213a9`. Локальные доказательства: `artifacts/android-1.27-build.log`, `artifacts/android-1.27-verification.json`.
- [x] Chrome mock web/native 320/390 px: повторные 4 passed с проверкой видимого номера 1.27; полный suite предыдущего change 186 passed.
- [x] [PR #81](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/81) merged, release SHA `0544ce7963b5b31a6811b4bd0da24711a261c80d`; MERGEABLE/CLEAN, назначенных checks нет.
- [x] Production web `dpl_725JmSvWMaqyGfR6WLY8UZ86YsnX` READY, metadata SHA/main и production alias подтверждены через Vercel API. [Сайт](https://serbian-speaking-trainer.vercel.app), [deployment](https://serbian-speaking-trainer-2zx60x56j-suezerguts-projects.vercel.app). Список production env проверен без чтения значений; backend и migrations не менялись.
- [x] Post-Ready: авторизованный Chrome smoke показывает «Версия приложения: 1.27»; console errors отсутствуют, профиль/настройки/учебные данные не менялись. Production-asset mock e2e: 4 passed (web/native layout 320/390 px), popup bounds/long wrapping/font/navigation/counter/version. Реальная речь/AI не вызывались.
- [x] Все 6 JS/CSS production web побайтно совпали с APK. API health 200/ok, auth/me без токена 401. Error logs web/backend за окно 15m пусты. Локальные доказательства: `artifacts/web-1.27-{deploy.log,inspect.json,api.json,errors.jsonl}`, `artifacts/api-1.27-errors.jsonl`.
- [x] [GitHub release v1.27](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.27) опубликован. Tag/target совпали с release SHA; asset state uploaded, server digest/size совпали с APK и Downloads.

[Скачать SerboTalk-andorid16-1.27.apk](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.27/SerboTalk-andorid16-1.27.apk). Локальная копия: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.27.apk`.

- [ ] Ручная приёмка на физическом телефоне, обновление установленного APK и реальная речь.

Физическая приёмка учитывается отдельно; весь P0/P1/P2 не закрывается этим выпуском. APK/логи/локальные доказательства не коммитятся.
