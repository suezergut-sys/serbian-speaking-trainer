# Android 1.43 / versionCode 53 — 30.10.2026

Номер отдельно согласован владельцем. Android автоматически и бессрочно открывает обычный Premium (100 тренировок в сутки, 5 тем × 30 фраз). Новый и существующий web-аккаунт получает его при первом успешном входе в Android; доступ сохраняется в web. Web-only оплата и предварительная активация после «Я оплатил» сохранены. Отклонение web-платежа не отзывает Android Premium. Android не показывает покупку или ссылку на оплату.

## Реализация и ограничения

Авторизованный POST `/api/auth/me/android-premium` изменяет только текущий аккаунт, идемпотентно записывает дату активации, не меняет роль администратора. Grant — подарок по сигналу Android-клиента, а не Play Integrity/проверка покупки или происхождения установки. Авторизованный технический клиент может повторить запрос. Секреты в APK не добавляются. Без успешной активации клиент показывает восстановление/повтор входа и не предлагает оплату.

Privacy/terms/delete-account обновлены RU/EN, дата 30.10.2026. Учтены Premium, web-платежи, обработчики данных и ограниченное исключение debug-аудио. Удаление — по подтверждённому email-запросу, до 7 дней; operator workflow описан в [инструкции](account-deletion-runbook.md). Автоматической кнопки окончательного удаления нет. Для защиты от старого JWT хранится SHA-256 идентификатора до 30 дней; просроченные записи физически очищаются при следующей обработке удаления, не по расписанию.

Миграция `8fd7172bc955`: nullable provenance и marker table с PostgreSQL RLS без публичного доступа. Downgrade сохраняет Premium и запрещён при действующих deletion guards.

## Проверки

- [x] Backend/scripts: 489 passed, 9 skipped (PostgreSQL без тестового сервера); AI/Telegram mocked. После выделения deletion repository: 14 целевых tests passed.
- [x] Frontend: 351 tests/40 files; lint, typecheck, production build.
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
- [ ] Backend/web Vercel Ready, миграция и реальные public URLs.
- [ ] Play: карточка RU/EN, четыре свежих телефонных screenshots на язык, Data Safety и privacy URL.
- [ ] AAB 53 в существующем закрытом Alpha; отправка на проверку. Production access application не отправляется в рамках этого изменения.

Исторические [1.42](android-1.42-release.md) и [аудит Play](google-play-production-readiness-2026-10-30.md) сохранены. Их старое предложение оплаты Android заменено этим решением владельца. Исходный APK/AAB и последующие commits только с доказательствами должны учитываться отдельно; документация не требует пересборки.
