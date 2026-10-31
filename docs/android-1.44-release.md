# SerboTalk 1.44 / versionCode 54 — 31.10.2026

Номер отдельно подтверждён владельцем. Запрос: убрать ALTA BANK, подготовить финальный APK для ручной проверки и AAB для будущего публичного выпуска. В Android остаётся только Google-вход; в web сохраняется email-код. Google Play Console, заявка production access и публичный выпуск этим поручением не отправляются.

## Состав

- Для России доступен перевод в рублях через СБП в Банк Санкт-Петербург; для Сербии и остальных стран — PayPal. ALTA (EUR/RSD) отсутствует в выборе и новых API-заявках, даже если старые реквизиты ещё настроены в окружении.
- Старые заявки, история и Premium сохранены. У старой ALTA-заявки реквизиты для нового перевода скрыты; уже совершённую оплату можно сообщить и проверить администратором. Повторный create не возвращает старую ALTA-заявку в обход запрета.
- Проверочный вход удалён с входа в тренажёр и лендинга. Старый API возвращает 410/no-store без выдачи токенов. Пользовательские аккаунты и прогресс не удаляются.
- Android скрывает email-вход независимо от rollout-флага; production Android env также отключает его. В web email-код сохраняется вместе с Google.
- Включён весь общий клиент актуального main после 1.43, в том числе двуязычные личные фразы, выбор задания/подсказок по текущему RU/EN и блокировка несовпадающего языка. Серверная миграция и backfill уже выполнены: [исправление языка](source-language-consistency-2026-10-30.md).
- Бессрочный Android Premium с нынешними лимитами и стандарт Ekavica сохранены. Новых миграций, OpenAI-вызовов и изменений платёжного механизма «Я оплатил» нет.

## Проверки и доставка

- [x] Реализация и целевые регрессии: запрет ALTA при старой конфигурации, защита от повторного create, сохранение/обработка исторической заявки; retired review endpoint; web email / native Google; RU/EN payment UI.
- [x] Backend/scripts 502 passed / 9 PostgreSQL skips; после удаления старого adapter 27 targeted passed. Frontend 358 tests/39 files (`--maxWorkers=2`), lint/typecheck/build; 5 Node guards; 16 browser scenarios RU/EN по входу, платежам, общим/личным фразам. AI/Auth/Telegram mocked. В первом параллельном с Gradle прогоне два прежних UI-теста завершились по таймауту; полный повтор с двумя workers прошёл без изменения runtime или их assertions. Логи `artifacts/android-1.44-*`.
- [x] `pnpm android:cloud-apk` и подписанный `build-android-play-aab.ps1`: BUILD SUCCESSFUL. APK/AAB 1.44/code54/min24/target36; production API и HTTPS WebView, все 10 public assets совпали побайтно. Browser/Share plugins присутствуют, testlab/landing/секреты отсутствуют, reviewer API path в bundle отсутствует. Подписи сверены с предыдущим выпуском, bundletool validate/dump прошли. Копии в Downloads побайтно проверены.
- [x] [PR #183](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/183) merged на `9cb113d32b6a24edcfd3303e237334deb0f99af4`. [GitHub v1.44](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.44) содержит APK и AAB; tag/target и server size/digest совпадают с Downloads. Исходный runtime tree APK совпадает с merged SHA, различаются только документы.
- [x] Backend `dpl_2WRKdm4QZPirWyEUF9kkxSBrN5Bv` и frontend `dpl_4vYzisom4KznPUUzGQBd54Dy38iv` Ready/production/main на `9cb113d`; API metadata и production aliases подтверждены. Health/app/privacy/delete-account HTTP200, anonymous payment options401; старый reviewer endpoint410/no-store, отсутствует в OpenAPI. Runtime error rows: 0/0 за проверенный интервал.
- [ ] Физическая приёмка владельцем: Google OAuth нового/существующего аккаунта, возврат/перезапуск, Premium, RU/EN общие и личные фразы, микрофон/реальная речь и повторение. Автотесты с mocks эту приёмку не заменяют.
- [ ] Play Console: актуализация инструкции доступа для Google-входа, загрузка финального AAB, заявка production access и публичный выпуск — отдельное поручение после ручной проверки.

Исходники сборки, SHA runtime и последующие commits только с доказательствами фиксируются отдельно. Доказательства и бинарные артефакты хранятся в игнорируемом `artifacts/android-1.44-*`; секреты и аудио в Git не включаются.

## Артефакты

- APK: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.44.apk`, 4 653 033 bytes, SHA-256 `cbe59c1c3fb2bab556052abf084da3ae477dae1a68b4accf7661cb9f551f9ff1`.
- AAB: `C:/Users/MSumin/Downloads/SerboTalk-android-1.44.aab`, 3 488 712 bytes, SHA-256 `9be18a1375e946e8e006f29fbc6efbf584e2e41d73b0302a1a57e98d30776d23`.
- APK certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`; AAB upload certificate сверяется с прежним `aa7aa2702faafb0270d967d3f4d9a318f24ce26148084acfae304f55e378cf62`. Самоподписанный upload certificate даёт обычное предупреждение Java trust chain; jarsigner verify и bundletool завершаются успешно.

## Заметки для будущего Play-выпуска

RU: Вход через Google. Улучшена работа русских и английских заданий и личных фраз. Включены последние исправления интерфейса и подсказок; Premium в Android активируется автоматически.

EN: Sign in with Google. Improved Russian and English exercises and personal phrases. Includes the latest interface and hint fixes; Premium activates automatically on Android.

Исходный commit проверенного runtime: `08c8da146e54edf03a4ceef6472f6a4ee45fc576`, [PR #183](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/183). После сборки изменялись только доказательства; APK не пересобирается ради документации.

## Production-приёмка 31.10.2026

В Chrome на `https://serbotalk.app/app` настоящая owner-сессия загрузила каталог и настройки v1.44, проверены RU/EN и восстановлен исходный русский. Запись/ответы/платежи не отправлялись, модель и режим отладки не менялись. Доказательство вне Git: `artifacts/android-1.44-production-settings.png`.

Backend deployment: https://serbian-speaking-trainer-qxe8u3mae-suezerguts-projects.vercel.app ; frontend: https://serbian-speaking-trainer-kpibhmojr-suezerguts-projects.vercel.app . Основные адреса: https://serbotalk.app и https://serbian-speaking-trainer-api.vercel.app . Build не выполнял новых миграций, seed не менял существующие фразы.

Для production browser smoke тестовые файлы получили явные параметры пути `/app` и auth storage key. Эти параметры меняют только тестовый запуск, не runtime/APK. Неудачный первоначальный запуск с неверным путём остановлен; результаты корректного запуска учитываются отдельно. Проверки используют настоящий опубликованный bundle, синтетические аккаунты и mock API, без реального перевода денег/AI.

Production browser matrix: **16/16 passed** на основном домене (RU/EN вход, платежи, общие/личные фразы, desktop/mobile/shared Android). APK повторно скачан из GitHub и совпал по SHA-256 с Downloads. Финальная синхронизация копий проверяется после merge доказательств; runtime/source остаётся `9cb113d`.

Доказательства и воспроизводимый production smoke сохранены в [PR #184](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/184). Все12 копий проверены чистыми на runtime9cb113d; после merge доказательств повторяется проверка общего HEAD/main и пустого статуса. Recovery не потребовалось; ветки сохранены. Финальный SHA документации отличается от исходников deploy/APK, поэтому повторная сборка/deploy не выполняются.
