# Бесплатный лимит 20 — 16.10.2026

- [x] Default `FREE_DAILY_PHRASE_LIMIT` = 20, пример env и README обновлены. В production backend env переопределения нет (проверено списком имён, без значений секретов).
- [x] API tests: после 10 и 19 использованных попыток ответ принимается; после 20 — HTTP 429; admin без лимита; на следующий UTC-день доступно 20. Учёт использованных ответов не сбрасывается.
- [x] Полный backend/scripts pytest: 302 passed, 8 skipped (проверки с отдельной PostgreSQL test DB), без внешних AI-запросов. После уточнения reset assertion test_users_api повторно passed (13 tests).
- [x] Component suite: 212 passed / 21 files. Settings и LegalPage проверяют лимит/тексты ru/en; lint, TypeScript и production build прошли. После обновления даты условий LegalPage/SettingsView повторно passed (5 tests), lint/typecheck/build повторно passed.
- [x] Browser: 6 checks — ru/en × desktop/mobile/Android-layout, условия и счётчик 17 из 20 при synthetic usage.used=3.
- [ ] Публикация backend/web и smoke на основном URL.
- [ ] Статический текст условий в будущей Android-сборке; APK/sync/version не менялись.

Изменения выполнены в отдельной рабочей копии на актуальном main, несвязанные локальные изменения сохранены. Нет новой схемы БД, миграций, сохранения аудио или AI-вызовов в тестах.
