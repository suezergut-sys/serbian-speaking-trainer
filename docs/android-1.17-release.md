# Контрольный выпуск SerboTalk 1.17 — 01.10.2026

Контрольная версия `1.17` / `versionCode 27` согласована владельцем. APK production/lab собраны, проверены reviewer и полным fixture-based native resilience/lifecycle suite. Release publication и обычный end-to-end practice UI flow остаются открытыми.

## Состав сборки 1.17

- В сборку включён текущий клиентский bundle с накопленными после 1.16 изменениями: точная word-level подсветка `evidence`/`correction`, Android-домик с возвратом к темам и сохранением текущей практики, системный Back и унаследованные сценарии мобильной устойчивости P1. Эти функции и resilience/lifecycle сценарии проверены в APK 1.17 с fixtures/mock.
- Изменения web/backend подсветки и статистики опубликованы через [PR #43](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/43), runtime SHA `bd7e9fb1f7e13644e16182d6cdab3f713c56948c`; перенос в APK 1.17 подтверждён build artifact audit и feature acceptance.
- Системный Back и проверки Android AVD описаны в [P1 checkpoint](p1-pooler-android-checkpoint.md); опубликованный web runtime PR #45 не менял Android APK.

## Артефакт и публикация

- Production APK: `artifacts/SerboTalk-andorid16-1.17.apk`, 4,421,352 bytes, SHA-256 `A33A84112555059C3103E89B45B6BA98E83EFF64CC975802C7772B5EE55012CA`.
- Lab APK: 4,422,835 bytes, SHA-256 `262BE3F8C8494E365D15EE469A3FA8E99B27E5CDAB028E41AB8281B5589E6524`.
- Оба APK: package metadata `1.17` / `versionCode 27`, min SDK 24, target SDK 36. Production certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`, совпадает с 1.16.
- Release SHA, PR/release URL и production deployment URL: ожидают supplied publication evidence.

## Проверки

- [x] Проверки: Python 163 passed / 8 skipped; frontend 82 tests; 13 изолированных browser tests (mocked/network/lifecycle/result-navigation); 5 Node guards; lint, typecheck и root `tsc -b` прошли.
- [x] Production bundle sync и Gradle production build (38 s) / lab build (12 s) прошли.
- [x] Metadata обоих APK: 1.17/code 27, min SDK 24, target SDK 36. APK guards подтвердили отсутствие lab в production, `mixedContent=false` и изоляцию lab; `apksigner verify` прошёл, production certificate совпадает с 1.16.
- [x] Reviewer artifact audit: все 5 production dist files совпали byte-for-byte; постоянный-key patterns и lab-host markers не найдены; HTTPS metadata, `mixedContent=false` и signature v2 подтверждены.
- [x] Reviewer финально подтвердил diff без блокеров; syntax runner прошёл. Предыдущий найденный web-only locator heading исправлен для native Themes aria/section.
- [x] Production и lab APK установлены через `install -r` на AVD API 36; данные production app не очищались.
- [x] На AVD 1.17 прошли radio-off 30s/retry, IME Back, Settings/Stats Back, домик → темы → сохранённый draft, реальный swipe, background при connecting/STT, oversized 413 recovery, grading Home/resume без дублирования и точечная подсветка единственного слова `jutreneg` / `јутренег`.
- [x] Полный AVD resilience run завершился exit 0 после восстановления эмулятора: native `getUserMedia`/OS permission revoke denial, expired fixture `401` → новая сессия, native exit practice → topics → exit и cleanup radio/permission прошли. Успешный полный прогон использовал offline 30 s; отдельный первый прогон 1.17 подтвердил offline 120 s + retry, затем завершился locator failure.
- [x] Native `android-lifecycle.mjs` на APK 1.17 завершился exit 0: lifecycle and hint-race smoke passed.
- [x] Feature acceptance подсветки, домика/сохранения сессии, Back-переходов и P1 recovery прошла на APK 1.17 с fixtures/mock. Эти проверки не включают настоящий STT или OAuth.
- [x] Production APK 1.17 native smoke: Google login screen visible, testlab login absent, production app data not cleared. OAuth sign-in itself was not completed.
- [x] Дополнительная Android проверка получила auth 200, topics 200 и transcription 200; это не подтверждает завершённый end-to-end practice UI flow.
- [ ] Обычный Android practice flow не завершён: при прогоне до bounded-polling patch после auth/topics/transcription HTTP 200 UiAutomator вернул transient `device.info=null`. После добавления 15 s bounded polling следующий запуск потерял AVD из-за повторного QEMU crash/lost-device. Нет результата UI-проверки после patch; инфраструктурный сбой не засчитан как app failure или успешный UI flow, дальнейший AVD прогон приостановлен.
- [x] Public Chrome 154 smoke прошёл на текущем web bundle `index-DQeRzqzh.js`: `/privacy` и `/terms` — 200, `testlab` — 404, page errors — 0.
- [x] Дополнительный `android-testlab.mjs` syntax/runner check прошёл; reviewer подтвердил изменение без блокеров.
- [ ] Release SHA/URL и deployment metadata ждут publication evidence.

## Остаётся открытым

AVD resilience/lifecycle завершились успешно после падения QEMU с `0xc0000005` и relaunch эмулятора. Полная resilience suite на успешном запуске использовала offline 30 s; кейс offline 120 s + retry подтверждён отдельно первым прогоном, где последующий locator завершился ошибкой. Practice попытка до bounded-polling patch достигла auth/topics/transcription HTTP 200, затем получила transient `device.info=null`. После добавления 15 s bounded polling следующая попытка потеряла AVD после QEMU crash; post-patch UI flow не подтверждён. Reviewer подтвердил change без блокеров, syntax runner прошёл; новые AVD попытки приостановлены. End-to-end practice UI и свежие performance metrics не подтверждены. Production APK показал login screen без testlab login, но Google OAuth sign-in не выполнялся. Feature acceptance использовала fixtures/mocks. Выпуск не закрывает P0 или P1 целиком: открыты физическая ручная приёмка, Google OAuth и настоящий STT на устройстве, RLS/grants review/remediation, репрезентативные production concurrency/performance проверки и остальные незакрытые пункты P1. См. [audit roadmap](audit-roadmap.md) и [Android backlog](android-release-backlog.md).
