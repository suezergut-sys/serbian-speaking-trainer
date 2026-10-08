# SerboTalk 1.27 — Android и web

08.10.2026 владелец явно поручил публикацию web и выпуск APK, заранее подтвердив 1.27. Android versionCode — 37. Весь текущий backlog включает версию приложения в настройках, словарные подсказки с отступами 12 px и увеличенным шрифтом, удаление счётчика текущей фразы и процентную подпись штрафа за подсказки. Расчёт оценки и длина сессии сохранены.

- [x] Реализация и предыдущие проверки: 186 frontend tests / 17 files; lint/typecheck/build; Chrome mock 4 passed на web/native layout 320/390 px. [Доказательства](word-hints-layout-checkpoint.md).
- [x] Метаданные 1.27/code37 и версия настроек: 18 targeted tests passed.
- [x] `pnpm android:cloud-apk`: production Android build → cap sync → assembleProdDebug, BUILD SUCCESSFUL, 109 tasks.
- [x] Package com.serbiantalk.trainer, 1.27/code37, minSDK24/targetSDK36; signature v2 verified. Certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с 1.26.
- [x] Все 7 dist files совпали с APK. Absolute API `https://serbian-speaking-trainer-api.vercel.app`, HTTPS WebView; testlab/local config/mixedContent отсутствуют. Единственная строка localhost относится к неиспользуемому значению по умолчанию Supabase SDK; приложение явно передаёт production URL.
- [x] Копии artifacts/Downloads совпали. `SerboTalk-andorid16-1.27.apk`: 4 431 674 bytes, SHA-256 `f788d18b0403523f257e8e1c70925b93f4dce48ddd15c4e04ed43078a1e213a9`. Локальные доказательства: `artifacts/android-1.27-build.log`, `artifacts/android-1.27-verification.json`.
- [x] Chrome mock web/native 320/390 px: повторные 4 passed с проверкой видимого номера 1.27; полный suite предыдущего change 186 passed.
- [ ] Merge PR #81 и production web READY с проверкой версии и подсказок.
- [ ] GitHub release v1.27, server digest/size и копия Downloads.
- [ ] Ручная приёмка на физическом телефоне, обновление установленного APK и реальная речь.

Физическая приёмка учитывается отдельно; весь P0/P1/P2 не закрывается этим выпуском. APK/логи/локальные доказательства не коммитятся.
