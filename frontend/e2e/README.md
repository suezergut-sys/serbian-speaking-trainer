# Изолированные UI-прогоны

`pnpm test:e2e:mock` запускает отдельный Chrome через Playwright и production build режима `e2e` с preview на `127.0.0.1:5179`. Все `/api/*` ответы определены в тесте; Supabase session существует только в тестовом browser context. Прогон проверяет выбор темы, первую фразу, синтетический STT, латинский/кириллический/смешанный ввод, результат и следующую видимую фразу. Неизвестный API endpoint приводит к ошибке теста. Реальный OpenAI и production-сервисы не вызываются.

Для сопоставимого набора из 30 измеренных проходов с тремя прогревами на каждый вариант раскладки:

```powershell
$env:E2E_SAMPLES_PER_SCRIPT = '10'
$env:E2E_WARMUP_PER_SCRIPT = '3'
pnpm test:e2e:mock
Remove-Item Env:E2E_SAMPLES_PER_SCRIPT, Env:E2E_WARMUP_PER_SCRIPT
node e2e/summary.mjs --platform web
```

Каждый проход создаёт отдельный browser context с одинаковым фиктивным каталогом. В `test-results/metrics/*.json` находятся только названия этапов, длительности, шаблоны путей API, HTTP-статусы, числовые `Server-Timing` и размеры ответов. `summary.json` содержит p50/p95. `test-results/` игнорируется Git. HAR, traces, screenshots, токены, текст ответов и аудио не сохраняются. `?perf` включает метки User Timing только на время конкретного запуска.

Для проверки настоящих локальных API/SQLite с тестовым входом и подменёнными AI/STT используйте из корня репозитория `scripts/run-testlab.ps1 web`. Скрипт читает учётные данные из игнорируемого `.env.testlab` и подключается только к `127.0.0.1:5178`, `:8765`, `:8766`. Тот же сценарий на установленном Android testlab debug APK запускается через `scripts/run-testlab.ps1 android`; это экспериментальный [Playwright Android WebView API](https://playwright.dev/docs/api/class-android). Драйвер требует включённый ADB и один доступный emulator/device. Android тест не является проверкой production Google OAuth, настоящего микрофона или OpenAI.

Перед сравнением производительности очистите `test-results/metrics`, запускайте серии отдельно и сохраняйте `summary.json` с пометкой версии, условий сети и типа прогона. Локальный поток создаёт попытки в изолированной БД, поэтому повторные серии на одной БД не являются сопоставимыми без восстановления одинакового начального состояния.
