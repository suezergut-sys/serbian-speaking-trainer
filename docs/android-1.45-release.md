# Android1.45/code55 — восстановлен Review access

01.11.2026 владелец поручил вернуть парольный вход с тем же доступом, что при закрытом тестировании, собрать APK/AAB и загрузить в Console. Номер1.45/code55 отдельно согласован. Это отменяет прежнее требование скрыть отдельный проверочный вход; основной вход остаётся Google, web email-code сохранён.

## Реализация

- [x] Восстановлены ReviewLogin на login/landing, backend alias `/api/auth/review-login`, Supabase password authority, setSession обычных токенов. Текущий REVIEW_LOGIN_EMAIL в Production сохранён с закрытого теста; логин/пароль, роль, ограничения и данные существующего аккаунта не менялись. Никакого сброса пароля, новой регистрации или входа через личный Google-аккаунт не требуется.
- [x] RU/EN строки восстановлены из существующего каталога, общий тёмный стиль сохранён. В Android нет email-code, проверочный пароль доступен в отдельном раскрываемом разделе под Google. Пароль очищается после успеха/ошибки, повторный pending submit блокируется; provider details в UI не показываются.
- [x] Backend Request SecretStr, длины username1..100/password1..1024, extra forbidden; validation422 не повторяет payload. Ответы200/401/429/503 no-store,429Retry-After, внешняя авторизация с timeout без автоматического повтора пароля. Пароль проверяется Supabase, привилегии endpoint не назначает, admin/debug guards не меняются.
- [x] Бессрочный Android Premium автоматически для нового и существующего web-аккаунта, без оплаты/реквизитов/BUY в Android, лимиты100/5×30. Включён весь main/backlog: диагностика model/parse/return, UUID и сохранение ответа; Ekavica и двуязычные личные фразы сохранены.

## Проверки и сборка

- [x] Backend/scripts543 passed,9 PostgreSQL skipped; frontend375 tests/42files (`--maxWorkers=2`), ESLint src/typecheck/web production build.
- [x] 24 существующих browser scenarios (login flags,diagnostics,source language) и4 финальных review sign-in RU/EN web/native Android прошли. Первый новый mock не описывал штатный auto-start `/sessions/start`; добавлен синтетический ответ, runtime и assertions не ослаблялись. Отказы пароля/очистка/повтор/сессия/Premium проверены; AI/Auth/Telegram/аудио в автоматике синтетические.
- [x] `pnpm android:cloud-apk`, затем подписанный `scripts/build-android-play-aab.ps1`: BUILD SUCCESSFUL. Bundletool validate/dump, APK badging:1.45/code55,min24,target36,package com.serbiantalk.trainer.
- [x] Все10 production public assets APK/AAB совпали с Android dist; отдельно2 генерируемых Capacitor cordova stubs. Production HTTPS API, native Premium claim, review-login и диагностический UI присутствуют; testlab/landing/ключ OpenAI отсутствуют, HTTPS WebView/Browser+Share plugins проверены. Начальный checker ошибочно искал generated cordova stubs в dist; они проверены отдельно, файлы сборки не менялись.
- [x] APK signature SHA256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`, AAB upload cert `aa7aa2702faafb0270d967d3f4d9a318f24ce26148084acfae304f55e378cf62`: прежние ключи. Java self-signed certificate warning ожидаем; jarsigner/validate успешны.
- [x] Downloads APK `SerboTalk-andorid16-1.45.apk`,4654849 bytes,SHA256 `5893ffdc180d5db1378efcf9518492a241907729a79df7d4d1d6931dd27f414c`; AAB `SerboTalk-android-1.45.aab`,3490165 bytes,SHA256 `d93ce2f96fdc475a613b90b6baf2dab3fcc105336bd525dea0e18e5d9dd162fe`. Копии побайтно сверены. Подписи/закрытый ключ/пароль/зависимости/бинарные артефакты в Git не добавляются.
- [ ] GitHub PR/merge, release assets, backend/web deployment и проверка настоящего прежнего review sign-in.
- [ ] Play Open Testing: заменить54 на55 в сохранённом release1, сохранить RU/EN notes, проверить App access/страны178/unlimited, проверки/review отдельно. Alpha53 и production не заменяются.
- [ ] Приёмка установленного из Play приложения на устройстве: парольный и Google-вход, новый/web-аккаунт, Premium/отсутствие оплаты, речь. Автотесты не заменяют аппаратную приёмку.

Предложенные notes RU: «Возвращён вход для проверки по логину и паролю. Premium в Android активируется автоматически. Улучшена диагностика ошибок проверки ответов; ваш ответ сохраняется для повтора.»

EN: «Restored review access with username and password. Premium activates automatically on Android. Improved answer-checking error diagnostics; your answer is kept for retry.»

Сборка содержит накопленные web-изменения без повторного backfill/миграций. Source SHA APK/deploy и последующие evidence-only commits фиксируются после публикации отдельно. Доказательства вне Git `artifacts/android-1.45-*`; перед работой все12 копий чистые на599e75a, recovery не требовался. После evidence merge повторяется синхронизация.
