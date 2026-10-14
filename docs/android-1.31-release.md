# SerboTalk 1.31 — английский интерфейс и фразы

14.10.2026 владелец поручил публикацию web/backend и новый APK, отдельно согласовал **1.31 / versionCode 41**. APK: `SerboTalk-andorid16-1.31.apk`.

Выпуск включает общий frontend после 1.30: язык первым пунктом настроек, русский/английский интерфейс и отдельный английский каталог всех 160 готовых фраз для прежних сербских канонов. Прогресс, повторения и штрафы подсказок сохранены. Сервер создаёт новые объяснения на выбранном языке; собственные исходные тексты и уже полученные произвольные объяснения сохраняют язык. Предпочтение языка хранится на устройстве.

- [x] 289 backend/scripts tests passed / 8 skipped, 205 frontend tests passed, Node guards 5 passed; lint, typecheck и production web build. AI/Auth внешние вызовы в тестах заменены mocks.
- [x] Android metadata согласованы: 1.31/code41, package metadata 1.31.0 и обязательное имя APK. Component проверки metadata прошли.
- [x] Production Android build → cap sync → Gradle assembleProdDebug: BUILD SUCCESSFUL / 109 tasks.
- [x] APK version 1.31/code41/min24/target36, production API и HTTPS WebView, 9 synchronized public assets совпали побайтно, английский каталог присутствует. SHA-256 сертификата `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с предыдущим APK; установка поверх совместима. APK 4 475 590 bytes, SHA-256 `c452cb20ca96e83a7e987739c574146e2123e6b4bdfe982e8f69f21c0fcdcf71`; artifacts и Downloads совпадают.
- [ ] PR merged и runtime SHA подтверждён.
- [ ] Vercel backend/frontend READY на runtime SHA, production aliases и пользовательский сценарий проверены.
- [ ] GitHub release v1.31: tag/target, asset name/digest/size совпадают с локальным APK.
- [ ] Физическая приёмка владельцем: установка поверх предыдущей версии, смена языка, тренировка/подсказки, статистика, перезапуск.

Google Play AAB/закрытый трек остаётся на 1.30: этот запрос относится к публикации web и APK, загрузка нового AAB в Play не выполняется.
