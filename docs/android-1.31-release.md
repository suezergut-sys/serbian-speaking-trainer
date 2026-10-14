# SerboTalk 1.31 — английский интерфейс и фразы

14.10.2026 владелец поручил публикацию web/backend и новый APK, отдельно согласовал **1.31 / versionCode 41**. APK: `SerboTalk-andorid16-1.31.apk`.

Выпуск включает общий frontend после 1.30: язык первым пунктом настроек, русский/английский интерфейс и отдельный английский каталог всех 160 готовых фраз для прежних сербских канонов. Прогресс, повторения и штрафы подсказок сохранены. Сервер создаёт новые объяснения на выбранном языке; собственные исходные тексты и уже полученные произвольные объяснения сохраняют язык. Предпочтение языка хранится на устройстве.

- [x] 289 backend/scripts tests passed / 8 skipped, 205 frontend tests passed, Node guards 5 passed; lint, typecheck и production web build. AI/Auth внешние вызовы в тестах заменены mocks.
- [x] Android metadata согласованы: 1.31/code41, package metadata 1.31.0 и обязательное имя APK. Component проверки metadata прошли.
- [x] Production Android build → cap sync → Gradle assembleProdDebug: BUILD SUCCESSFUL / 109 tasks.
- [x] APK version 1.31/code41/min24/target36, production API и HTTPS WebView, 9 synchronized public assets совпали побайтно, английский каталог присутствует. SHA-256 сертификата `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с предыдущим APK; установка поверх совместима. APK 4 475 590 bytes, SHA-256 `c452cb20ca96e83a7e987739c574146e2123e6b4bdfe982e8f69f21c0fcdcf71`; artifacts и Downloads совпадают.
- [x] [PR #94](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/94) CLEAN/MERGEABLE, обязательных checks нет; merged на runtime SHA `a1552f4a4212c4632af42c343213b992b114a1bc`.
- [x] Vercel backend `dpl_7zWwun4W3ECJ7dLbrGDxz6FfZSnL` и frontend `dpl_5JRmHhAxgZqsp15Xfmtz82eocyn1` READY/production/main на runtime SHA a1552f4; aliases подтверждены API. Health и публичные страницы 200, защищённый auth/me 401, CORS для X-Interface-Language 200. Runtime error rows: 0 в обоих проектах. Реальная production-страница загрузила новый login UI, Google OAuth дошёл до проверки личности.
- [ ] Авторизованная production-проверка ru/en/settings/practice: Google запросил подтверждение владельцем на телефоне; этот шаг не подменён mock-сценарием.
- [x] [GitHub release v1.31](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.31) опубликован; tag/target = runtime SHA a1552f4, asset name/digest/size совпадают с локальным APK. [Скачать APK](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.31/SerboTalk-andorid16-1.31.apk).
- [ ] Физическая приёмка владельцем: установка поверх предыдущей версии, смена языка, тренировка/подсказки, статистика, перезапуск.

Google Play AAB/закрытый трек остаётся на 1.30: этот запрос относится к публикации web и APK, загрузка нового AAB в Play не выполняется.

Production: [web](https://serbian-speaking-trainer.vercel.app), [API](https://serbian-speaking-trainer-api.vercel.app), [frontend deployment](https://serbian-speaking-trainer-om17k45i0-suezerguts-projects.vercel.app), [backend deployment](https://serbian-speaking-trainer-amdpqzusa-suezerguts-projects.vercel.app). Downloads: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.31.apk`.

Ignored evidence: `artifacts/android-1.31-{build.log,badging.txt,signature.txt,verification.json,production.json,runtime-logs.json,github-release.json}`. APK и секреты не входят в Git. Сборка выполнялась штатным эквивалентом build:android → cap sync → Gradle; aapt проверял ASCII-путь копии Downloads из-за ограничения Unicode-путей Windows. Подключённых Android-устройств/emulators нет; телефонная приёмка остаётся открытой.
