# SerboTalk 1.18 — 02.10.2026

Версия 1.18/code28 отдельно согласована владельцем; production APK собран и опубликован; web deployment READY и авторизованные production-проверки подтверждены.

## Состав

Тёмные кнопки недель с голубыми стрелками, hover/active/focus; готовый startup (topics/summary/default review или первая непустая тема/first exercise), переключение недель, lazy Statistics/Admin и retry, системный шрифт, страницы фраз 10/50 и защита от устаревших ответов. Предыдущие функции 1.17 сохранены. Backend runtime/schema не меняются.

## Артефакт и проверки

- [x] Production flavor `assembleProdDebug` и cap sync прошли; package `com.serbiantalk.trainer`, version1.18/code28, min24/target36.
- [x] APK `SerboTalk-andorid16-1.18.apk`, 4 424 146 bytes; SHA256 `1969F7C82512BD4ACFDC3242389C02392DF9BAE56454E669524C093990FA36EF`.
- [x] apksigner verification/v2 и прежний certificate SHA256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` подтверждены. Обновление на устройстве не выполнялось.
- [x] Все 7 dist files побайтно совпадают с packaged assets; HTTPS config, mixedContent=false, нет testlab.html/local credentials/permanent-key pattern. UI styles включены в APK.
- [x] Frontend99/99, lint/typecheck/production build; Chrome18/18 включая computed dark background/color/radius в web и Android layout, startup/swipe analogue, recovery и недели.
- [x] GPT-6.1 Sol/medium artifact/source review одобрено. Lab builder filename и lifecycle/resilience defaults получают версию из package.json; PS parser/version derivation и Node syntax checks прошли.
- [x] 02.10.2026: [PR #54](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/54) merged, release SHA `e15293f9bfc5c02dd4b42d0c2f63407ff8684bdb`. [GitHub release v1.18](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.18) опубликован; серверные asset digest/size совпадают с указанными выше. CI checks в PR отсутствовали; проверки выполнены локально.
- [x] 02.10.2026: frontend deployment `dpl_6X3Wf1LDDf7vkfyrZaMVAAztarSu` READY/production на release SHA, [deployment URL](https://serbian-speaking-trainer-qoqgzy45o-suezerguts-projects.vercel.app) и [production alias](https://serbian-speaking-trainer.vercel.app/) подтверждены через Vercel API.
- [x] Авторизованный IAB production: темы и готовая фраза повторения после startup; статистика текущей недели, переход назад и возврат. Стрелка вправо отсутствует на текущей неделе, доступна на прошлой. Computed background `rgba(17,52,91,0.38)`, color `rgb(141,188,232)`, radius `10px`; console errors 0. Возврат к практике сохранил готовую фразу. Устройство и настоящий голос не использовались.
- [ ] Ручная Android-приёмка: установить поверх1.17, проверить вход/алфавит, startup default review/первую непустую тему, swipe/mic ready, недели/стрелки, lazy panels/retry, Back/draft и настоящий голос.

Lab APK1.18 не собирался и не публикуется. Физический телефон/ADB/AVD тесты не запускались; phone checks остаются остановленными. Browser native layout не заменяет устройство. Открытые P0/P1/P2, RLS/grants, реальные STT/OAuth и performance metrics не закрываются выпуском.
