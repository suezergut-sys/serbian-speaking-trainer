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
- [x] [PR #192](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/192) merged на `c1cffbc78cc38d1c26f92375017281083f0266c4`. Исходный commit `41c03d7a637f4a8030b1e8616c8bf5b02c948e2c`; их полные Git trees совпадают (`6fee000836a70f1347b532a91d0800eaf1acba5e`). Сборка выполнялась до commit, на рабочем дереве поверх599e75a; исполняемые исходники затем зафиксированы без изменения runtime. Следующие evidence commits меняют только документы, APK/AAB не пересобираются ради SHA.
- [x] [GitHub v1.45](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.45) опубликован наc1cffbc; имена/size/digest обоих server assets совпадают с Downloads. Release binaries вне Git.
- [x] Backend `dpl_G8t6B8jWzPkDgNQJqzovwUCN4mnK` и frontend `dpl_H4a47r8DM69YaJ84kP7ojTvbx5LA`: READY/production наc1cffbc, SHA и aliases API/serbotalk.app подтверждены Vercel API. Health/app/privacy/delete-account200, anonymous payment options401; restored review endpoint присутствует в OpenAPI. Runtime error query за20мин вернул0 error events.
- [x] Настоящий вход прежним alias/password из уже заполненной Console проверен через UI на deployment URL (отдельный origin, owner-сессия основного домена не менялась). Вход успешен, Premium-функции доступны без оплаты; Settings показываетv1.45 и100 фраз. Секрет не выводился, в файлы/Git не сохранялся, временные UI-строки с ним очищены. Аудио/платежи/учебные ответы не отправлялись. Обычное открытие пресетной сессии приложением не выдаётся за тест распознавания.
- [x] На реальном production bundle28/28 browser scenarios с synthetic APIs прошли (review sign-in, login layout, diagnostics, RU/EN общие/личные фразы); эти mocks отдельно от настоящего входа. Screenshot настоящего Premium: `artifacts/android-1.45-production-review-premium.png`.
- [x] Google Play принял AAB55/1.45. Поскольку release1/54 был уже сохранён, создан следующий Open Testing **release2**, track4698673175551070067; в нём только55, прежний54 исключён. Заголовок `1.45 (55) — вход для проверки и Premium`, RU/EN notes2/2, rollout100% открытого теста,178 стран,unlimited testers,канал продолжен. Поддержка устройств не сократилась; единственное warning — mapping при выключенном R8.
- [x] App access: существующие username/password/разрешение тестирования сохранены; изменён только Other instructions (377/500символов), вход по Review access и фактический Premium100/день. Старую ошибочную формулировку no daily phrase limit убрали после сверки настоящего UI. Роли/квоты аккаунта не меняли.
- [x] Пять изменений и актуальная инструкция отправлены: Console показал **«Изменения на проверке»** для1.45/55. Очередь содержит55, географию и продолжение Open Testing, не54. Managed publishing off. Production не создавался; Alpha53 не менялся.
- [ ] Дождаться автоматических pre-review checks (на снимке до14мин; Console принял отправку и продолжит автоматически при отсутствии проблем), затем решения Google. Успешное завершение pre-review/доступность версии тестировщикам пока не заявляются.

English Other instructions:

> Open SerboTalk 1.45. Expand "Вход для проверки / Review access" below Google sign-in. Enter serbotalkreview and the password above, then tap "Sign in". Do not use Google sign-in. Premium is active: 100 exercises/day and personal topics/phrases. No purchase, MFA, one-time code or location check is required. Internet is required. Allow microphone access for speaking exercises.

URL выпуска: https://play.google.com/console/u/0/developers/6560020242950652568/app/4972357963448271381/tracks/4698673175551070067/releases/2/details . Opt-in после публикации: https://play.google.com/apps/testing/com.serbiantalk.trainer . Доказательство отправки: `artifacts/android-1.45-play-submitted.png`.
- [ ] Приёмка установленного из Play приложения на устройстве: парольный и Google-вход, новый/web-аккаунт, Premium/отсутствие оплаты, речь. Автотесты не заменяют аппаратную приёмку.

Предложенные notes RU: «Возвращён вход для проверки по логину и паролю. Premium в Android активируется автоматически. Улучшена диагностика ошибок проверки ответов; ваш ответ сохраняется для повтора.»

EN: «Restored review access with username and password. Premium activates automatically on Android. Improved answer-checking error diagnostics; your answer is kept for retry.»

Сборка содержит накопленные web-изменения без повторного backfill/миграций. Source SHA APK/deploy и последующие evidence-only commits фиксируются после публикации отдельно. Доказательства вне Git `artifacts/android-1.45-*`; перед работой все12 копий чистые на599e75a, recovery не требовался. После evidence merge повторяется синхронизация.


## 02.11.2026 — открытый тест доступен

- [x] Console Open Testing показывает1.45/code55 доступной неограниченному числу тестировщиков,178 стран,дата выпуска2ноября19:14 по Console. Ожидание pre-review/решения выше — историческое состояние.
- [x] Public opt-in URL открывает страницу SerboTalk/Become a tester; [ссылки и интеграция лендинга](landing-open-testing-2026-11-02.md).
- [ ] Физическая установка из Play и приёмка владельцем/внешними пользователями по-прежнему отдельно. APK/AAB/deploy этой записью не пересобираются.
