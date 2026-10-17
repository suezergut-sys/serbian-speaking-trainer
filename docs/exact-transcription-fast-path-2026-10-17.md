# Пропуск помощи для эталонной расшифровки — 17.10.2026

## Изменение

При включённой помощи `TranscriptionService` теперь сравнивает transcript с canonical и сохранёнными intended variants до вызова assistance provider. Используется та же `normalized_serbian_words`, по которой `validate_analysis` уже отбрасывал любые предложения исправлений для совпавшего текста: Unicode NFC, сербская латиница/кириллица, регистр, пробелы и пунктуация. Диакритика, слова, отрицания и числа сохраняют значение; fuzzy matching не добавлялся. Пустая нормализованная строка не считается совпадением.

Для совпадения возвращается существующий совместимый ответ `{"text": ...}`. Исходная расшифровка сохраняется с прежним приведением к сербской латинице; эталон не подставляется вместо ответа. Нет model call, receipt и DB commit помощи. Кнопка проверки и оценка работают как раньше; `transcription_assisted=false`. Для остальных ответов помощь, предложения, receipts, ручная правка и scoring прежние. Неподдерживаемый алфавит/review_required проверяются до этой ветки.

Новых API полей, UI-строк, моделей, env и миграций нет. Общий RU/EN web/Android UI принимает уже существующий response contract. Telegram не менялся. Android sync/build, metadata, package version и APK не менялись; серверное ускорение доступно существующим клиентам после backend deploy.

## Проверки

- [x] Точечные backend: 59 passed, включая exact/variant, RU/EN, кириллицу, Unicode decomposition, регистр/пробелы, отсутствие receipts и последующую успешную проверку.
- [x] Nonmatch regression: диакритика, отрицание, числа, неизвестный вариант, отсутствие эталона и пустые нормализованные строки продолжают вызывать assistance.
- [x] Полный backend: 288 passed, 8 skipped; scripts/testing: 43 passed; Node resilience guards: 5 passed.
- [x] Frontend 231 passed; lint, TypeScript и production build passed. Прежнее предупреждение Vite о chunk >500 KB сохраняется.
- [x] Browser: 6/6 — English desktop/mobile/shared Android layout, RU полный voice mock flow, dynamic assistance/fallback web и Android layout. Синтетические данные, OpenAI не вызывается.
- [x] Ручное чтение diff: ветка совпадения использует тот же comparator, что прежняя валидация; nonmatch и обязательная script-проверка сохранены. Секретов/аудио/БД в Git нет.

## Скорость

Парный offline benchmark: runner поддерживает `--backend` для неизменяемого снимка backend внутри workspace. До — Git export `927c14be3d420f43b312b8e5a23932bfd40113bd`, после — новая реализация. Один seed/каталог и fresh synthetic user на каждый сценарий; 3 прогрева + 20 измерений, 100 мс на каждый mock AI call. Прогоны выполняются последовательно после основного test suite. Это TestClient/file SQLite, без реального auth, browser/network/cold start и OpenAI.

До: `artifacts/testlab/practice-pipeline/ce332b33-2c72-4840-bc6c-ea035dc1d444/report.json`. После: `artifacts/testlab/practice-pipeline/3d09292a-418c-42a8-b226-701a98c2763e/report.json`.

| Включённая помощь | До p50 / p95, мс | После p50 / p95, мс |
|---|---:|---:|
| Эталон: расшифровка | 219,38 / 224,72 | 107,59 / 110,70 |
| Эталон: расшифровка + проверка | 257,50 / 266,05 | 147,10 / 163,15 |
| Альтернатива: расшифровка | 219,06 / 224,88 | 219,31 / 226,56 |
| Альтернатива: расшифровка + проверка | 360,83 / 372,72 | 358,24 / 378,51 |

Сокращение p50 для эталонного пути **42,9%**, для самой расшифровки **51,0%**. AI calls для STT эталона: 2 → 1, для nonmatch: 2 → 2; локальная проверка эталона по-прежнему 0 calls. Ключевой эффект — устранён один вызов; проценты остаются mock-результатом и не обещанием production latency. Рост p95 альтернативы примерно на 1,6% в малой выборке не доказывает изменения этой неизменённой ветки. [Исходный аудит и ограничения](web-performance-audit-2026-10-17.md).

## Публикация

- [ ] GitHub PR/merge.
- [ ] Vercel backend READY на merged SHA и production alias.
- [ ] Production web smoke RU/EN и HTTP/auth smoke; runtime error logs.
- [ ] Приёмка владельцем на реальной речи; live STT/AI во время автоматических проверок не вызывается.

Android-сборка не запрошена и не выполняется.
