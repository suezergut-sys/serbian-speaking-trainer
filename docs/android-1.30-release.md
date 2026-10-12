# SerboTalk 1.30 — web и Android

12.10.2026 владелец поручил вход `serbotalkreview` вместо email, публикацию web и Android и отдельно подтвердил 1.30. VersionCode повышен до 40; 1.29/code39 была локальной проверочной сборкой, её публикация заменена этим выпуском.

Логин сопоставляется с выделенным аккаунтом только на backend (`REVIEW_LOGIN_USERNAME`, `REVIEW_LOGIN_EMAIL`). Пароль проверяется обычным Supabase password grant; frontend устанавливает выданную сессию через `setSession`. Email/password вход остаётся совместимым со старым APK. Нет общего поиска пользователей по имени, изменения прав или паролей. Сервер не сохраняет пароль, не повторяет password requests, использует timeout, безопасные ошибки и no-store. Ответы валидации этого endpoint не содержат входных значений. Лимит провайдера 429 передаётся клиенту. Подпись APK — прежняя для установки поверх 1.28/1.29; release AAB для Google Play готовится отдельно.

- [x] Реализация alias и targeted проверки: 15 backend tests, 8 frontend auth/UI/metadata tests; используются синтетические credentials и mock, без внешнего Auth/OpenAI.
- [x] Полный scripts/check.ps1: backend/scripts 278 passed / 8 skipped, Node resilience guards 5 passed; frontend 200 tests / 19 suites, lint/typecheck/production build. Exit 0; предупреждения deprecation и размера chunk не являются ошибками.
- [ ] Слияние PR, backend и frontend Vercel Ready/SHA/alias; проверка production интерфейса.
- [x] pnpm android:cloud-apk BUILD SUCCESSFUL / 109 tasks. Package com.serbiantalk.trainer, 1.30/code40, minSDK24/targetSDK36. 7 dist files совпали побайтно с packaged assets; production API https://serbian-speaking-trainer-api.vercel.app, HTTPS WebView, alias endpoint и deletion route присутствуют. Корпоративный email и secret key отсутствуют в bundle.
- [x] apksigner verify: SHA-256 сертификата 1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0 совпадает с 1.28/1.29. APK 4 434 718 bytes, SHA-256 553c1291979ec26b5982d11dd92001b76d44467b7b7672b6ea077a8aa786ee93; копии artifacts и Downloads совпадают.
- [ ] GitHub release v1.30.
- [ ] Реальный вход по alias с паролем, который вводит владелец; физическая приёмка голоса и страницы удаления.
- [ ] Скриншоты телефона и завершение Google Play / release AAB / закрытого теста.

Локальный APK: C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.30.apk. Игнорируемые evidence: artifacts/android-1.30-quality.log, build.log, badging.txt, signature.txt, verification.json. APK в Git не входит.
