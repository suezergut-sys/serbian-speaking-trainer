# Контрольный выпуск SerboTalk 1.16 — 01.10.2026

Версия `1.16` / `versionCode 26` отдельно согласована владельцем. Это контрольный APK для установки поверх прежней версии; debug-подпись совпадает с 1.15. Выпуск не закрывает все задачи P1 или ручную приёмку.

## Состав

- P1.2: клиентская блокировка ответа/подсказок при проверке, retry с прежним ID, мгновенное слово-подсказка и дедупликация фонового сохранения. Backend lease/квота опубликованы ранее: [PR #33](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/33).
- P1.3: агрегатный счётчик повторения вместо полного списка; поздние ответы не подменяют актуальное состояние. Web/backend: [PR #35](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/35).
- P1.4: явный повтор каталога, ручной ответ после ошибки mic/STT, сохранение draft при повторной записи, защита правки от поздней расшифровки и retry prefetch по первому нажатию. [PR #37](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/37).
- P1.5: остановка mic/STT при сворачивании и уходе из практики с сохранением текста; cleanup recorder при таймаутах/ошибках; отправленная оценка продолжает выполняться. [PR #39](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/39).
- Все прежние исправления P0, нормализация Unicode/раскладки, выбранный сербский алфавит, отсутствие баров навыков и возврат к новой фразе после длинного разбора включены.

## Артефакт

- Файл: `SerboTalk-andorid16-1.16.apk`, package `com.serbiantalk.trainer`, min SDK 24, target SDK 36.
- Размер: **4 420 784 байта**.
- SHA-256: `C018FF32E840EA2F1A8C4AC1D1C556350C358C84D25E2EE38AAA96C4E74F9D35`.
- Сертификат SHA-256: `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`; apksigner verify прошёл, сертификат совпадает с 1.15.
- Production API: `https://serbian-speaking-trainer-api.vercel.app`. HTTPS scheme включён, mixed content выключен. Production APK не содержит testlab.html, локальный testlab key или постоянный OpenAI API key.
- Отдельный lab package `com.serbiantalk.trainer.testlab` не публикуется как обычный релиз. Его SHA-256: `AF65105F2ADF663B71CD84313C92CF8E73BA10A7CEA3F0BA1D38FEC538ACC5AC`.
- APK и сборочные артефакты не входят в Git.

## Проверки

- [x] 77 frontend tests, TypeScript, ESLint, production Android build, Capacitor sync, Gradle `assembleProdDebug` и отдельный `assembleLabDebug`. Повторный web mock regression: 11/11 (lifecycle 2, практика/алфавиты 3, network 6).
- [x] Unit test проверки APK 1/1; guard фактических prod/lab APK прошёл; metadata обоих выпусков 1.16/code 26, подпись production проверена.
- [x] Независимое review версии/конфигурации/bundle принято: production native assets совпадают с dist; все завершённые функции присутствуют.
- [x] Оба APK установлены через `install -r` в AVD SerboTalk_API_36; данные обычного приложения не очищались.
- [x] Android lab 1.16: native Home/resume во время синтетической записи, App active/inactive events, recorder/track stop ровно один раз, сохранение draft, отсутствие дополнительного STT при возврате и явный retry прошли.
- [x] Задержанный POST hint завершился 503 после перехода: подсказка показана сразу, единственный запрос hint, оценка 92% и следующая фраза доступны до завершения сохранения; ошибок после позднего 503 нет.
- [x] Отдельный обычный Android lab flow (расшифровка → ручная правка → оценка → новая фраза) прошёл. Production APK 1.16/code 26 запускается: Google-вход виден, lab-вход отсутствует; данные обычного приложения не очищались.
- [x] Код опубликован через [PR #41](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/41), release SHA `bc59c25519313cdaf2213392579fa54015bc5235`. [GitHub release v1.16](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.16) опубликован с обычным APK; asset size/digest совпали с локальным файлом.
- [x] Frontend deployment `dpl_2ZtTrn147yaJFFsT4dniCmfpttoo` — READY, production alias указывает на этот release SHA; повторный публичный Chrome smoke прошёл.

## Публикация

- [Web production](https://serbian-speaking-trainer.vercel.app); [deployment](https://serbian-speaking-trainer-donmrjedk-suezerguts-projects.vercel.app).
- [Скачать APK 1.16](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.16/SerboTalk-andorid16-1.16.apk).
- Локальная копия: `C:/Users/MSumin/Codex проекты локальные/Serbian Speaking Trainer/artifacts/SerboTalk-andorid16-1.16.apk`.
- Сборка содержит те же согласованные runtime/version файлы, что release SHA; после сборки менялись только tests/docs. Миграций или backend-изменений в release PR нет.

## Production и границы проверки

Завершённые runtime-срезы опубликованы: web release `bc59c25519313cdaf2213392579fa54015bc5235` (bundle `index-DZ57lPfv.js` совпадает с APK); backend `edb0b74dc1ab4daf8711c9cd4d77c535f14ad875`, deployment `dpl_dUS3LpucDLW84GTWpy57wkaSSfx9` — READY. В PR #41 backend не менялся, поэтому его повторная сборка не требовалась. Публичная повторная проверка 01.10.2026: Chrome 154, `/`, `/privacy`, `/terms` — 200, testlab.html — 404, page errors — 0; API health — 200. В обычном web bundle есть все новые функции и нет lab-конфигурации.

Автоматические Android-сценарии используют локальный backend, подписанную тестовую сессию и fake AI/STT. Синтетическое аудио существует только в памяти; пользовательский голос и OpenAI budget не используются. Успех lab не означает проверку Google OAuth, настоящего STT, физических разрешений, отключения всей сети или скорости облачного AI. Последние сопоставимые замеры — в P1 checkpoint-документах; этот smoke не выдаётся за benchmark.

## Ручная приёмка владельца

- [ ] Установить поверх 1.15 и проверить Google-вход, выбранный алфавит, темы и статистику.
- [ ] Записать настоящий ответ в обоих алфавитах; исправить русскую `а` внутри латинского слова, проверить отсутствие ложного штрафа за раскладку и сохранение настоящей ошибки.
- [ ] Во время записи и ожидания STT свернуть/вернуть приложение: фраза и исправленный текст должны сохраниться, скрытая запись прекратиться, новая запись/ручной ответ доступны.
- [ ] Проверить задержанную подсказку, повтор проверки после сети и следующую фразу без дубликатов и двойного штрафа.
- [ ] Проверить системный Back, свайпы, клавиатуру на небольшом экране, отказ/отзыв разрешения микрофона и длительное отключение сети.

Статусы реализации, публикации, Android и приёмки ведутся отдельно в [audit-roadmap.md](audit-roadmap.md).
