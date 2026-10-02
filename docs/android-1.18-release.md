# SerboTalk 1.18 — 02.10.2026

Версия 1.18/code28 отдельно согласована владельцем; production APK собран. Публикация и deployment подтверждаются отдельными отметками.

## Состав

Тёмные кнопки недель с голубыми стрелками, hover/active/focus; готовый startup (topics/summary/default review или первая непустая тема/first exercise), переключение недель, lazy Statistics/Admin и retry, системный шрифт, страницы фраз 10/50 и защита от устаревших ответов. Предыдущие функции 1.17 сохранены. Backend runtime/schema не меняются.

## Артефакт и проверки

- [x] Production flavor `assembleProdDebug` и cap sync прошли; package `com.serbiantalk.trainer`, version1.18/code28, min24/target36.
- [x] APK `SerboTalk-andorid16-1.18.apk`, 4 424 146 bytes; SHA256 `1969F7C82512BD4ACFDC3242389C02392DF9BAE56454E669524C093990FA36EF`.
- [x] apksigner verification/v2 и прежний certificate SHA256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` подтверждены. Обновление на устройстве не выполнялось.
- [x] Все 7 dist files побайтно совпадают с packaged assets; HTTPS config, mixedContent=false, нет testlab.html/local credentials/permanent-key pattern. UI styles включены в APK.
- [x] Frontend99/99, lint/typecheck/production build; Chrome18/18 включая computed dark background/color/radius в web и Android layout, startup/swipe analogue, recovery и недели.
- [x] GPT-6.1 Sol/medium artifact/source review одобрено. Lab builder filename и lifecycle/resilience defaults получают версию из package.json; PS parser/version derivation и Node syntax checks прошли.
- [ ] Публикация GitHub release v1.18 и проверка asset digest/size.
- [ ] Web Vercel READY на release SHA и production verification.
- [ ] Ручная Android-приёмка: установить поверх1.17, проверить вход/алфавит, startup default review/первую непустую тему, swipe/mic ready, недели/стрелки, lazy panels/retry, Back/draft и настоящий голос.

Lab APK1.18 не собирался и не публикуется. Физический телефон/ADB/AVD тесты не запускались; phone checks остаются остановленными. Browser native layout не заменяет устройство. Открытые P0/P1/P2, RLS/grants, реальные STT/OAuth и performance metrics не закрываются выпуском.
