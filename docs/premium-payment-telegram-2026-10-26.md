# Telegram о платёжной заявке Premium — 26.10.2026

Владелец попросил уведомлять в Telegram, когда пользователь сообщил об оплате и получил Premium. До изменения уведомления охватывали регистрацию, обратную связь и учебные события, но не payment report.

- Событие — первый успешный `POST /api/payments/{id}/report`, а не создание awaiting_payment при клике на карточку реквизитов.
- `PaymentService` после flush ставит сообщение в существующую очередь `notify_after_commit`. Router передаёт тот же Settings, который содержит payment/Telegram конфигурацию.
- Сообщение: email аккаунта, уникальный номер заявки, страна, способ, ожидаемая сумма/валюта, указанная пользователем сумма/валюта, факт немедленного Premium (либо уже действующего доступа), «Поступление денег ещё не подтверждено» и ссылка на приложение для проверки.
- Нет банковских/телефонных реквизитов получателя, transaction ID, аудио и секретов. Формат plain text; уведомление владельца на русском, как существующие Telegram alerts. Тексты RU/EN web/Android не менялись.
- Повторный report awaiting_review/confirmed возвращает сохранённую заявку до постановки сообщения. Существующая блокировка пользователя защищает конкурентные запросы; подтверждение администратора не создаёт второй alert.
- Только commit запускает отправку; rollback очищает очередь. Без Telegram-настроек сообщение не ставится. Сбой доставки не откатывает заявку или Premium.
- Используется существующий best-effort sender: timeout, безопасная ошибка, без retry. Это не durable outbox: доставка при аварийном завершении процесса не гарантирована. Новые очереди/миграции/зависимости не добавлены.

## Проверки и публикация

- [x] 30 целевых payment/notification tests passed, все отправки Telegram и AI mocked.
- [x] Локальная конфигурация Telegram и sensitive production keys присутствуют; значения не выводились и не коммитились, получатель не менялся.
- [x] Финальный backend/scripts quality gate: 435 passed, 9 skipped (isolated PostgreSQL test DB unavailable), 70.08s.
- [x] [PR #164](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/164) merged. Backend runtime SHA `0da638215c36bd06aa840d0662841745464c03cc`; deployment `dpl_GHJTTCgf1H4oTtKVEgizL6dXA7Ay`, [URL](https://serbian-speaking-trainer-mhx74ae1h-suezerguts-projects.vercel.app), READY/production/main. Production alias `serbian-speaking-trainer-api.vercel.app` и meta.gitCommitSha подтверждены. Build/seed завершены, новых миграций нет.
- [x] Через production web rewrite API health — 200; anonymous payments/options и admin/payments — 401. Runtime error log rows: 0 за проверенный интервал. Backend-only изменение; frontend остаётся на проверенном fceb203, не развёртывался повторно.
- [x] Доказательства metadata/HTTP находятся в ignored `artifacts/premium-payment-telegram/release-checks.json`; секреты и chat ID в них не входят.
- [x] Ручная тестовая доставка: настоящий sender и after-commit hook, synthetic User/PaymentRequest в SQLite in-memory, явный префикс «ТЕСТ УВЕДОМЛЕНИЯ — реальной оплаты и production-заявки нет». Telegram вернул ok; повторный report не отправил дубль. Production аккаунты/оплаты не менялись.
- [ ] Приёмка настоящей заявки владельцем отдельно от синтетических проверок.
- [x] Web bundle, Android 1.40/code50, Capacitor и APK не менялись. Backend-уведомления доступны клиентам через общий API без нового APK.

После фиксации документации выполняется финальная синхронизация всех 12 чистых worktree с origin/main и запись `artifacts/premium-payment-telegram/worktrees-final.json`. Активная чужая работа проекта не переключается, прежние ветки сохраняются; recovery/WIP не требовались. Последующий documentation-only main отделён от backend runtime SHA выше и не требует повторного deploy/APK.
