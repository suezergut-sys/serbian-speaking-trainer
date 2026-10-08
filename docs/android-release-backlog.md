# Android-релизы и проверки

Последняя контрольная Android-версия: `1.17` (`versionCode 27`), опубликована 01.10.2026. Состав, проверки и открытая ручная приёмка — в [android-1.17-release.md](android-1.17-release.md); предыдущая 1.16 описана в [android-1.16-release.md](android-1.16-release.md). Исторические пункты ниже сохраняют исходные даты; текущий перенос отмечается отдельно.

Этот список хранит изменения для следующих Android-сборок и проверки собранной версии. Следующее повышение версии и сборка APK требуют отдельной команды владельца.

## Выпущено в 1.5

- [x] Скрыть панель ручной настройки backend и подсказку про эмулятор от обычных пользователей; оставить доступ только администратору.
- [x] Добавить отдельный минималистичный Android-интерфейс из трёх свайп-панелей: темы, тренировка и статистика.

## Выпущено в 1.6

- [x] Перенести в Android web bundle запуск тренировки одним `POST /api/sessions/start`; обычная тема и карусель повторения проверены компонентными тестами.
- [x] Перенести в Android web bundle мгновенный показ пословных переводов из ответа упражнения и фоновую запись слова в неизученные; сценарий проверен компонентным тестом.
- [x] Получить серверное ускорение первой фразы за счёт пакетной загрузки навыков и переиспользования соединения с БД.

## Выпущено в 1.7

- [x] Перенести голосовой ответ без поля ввода до расшифровки и редактирование распознанного текста.
- [x] Добавить панель настроек и выбор латиницы/кириллицы для сербского текста.

## Выпущено в 1.8

- [x] Перенести web bundle с отложенной загрузкой статистики, быстрым переходом между панелями и фоновой подготовкой следующей фразы после оценки.
- [x] Проверить компонентными тестами переход к следующей фразе при удачной подготовке, ошибке сети и завершении карусели повторения; на эмуляторе без передачи голоса проверить выбор темы и первую фразу.
- [x] Серверные ускорения (локальная проверка ES256 JWT и один запрос для навыков со статусами) доступны выпущенному APK без пересборки после публикации backend.

## Локальная сборка 1.11

- [x] Включить случайный выбор фразы из доступного каталога и цикл изучения из трёх оценок от 95%.
- [x] Включить интервалы повторения 3/2/1 день с прежним ростом.
- [x] Убрать повтор исходной русской фразы после проверки и выровнять размер трёх фраз.
- [x] Показать карточку повторения тем же шаблоном, с круглой иконкой стрелок; убрать заголовок панели тем и уменьшить высоту карточек.
- [x] Собрать APK `SerboTalk-andorid16-1.11.apk` и установить поверх 1.10 на эмуляторе.
- [x] Опубликовать backend с новой логикой после разрешения владельца; production API проверен через `/api/health` и защиту `/api/topics`.

## Локальная сборка 1.12

- [x] Выбор непустой темы сразу запускает первую фразу; тема и повторение показывают анимацию «Подготовка фразы».
- [x] Статистика показывает текущую неделю с отдельными столбиками попыток и выученных фраз.
- [x] Собран и установлен на эмулятор API 36 `SerboTalk-andorid16-1.12.apk` (`versionCode 22`). Запуск и экран входа проверены, учебный сценарий после Google-входа остаётся непроверенным.

## Ожидают Android-релиза

- [ ] Перенести P0 web-интерфейс практики: общая карточка фразы, ответа, результата и следующего действия; сворачиваемые дополнительные формы; защита от поздних ответов.
- [ ] Учесть серверную идемпотентность попытки и следующей фразы через необязательный `client_request_id`, сохранив совместимость старых клиентов.
- [ ] Проверить на Android завершение обычной сессии после заданного числа упражнений (обычно 10) отдельно от free дневного лимита в 10 сохранённых попыток за UTC сутки; лимит применяется ко всем режимам, включая повторение. Проверить безопасную ошибку AI без фиктивной оценки/изменения прогресса.
- [ ] Выполнить независимое ревью и production-проверку до переноса в Android; ручная приёмка остаётся обязательной.

Владелец согласовал контрольную версию `1.13` (`versionCode 23`) 2026-09-30. Сборка и проверка APK будут зафиксированы в `docs/p0-checkpoint.md`; последняя проверенная сборка пока 1.12.

На авторизованном Android-эмуляторе до изменений замерены 1,39–1,41 с для тёплого старта фразы, 1,15–1,32 с для запроса следующей фразы и 0,56–0,58 с для перехода между панелями. Прямой замер кнопки «Следующая» требовал передачи голоса в эмулятор и заменён запросом того же endpoint из авторизованного WebView.

## Чек-лист будущего релиза

- Синхронизировать накопленный web bundle с Capacitor.
- Проверить каждый пункт на Android и отметить его выполненным.
- Использовать согласованную контрольную версию `1.13`; не переходить на `2.x` без явной команды.
- Собрать APK с именем `SerboTalk-andorid16-<версия>.apk` и выполнить mobile smoke-test.

## Контрольная сборка P0 — 1.13

- [x] Перенесён актуальный web bundle с P0 и собран `SerboTalk-andorid16-1.13.apk`; метаданные и подпись проверены.
- [ ] Проверить на устройстве голос, повторные запросы, завершение и пустую тему; подтвердить ручную приёмку P0.

## Накоплено после 1.13 — корректность расшифровки и подсветки

- [x] Перенесена NFC-нормализация сербского текста перед отображением, транслитерацией и отправкой ответа в APK 1.14.
- [x] Перенесено использование текущего алфавита при завершении STT, включая смену алфавита во время запроса, в APK 1.14.
- [x] Перенесена защита подсветки от замечаний, различающихся только Unicode или сербским алфавитом, в APK 1.14; сохранение реальной лишней буквы проверено компонентными тестами.
- [ ] На устройстве проверить `Platiću bankovnom karticom.` и `Alergičan sam na neke antibiotike.` в обоих алфавитах; проверить, что ошибочная расшифровка остаётся редактируемой.

Серверная проверка обоснованности оценки доступна APK 1.13 после backend deploy. В APK 1.14 также включены клиентские исправления, удаление баров навыков и нормализация ручной раскладки; ручная проверка на устройстве остаётся открытой.

## Контрольная версия 1.15 — начало P1

- [x] Версия 1.15/code 25 согласована владельцем отдельно.
- [x] Production и lab разделены по application ID и assets; тестовый вход отсутствует в обычном APK.
- [x] Добавлены опциональные UI timings и автоматический возврат к новой фразе после длинного разбора.
- [x] Итоговая сборка, проверка подписи и SHA зафиксированы в `docs/p1-testlab-checkpoint.md`; установка поверх предыдущего приложения в AVD прошла без очистки данных.
- [ ] Проверить на физическом телефоне Google-вход, настоящий STT, обе раскладки и переход от длинного разбора к следующей фразе.

## Накоплено для следующего контрольного выпуска после P1.2/P1.4

- [x] 01.10.2026: перенесены в APK 1.16 блокировка ответа/hints, немедленная подсказка, дедупликация фонового POST и retry той же попытки. [Доказательства](android-1.16-release.md).
- [ ] На Android проверить поведение при retryable `409 attempt_in_progress`/`Retry-After`, потере сети, позднем ответе, задержке фонового сохранения подсказки и сохранении ответа после ошибки.
- [ ] Проверить, что повторные подсказки не применяют штраф дважды, а валидированные открытые слова сохраняются в итоговой попытке.
- [x] Backend резервация/lease опубликована через PR #33 и доступна прежним клиентам; установленный lab APK 1.15 прошёл полный цикл с обновлённым локальным backend.
- [ ] Отдельно проверить Android production сценарий после deploy и новый клиент подсказок после переноса.

Этот web-срез не изменяет `versionName 1.15` / `versionCode 25` и не собирает APK. Накопленный список переносится только в отдельно согласованный контрольный выпуск; подробности локальных проверок и незакрытых production условий: [`docs/p1-concurrency-checkpoint.md`](p1-concurrency-checkpoint.md).

## Накоплено после P1.3 — компактный счётчик повторения

- [x] 01.10.2026: перенесены в APK 1.16 агрегатный счётчик повторения, защита поздних ответов и обновление после добавления/оценки. [Доказательства](android-1.16-release.md).
- [ ] Проверить новый клиент на Android: пустая очередь, просроченные карточки, повторное добавление, возврат приложения и смена аккаунта.
- [x] 30.09.2026: полный локальный flow прежнего установленного Android lab 1.15 с обновлённым backend прошёл. Это проверка обратной совместимости; APK не пересобирался. [Доказательства](p1-review-summary-checkpoint.md).
- [x] Backend списка/счётчика опубликован через PR #35; старый контракт сохранён. Авторизованный production flow Android проверяется отдельно.

## Накоплено после P1.4 — восстановление запросов

- [x] 01.10.2026: в APK 1.16 перенесены повтор загрузки тем и ручной ввод после ошибки микрофона/STT. [Доказательства](android-1.16-release.md).
- [x] 01.10.2026: в APK 1.16 перенесены сохранение draft, защита ручной правки от позднего transcript и блокировка оценки во время voice-запроса; component tests прошли. [Доказательства](android-1.16-release.md).
- [x] 01.10.2026: retry prefetch по первому нажатию с тем же ID перенесён в APK 1.16; lost-response/dedup проверены ранее в web. [Доказательства](android-1.16-release.md).
- [x] 01.10.2026: обычный full flow установленного lab 1.15 прошёл с текущим backend. Это прежний bundle, не новый Android-клиент. Версия/code и APK не менялись. [Доказательства](p1-network-checkpoint.md).

## Накоплено P1.5 — микрофон и lifecycle

- [x] 01.10.2026: остановка mic/STT при appStateChange, скрытии документа и уходе из практики перенесена в APK 1.16. [Доказательства](android-1.16-release.md).
- [ ] Проверить background/resume в connecting/recording/STT и при проверке ответа: tracks освобождены, черновик/фраза сохранены, поздний transcript игнорируется, оценка не отправляется дважды.
- [x] 01.10.2026: cleanup VoiceRecorder при таймауте/ошибке старта или завершения перенесён в APK 1.16; component tests прошли. [Доказательства](android-1.16-release.md).
- [ ] Проверить реальные разрешения и прерывания микрофона на физическом устройстве.

В этом срезе Android 1.15/code 25, native assets и APK не меняются. Синтетические component/native-event тесты не заменяют реальный Android lifecycle. [Контрольная точка](p1-lifecycle-checkpoint.md).

## Контрольный выпуск 1.16 — 01.10.2026

- [x] Версия 1.16/code 26 согласована отдельно; весь завершённый клиентский набор P1.2–P1.5 перенесён и собран.
- [x] Production и lab APK проверены на разделение конфигурации; подпись production совпадает с 1.15; обновление обеих установок в AVD API 36 прошло.
- [x] Android 1.16 native Home/resume с synthetic mic, сохранение draft, retry, hint-save race и отдельный полный lab flow прошли; production APK login smoke прошёл без очистки данных. [Доказательства](android-1.16-release.md).
- [x] 01.10.2026: [release v1.16](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.16) опубликован, web READY на release SHA; URL/hash/signature в [android-1.16-release.md](android-1.16-release.md).
- [ ] Ручная приёмка физического телефона: Google, настоящий STT, разрешения, системный Back/свайпы, длительное отключение сети, оба алфавита.

## Перенесено в 1.17 — точная подсветка и домик

- [x] Перенести word-level подсветку evidence/correction с исключением неизменённых соседних слов в APK 1.17; AVD fixture `jutreneg` / `јутренег` подтвердил выделение точного слова в обоих алфавитах. [Доказательства](android-1.17-release.md).
- [x] Перенести удаление быстрого chooser: домик открывает темы, сохраняет session/exercise/draft; native taps/swipe проверены на AVD 1.17. [Доказательства](android-1.17-release.md).
- [ ] Проверить подсветку и возврат домой на физическом телефоне с настоящей практикой/голосом.
- [ ] Проверить прежний payload статистики с новым backend в Android; backend projection не требует новой версии клиента. [Проверки и замеры](p1-word-highlights-statistics-checkpoint.md).

## Перенесено в 1.17 — системный Back

- [x] Перенести обработчик Back: settings/stats → practice при текущей сессии, practice → topics, topics → exit; AVD проверил сохранение draft, IME и native exit. [Доказательства](android-1.17-release.md).
- [ ] Проверить IME/Back и сохранение draft на физическом телефоне.
- [x] 01.10.2026: AVD/1.16: реальное отключение Wi-Fi/data на 120 секунд, retry с прежним ID, synthetic connecting/STT, 413 и signed fixture expiry/refresh прошли. [Доказательства](p1-pooler-android-checkpoint.md).

- [x] 01.10.2026: полный native resilience на AVD/1.16: grading Home/resume без дублирования и OS mic denial с ручным вводом; исходные радио/permission восстановлены. Итоговый повтор offline 30 секунд, длительный 120 секунд подтверждён отдельными предыдущими прогонами. Настоящая запись на телефоне остаётся открытой.

## Контрольная версия 1.17 — опубликована

- [x] Сформированы production/lab APK 1.17/code 27; metadata, prod/lab guards, production подпись и install-r на AVD API 36 проверены. Артефакты и digest: [checkpoint 1.17](android-1.17-release.md).
- [x] В сборке находится накопленный клиентский bundle: точная подсветка evidence/correction, домик с сохранением текущей практики и системный Back. Предшествующие web/backend доказательства: [PR #43](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/43), [PR #45](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/45).
- [x] Reviewer финально подтвердил diff без блокеров; syntax runner прошёл. На 1.17 проверены radio-off/retry, IME/System Back, Settings/Stats Back, домик/сохранение draft, swipe, background connecting/STT, 413 recovery, grading Home/resume и подсветка `jutreneg` в обоих алфавитах.
- [x] На APK 1.17 прошёл полный AVD resilience run и `android-lifecycle.mjs` (lifecycle/hint-race), оба exit 0: permission denial/revoke, expired fixture 401 → новая сессия, native exit и cleanup. Успешный полный запуск после relaunch QEMU включал offline 30 s; отдельный первый прогон подтвердил offline 120 s + retry до более позднего locator failure. Feature acceptance выполнена с fixtures/mock; реальный STT/OAuth не проверялись.
- [x] Production APK 1.17 smoke подтвердил видимый Google login, отсутствие testlab login и сохранность app data; OAuth не завершён. Public Chrome 154 smoke прошёл: privacy/terms 200, testlab 404, page errors 0.
- [x] GitHub release v1.17 опубликован через [PR #48](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/48), release SHA `eba91beb4532f2f2d8dd14afa699d42648d34d05`; серверный asset digest/size совпал. [Доказательства](android-1.17-release.md).
- [x] Full native resilience/lifecycle suite, production login-surface smoke и public Chrome 154 smoke прошли. Подробности и границы: [checkpoint 1.17](android-1.17-release.md).
- [ ] Обычный Android practice flow не подтверждён: до 15 s bounded-polling patch UiAutomator получил transient `device.info=null` после API 200; после patch следующий прогон потерял AVD при QEMU crash. Повторный AVD запуск приостановлен по инфраструктурной причине.
- [ ] Новых Android performance metrics нет; не выводить скорость из smoke или HTTP status.
- [x] Vercel frontend deployment `dpl_4JsuVfsmSLj9nWSkyhvj1cRWjzYw` READY на SHA `eba91beb4532f2f2d8dd14afa699d42648d34d05`; production alias и deployment URL, Chrome/IAB/API проверки зафиксированы в [checkpoint 1.17](android-1.17-release.md).
- [ ] Обычный Android practice UI flow и физическая ручная приёмка остаются открытыми; Google OAuth и настоящий STT не проходили.

Версия 1.17 опубликована как обычный production APK; lab APK не входит в release. Vercel READY evidence зафиксирован в checkpoint. Контрольная версия не закрывает открытые пункты P0/P1 и физическую ручную приёмку.

## Накоплено после 1.17 — веб-срез P1/P2

- [x] Реализованы и проверены в web отложенные Statistics/Admin с retry, системный шрифт, страницы фраз 10/50 и retry/stale-response guard. [Checkpoint](p2-web-checkpoint.md), [PR #50](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/50).
- [x] 02.10.2026: клиентский набор перенесён в опубликованный APK 1.18; assets/signature/metadata проверены. [Checkpoint](android-1.18-release.md).
- [ ] Проверить чтение обоих алфавитов и lazy chunks в WebView, Back/свайпы, draft и повтор загрузки на устройстве.
- [ ] Ручная Android-приёмка и замеры остаются открытыми; [телефонные тесты остановлены](p1-physical-android-checkpoint.md).

APK 1.17/code27, native assets и package version в этом срезе не менялись. Backend admin aggregate совместим с прежним клиентом; новую сборку сам по себе не требует.

## Накоплено 02.10.2026 — startup и недели

- [x] Общий клиент скрывает topics/summary/first exercise под loading, автоматически выбирает review или первую непустую тему; навигация к тренировке использует готовую фразу.
- [x] Центрированная недельная навигация статистики, abort/retry и переходы между месяцами/годами проверены component и Android-layout browser tests.
- [x] 02.10.2026: startup/недели включены в опубликованный APK 1.18; assets проверены. [Checkpoint](android-1.18-release.md).
- [ ] Проверить на устройстве cold start/login, review/обычную тему, свайп/mic без повторного выбора, шрифты/пагинацию прошлых срезов и реальные ошибки сети.
- [ ] Проверить на физическом Android после явного возобновления телефонных тестов.

[Доказательства](ready-practice-week-checkpoint.md). APK 1.17/code27 не пересобран, native sync не выполнялся.

## Контрольный Android 1.18 — 02.10.2026

- [x] Владелец согласовал1.18/code28; весь накопленный клиент после1.17 перенесён: startup/недели/lazy panels/system font/страницы10/50 и тёмные стрелки. Production APK собран, metadata/assets/signature/guards и independent review прошли; frontend99 и browser18 passed.
- [x] 02.10.2026: [PR #54](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/54) merged; APK v1.18 опубликован, digest/size совпали; web READY на release SHA, авторизованные startup/недели/тёмные стрелки проверены; [checkpoint](android-1.18-release.md).
- [ ] Физическая ручная приёмка и реальные voice/скоростные замеры остаются открытыми; телефонные тесты не возобновлялись.

## Android 1.19 — исправление входа, 02.10.2026

- [x] Выявлена первопричина 1.18: web bundle с пустым API URL → emulator fallback. Android build mode и обязательная проверка endpoint добавлены.
- [x] Проверки и сборка 1.19: frontend suite/guard tests, lint/typecheck, web/native builds, Chrome 5, source review, packaged API/metadata/assets/signature прошли.
- [x] 02.10.2026: [PR #56](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/56) merged; GitHub APK 1.19 опубликован, digest/size совпали; web READY и авторизованный профиль/готовая практика проверены; [checkpoint](android-1.19-release.md).
- [ ] Ручной Google-вход на физическом телефоне после явного возобновления тестов.

## 03.10.2026 — интерфейс и выпуск 1.20

- [x] Читаемая кнопка ручного ввода при STT error, правило общего стиля в AGENTS.
- [x] Web: статистика с недели и тремя карточками, профиль/выход в настройках, удаление backend controls, два круглых действия под transcript.
- [x] Frontend 116 tests, lint/typecheck/build, Chrome 9 сценариев + 2 расширенных week/settings checks; backend/scripts gate и Node guards прошли.
- [x] Номер 1.20/code30 отдельно согласован владельцем; весь текущий клиент от main 1.19 перенесён в production APK; metadata/assets/API/signature проверены.
- [x] 03.10.2026: PR #58 merged; GitHub v1.20 опубликован, asset digest/size совпали; Vercel READY на release SHA, alias и 7 assets подтверждены. Авторизованные статистика/настройки/возврат проверены; см. [релиз](android-1.20-release.md).
- [ ] Физическая ручная приёмка; телефонные/ADB/AVD проверки остаются остановленными владельцем.
- [x] [Мягкие подсказки](transcription-assistance-design.md) спроектированы.
- [ ] Личное ревью проекта подсказок, затем отдельная реализация; в 1.20 не включена.


## 03.10.2026 — мягкие подсказки и оформление кнопок

- [x] Web/backend реализация и автоматические проверки завершены; [доказательства](soft-assistance-checkpoint.md).
- [x] [PR #61](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/61) merged; frontend/backend READY на `4b2de1776b73d71639d6ceaa9a29b192e604033e`, PostgreSQL migration/RLS/grants и production smoke подтверждены; [доказательства](soft-assistance-checkpoint.md).
- [x] Владелец подтвердил1.21/code31; весь клиент перенесён и собран, signature/metadata/API/7 assets проверены; [checkpoint1.21](android-1.21-release.md).
- [x] [PR #63](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/63) merged; v1.21 APK опубликован, серверный digest/size подтверждены; frontend READY на release SHA, 7 публичных assets совпали с APK; [доказательства](android-1.21-release.md).
- [ ] Физическая приёмка, настоящая речь и OAuth; ADB/AVD остаются остановленными.

## Накоплено 05.10.2026 — причины STT и Allergičen

- [x] Web/backend: закрытые коды STT errors и русская причина; проверенное предложение окончания `Allergičen / Alergičen → Alergičan` с подтверждением и отменой, без роста mastery.
- [x] Backend/scripts 197 passed / 8 skipped, Node guards 5 passed; frontend 135 passed; lint/typecheck/production build и browser recovery 1 passed. [Доказательства](transcription-errors-checkpoint.md).
- [x] Web/backend опубликованы; сообщения включены в явно запрошенный 1.22.
- [x] Android sync/APK/номер выполнены позже по отдельной команде — 1.22/code32.
- [ ] Физическая проверка реальной речи.

## Накоплено 05.10.2026 — анализ мягких подсказок без словаря

- [x] Предыдущая локальная словарная правка заменена `analysis-v3`: AI-анализ каждой enabled расшифровки по канону/вариантам, проверка близости и возможных искажений STT. Все новые предложения с объяснением подтверждаются; лимита трёх нет. Диагностика STT errors сохранена.
- [x] Web/backend gate: 213 backend/scripts passed / 8 skipped, Node guards 5, frontend 139, lint/typecheck/production build; Chrome на телефонной ширине — web/Android-layout 2 passed. [Доказательства](transcription-analysis-checkpoint.md).
- [x] Web/backend опубликованы; весь накопленный клиент включён в явно запрошенный Android 1.22.
- [x] Согласование версии, Android sync/APK выполнены позже по отдельной команде — 1.22/code32.
- [ ] Настоящая речь/физическое устройство.

## 05.10.2026 — Android 1.22

- [x] Отдельная команда на APK и версия 1.22/code32 согласованы. Весь накопленный клиент включён; sync/build, metadata, API, подпись и assets прошли. [Доказательства](android-1.22-release.md).
- [x] GitHub asset и production опубликованы; [доказательства](android-1.22-release.md).
- [ ] Физическая ручная приёмка и качество настоящей речи.

## 05.10.2026 — опубликован релиз 1.22

- [x] [PR #65](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/65) merged; production web/backend READY на `24034d1115bdd9640e0baa122d192b20fb177614`. Авторизованный smoke, API/health/защита доступа, console/runtime logs и JS/CSS assets проверены.
- [x] [APK v1.22](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.22) опубликован; versionCode 32, подпись/API/package assets, GitHub digest/size и копия Downloads подтверждены. Накопленные причины STT и analysis-v3 перенесены полностью. [Доказательства](android-1.22-release.md).
- [ ] Настоящая речь, акустическая точность гипотез, физическая OAuth/STT-приёмка остаются открытыми. Телефонные/ADB/AVD тесты не возобновлялись. Предыдущие записи о pending publication/sync относятся к состоянию до этого выпуска; эта задача не закрывает весь P0/P1/P2.


## 07.10.2026 — синхронизация настройки мягких подсказок

- [x] Backend и общий web/Android-клиент: настройка в профиле, сохранение и синхронизация в обе стороны; [доказательства](assistance-sync-checkpoint.md).
- [x] Автоматические проверки API/изоляции, миграции с сохранением истории, двух клиентов, native resume и применения флага к STT; [результаты](assistance-sync-checkpoint.md).
- [x] Backend/web и production-миграция опубликованы в 1.23; [доказательства](android-1.23-release.md).
- [x] Включено в согласованный Android 1.23/code33; сборка, metadata/API/подпись/assets и публикация проверены; [доказательства](android-1.23-release.md).
- [ ] Физическая приёмка Android ↔ web под одним аккаунтом. P0/P1/P2 целиком не закрыты.


## 07.10.2026 — убрать нумерацию фраз

- [x] Общий web/Android-интерфейс: убраны порядковые номера в обычной практике и карусели повторения; [доказательства](phrase-numbering-checkpoint.md).
- [x] 149 frontend tests, lint, typecheck и production build прошли; [результаты](phrase-numbering-checkpoint.md).
- [x] Web опубликован в 1.23; [доказательства](android-1.23-release.md).
- [x] Включено в согласованный Android 1.23/code33; сборка, metadata/API/подпись/assets и публикация проверены; [доказательства](android-1.23-release.md).
- [x] Авторизованный production web smoke выполнен; [доказательства](android-1.23-release.md).
- [ ] Физическая приёмка Android; P0/P1/P2 целиком не закрыты.


## 07.10.2026 — текстовый разбор без баллов по категориям

- [x] Общий web/Android-интерфейс: удалены карточки баллов из «Разбора», сохранены объяснение и исправления; [доказательства](text-analysis-checkpoint.md).
- [x] 151 frontend tests, lint, typecheck и production build прошли; [результаты](text-analysis-checkpoint.md).
- [x] Web опубликован в 1.23; [доказательства](android-1.23-release.md).
- [x] Включено в согласованный Android 1.23/code33; сборка, metadata/API/подпись/assets и публикация проверены; [доказательства](android-1.23-release.md).
- [x] Авторизованный production web smoke выполнен; [доказательства](android-1.23-release.md).
- [ ] Физическая приёмка Android; P0/P1/P2 целиком не закрыты.


## 07.10.2026 — календарь и отдельная страница фраз

- [x] Общий web/Android-интерфейс: даты сверху, крупное число попыток, легенда 1/10, единая ширина сегментов графика, отдельная страница с селектором темы и native Back.
- [x] Backend: темы текущего аккаунта и фильтрация фраз с пагинацией по теме; прежний API сохранён.
- [x] Backend/scripts pytest, frontend 156 tests, lint/typecheck/build и Chrome 3 сценария web/Android-layout прошли; одинаковые X/width цветных сегментов подтверждены с допуском 0.01 CSS px. Снимки проверены; [доказательства](statistics-redesign-checkpoint.md).
- [x] Backend/web опубликованы в 1.23; [доказательства](android-1.23-release.md).
- [x] Включено в согласованный Android 1.23/code33; сборка, metadata/API/подпись/assets и публикация проверены; [доказательства](android-1.23-release.md).
- [x] Авторизованный production web smoke выполнен; [доказательства](android-1.23-release.md).
- [ ] Физическая приёмка Android; P0/P1/P2 целиком не закрыты.


## 07.10.2026 — выпуск 1.23

- [x] Владелец поручил production web/backend и новый APK, отдельно подтвердил 1.23/code33. Metadata согласована, 17 tests прошли.
- [x] Production/миграция и APK-публикация подтверждены; [доказательства](android-1.23-release.md).
- [ ] Физическая приёмка Android ↔ web и настоящая речь остаются открытыми.

## Накоплено 07.10.2026 — пояснения разбора

- [x] Общий UI убирает сообщения об отсутствии подсказок и ручной правке, показывает explanation_ru под каждым исправлением. Backend требует содержательное объяснение для новых AI-разборов; старые ответы совместимы. [Доказательства](explained-feedback-checkpoint.md).
- [x] Backend/UI tests, lint/typecheck/production build прошли.
- [x] Web/backend опубликованы через PR #69, deployment READY; [доказательства](android-1.24-release.md).
- [x] Android sync/APK выполнены по явной команде, версия 1.24/code34 согласована отдельно; metadata/API/подпись/assets и GitHub digest проверены. [Доказательства](android-1.24-release.md).
- [ ] Физическая приёмка и качество реальных AI-объяснений.

## 07.10.2026 — ответы на 100% без разбора

- [x] Общий UI web/Android скрывает «Разбор» при отображаемых 100%, сохраняет его ниже 100%.
- [x] App 89 tests, включая web/native и границу округления; lint/typecheck/production build и diff check прошли. [Доказательства](perfect-answer-feedback-checkpoint.md).
- [x] Web опубликован, READY; [публикация 08.10.2026](latest-web-release-2026-10-08.md).
- [ ] Android sync/сборка по отдельной команде; 1.24/code34 не менялись.
- [ ] Ручная production/физическая Android-приёмка; P0/P1/P2 целиком не закрыты.

## 07.10.2026 — ошибка неподдерживаемого алфавита STT

- [x] Один повтор распознавания с явным сербским алфавитом; без удаления чужих букв, подгонки к канону или сохранения аудио. [Доказательства](transcription-script-retry-checkpoint.md).
- [x] Adapter/API/assistance 54 mock tests прошли.
- [x] Полный backend/scripts suite: 232 passed, 8 штатных skips на SQLAlchemy 2.0.54; [доказательства](transcription-script-retry-checkpoint.md).
- [x] Backend опубликован, общий API применяет восстановление к web и Android; [публикация 08.10.2026](latest-web-release-2026-10-08.md).
- [ ] Ручная проверка реальной записи; P0/P1/P2 целиком не закрыты.

## 07.10.2026 — персональная отладка моделей Максима Сумина

- [x] Общий web/Android переключатель только для серверно разрешённого администратора; состояние в БД, requests/responses/time/duration без аудио и ключей.
- [x] Atomic disable/delete и fencing поздних ответов, migration/downgrade; backend/scripts 248 tests, frontend 171 tests, lint/typecheck/build, local web/Android-layout preview и diff check. [Доказательства](model-debug-checkpoint.md).
- [x] Backend/web READY, PostgreSQL migration/RLS/grants подтверждены; [публикация 08.10.2026](latest-web-release-2026-10-08.md).
- [ ] Android sync/APK по отдельной команде; 1.24/code34 не менялись.
- [ ] Ручная production/физическая Android-приёмка; P0/P1/P2 целиком не закрыты.

## 08.10.2026 — блок аккаунта в одну строку

- [x] Общий web/Android CSS: профиль слева, выход справа, центры совпадают; Chrome web/Android-layout 320/390 px без переполнения.
- [x] Settings component 7 tests, lint/typecheck/build и diff check прошли. [Доказательства](account-layout-checkpoint.md).
- [x] Web опубликован, READY; [публикация 08.10.2026](latest-web-release-2026-10-08.md).
- [ ] Android sync/APK по отдельной команде; 1.24/code34 не менялись.
- [ ] Production/физическая Android-приёмка; P0/P1/P2 целиком не закрыты.
