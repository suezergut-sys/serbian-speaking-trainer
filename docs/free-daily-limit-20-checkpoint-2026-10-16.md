# Бесплатный лимит 20 — 16.10.2026

- [x] Default `FREE_DAILY_PHRASE_LIMIT` = 20, пример env и README обновлены. В production backend env переопределения нет (проверено списком имён, без значений секретов).
- [x] API tests: после 10 и 19 использованных попыток ответ принимается; после 20 — HTTP 429; admin без лимита; на следующий UTC-день доступно 20. Учёт использованных ответов не сбрасывается.
- [x] Полный backend/scripts pytest: 302 passed, 8 skipped (проверки с отдельной PostgreSQL test DB), без внешних AI-запросов. После уточнения reset assertion test_users_api повторно passed (13 tests).
- [x] Component suite: 212 passed / 21 files. Settings и LegalPage проверяют лимит/тексты ru/en; lint, TypeScript и production build прошли. После обновления даты условий LegalPage/SettingsView повторно passed (5 tests), lint/typecheck/build повторно passed.
- [x] Browser: 6 checks — ru/en × desktop/mobile/Android-layout, условия и счётчик 17 из 20 при synthetic usage.used=3.
- [x] [PR #112](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/112) merged, runtime `ee234ee1a7661fd379e0c6117318f045b67d9618`. Оба deployments READY/production/main, SHA проверен Vercel list, основные aliases — inspect.
- [x] Backend `dpl_6YtpiDNwmw7XseoZRNt4mU9wgyGB`: [deployment](https://serbian-speaking-trainer-1by2389cw-suezerguts-projects.vercel.app), [основной API](https://serbian-speaking-trainer-api.vercel.app). Migration/seed build завершён, добавлено 0 записей каталога. Production env не содержит переопределения лимита; используется default 20 из опубликованного config.py.
- [x] Frontend `dpl_CoMTBb53BC5dwyHrMrLUKTNmxPYW`: [deployment](https://serbian-speaking-trainer-e7vpr786o-suezerguts-projects.vercel.app), [основной web](https://serbian-speaking-trainer.vercel.app).
- [x] 16.10.2026, 17:52 МСК: 6/6 production browser checks ru/en desktop/mobile/Capacitor-layout — новый текст условий и счётчик 17/20. Настоящий production bundle, synthetic API/account; реальный свободный аккаунт и AI не использовались. Граница 20 проверена integration tests, production подтверждён SHA/env/default.
- [x] HTTP web /, /privacy, /terms, /delete-account — 200; backend /api/health — 200, неавторизованный /api/auth/me — 401. Error logs обоих deployments за 10 минут пусты.
- [ ] Статический текст условий в будущей Android-сборке; APK/sync/version не менялись.

Изменения выполнены в отдельной рабочей копии на актуальном main, несвязанные локальные изменения сохранены. Нет новой схемы БД, миграций, сохранения аудио или AI-вызовов в тестах.
