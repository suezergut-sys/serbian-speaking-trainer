# Android 1.43 / versionCode 53 — 30.10.2026

Номер отдельно согласован владельцем. Android автоматически и бессрочно открывает обычный Premium (100 тренировок в сутки, 5 тем × 30 фраз). Новый и существующий web-аккаунт получает его при первом успешном входе в Android; доступ сохраняется в web. Web-only оплата и предварительная активация после «Я оплатил» сохранены. Отклонение web-платежа не отзывает Android Premium. Android не показывает покупку или ссылку на оплату.

## Реализация и ограничения

Авторизованный POST `/api/auth/me/android-premium` изменяет только текущий аккаунт, идемпотентно записывает дату активации, не меняет роль администратора. Grant — подарок по сигналу Android-клиента, а не Play Integrity/проверка покупки или происхождения установки. Авторизованный технический клиент может повторить запрос. Секреты в APK не добавляются. Без успешной активации клиент показывает восстановление/повтор входа и не предлагает оплату.

Privacy/terms/delete-account обновлены RU/EN, дата 30.10.2026. Учтены Premium, web-платежи, обработчики данных и ограниченное исключение debug-аудио. Удаление — по подтверждённому email-запросу, до 7 дней; operator workflow описан в [инструкции](account-deletion-runbook.md). Автоматической кнопки окончательного удаления нет. Для защиты от старого JWT хранится SHA-256 идентификатора до 30 дней; просроченные записи физически очищаются при следующей обработке удаления, не по расписанию.

Миграция `8fd7172bc955`: nullable provenance и marker table с PostgreSQL RLS без публичного доступа. Downgrade сохраняет Premium и запрещён при действующих deletion guards.

## Проверки

- [x] Backend/scripts: 489 passed, 9 skipped (PostgreSQL без тестового сервера); AI/Telegram mocked. После выделения deletion repository: 14 целевых tests passed. Дополнительно проверен реальный HTTP adapter удаления через MockTransport: id/email mismatch, invalid payload, повтор 404 и обязательная проверка отсутствия identity; финальный target suite 20 passed без внешних вызовов.
- [x] Frontend: 351 tests/40 files; lint, typecheck, production build. Дополнительная RU/EN регрессия восстановления после сбоя Android grant: App component suite 116 passed; lint/typecheck повторены для добавленных tests. Runtime после APK не менялся.
- [x] Browser: 24 Premium/context scenarios RU/EN; ещё 2 store/legal scenarios. Снимки — настоящий shared Android UI с синтетическим demo-контентом, 1080×1920, четыре на язык.
- [x] Production Android pipeline `pnpm android:cloud-apk`; signed Play AAB; packaged API `https://serbian-speaking-trainer-api.vercel.app`, одинаковые 11 assets APK/AAB, Browser/Share plugins, metadata min24/target36/code53/name1.43.
- [ ] Физический телефон: новый аккаунт, web→Android→web, resume, речь/микрофон, RU/EN. Browser mocks не заменяют эту приёмку.
- [ ] Удаление отдельного разрешённого production Auth-аккаунта: не выполнялось; каскады/сбой провайдера/повтор/старый JWT проверены синтетическими integration tests.

## Артефакты (вне Git)

`C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.43.apk`, 4 658 057 bytes, SHA-256 `03c0534ddb8a89c57436f8ffbc2f783aa97b3939ee42caf315f3c450c93a22c1`.

`C:/Users/MSumin/Downloads/SerboTalk-android-1.43.aab`, 3 494 032 bytes, SHA-256 `db04312ceabbf53113c429018c1fc16fd4f99db272d60f0eb58f49eb7a1eda61`.

APK cert SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`; AAB upload cert `aa7aa2702faafb0270d967d3f4d9a318f24ce26148084acfae304f55e378cf62`. Подписи совпадают с предыдущим выпуском. Локальные логи и JSON verification — `artifacts/android-1.43-*` (не коммитятся).

## Публикация

- [ ] GitHub PR/merge и актуальный чистый main, синхронизация неактивных worktrees.
- [x] Backend/web Vercel Ready на `f45fada58ad93e89fa5bfe8a10f78f0b932fb649`, 30.10.2026 11:35–11:43 UTC. Backend `dpl_7G5rwLYyLTYXsnMBrwRRb7sdCaEG`, frontend `dpl_9XoSo4owYmoPdtGXPEDWT4q7UGoi`; API metadata/aliases подтверждены. Alembic head `8fd7172bc955`, grant column и RLS/revokes проверены read-only в production. Health200, OpenAPI claim присутствует, анонимный claim401; `/app`, `/privacy`, `/terms`, `/delete-account` HTTP200. Public privacy/delete страницы открыты в Chrome; настоящая авторизованная сессия владельца загружает каталог/личные темы без ошибки. Supabase advisors: новая marker table intentionally deny-all (INFO no policy), существующий WARN leaked-password protection без изменения.
- [x] Play: карточка RU/EN, четыре свежих телефонных screenshots на язык, Data Safety и privacy URL сохранены в Console 30.10.2026.
- [ ] AAB 53 в существующем закрытом Alpha; отправка на проверку. Production access application не отправляется в рамках этого изменения.

Исторические [1.42](android-1.42-release.md) и [аудит Play](google-play-production-readiness-2026-10-30.md) сохранены. Их старое предложение оплаты Android заменено этим решением владельца. Исходный APK/AAB и последующие commits только с доказательствами должны учитываться отдельно; документация не требует пересборки.

## Исходники и доставка

[PR #178](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/178) merged: `f45fada58ad93e89fa5bfe8a10f78f0b932fb649`, исходный commit `f5014afd1de910074708c49a1d9c5200867ce081`. Frontend/Android source tree совпадает с собранным APK/AAB; последующие evidence-only commits не меняют runtime. [GitHub release v1.43](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.43), uploaded APK digest совпадает с локальным SHA-256. PR #176/#177 закрыты как superseded, исторические документы сохранены.

Play AAB принят: code53/name1.43, min24/target36, новых исключённых устройств 0 (телефонов12503, планшетов6812). Единственное warning — отсутствующий deobfuscation mapping; `minifyEnabled false`, mapping не генерируется. [Тексты карточки](google-play-store-1.43.md). Data Safety: email OTP добавлен к способам аккаунта, public deletion URL исправлен; audio optional (ввод голосом добровольный), non-ephemeral declaration сохранена из-за admin debug exception; user IDs security purpose дополнен. Finance category Android не добавлена: Android1.43 не собирает payment form; web-payment данные описаны в privacy.

30.10.2026: `adb devices` — физических устройств нет. Поэтому не заявляется реальная аппаратная приёмка или end-to-end grant с телефона. Operator service key не извлекался; ни один реальный аккаунт не удалён.
