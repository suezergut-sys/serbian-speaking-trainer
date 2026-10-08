# SerboTalk 1.25 — последние изменения

08.10.2026 владелец отдельно подтвердил 1.25 / versionCode 35 после команды опубликовать последние изменения и выпустить APK.

Состав: скрытие «Разбора» при отображаемых 100%, восстановление STT при неподдерживаемом алфавите, персональный режим отладки моделей для администратора Максима Сумина и выравнивание профиля/кнопки выхода. Web/backend уже опубликованы через PR #71; [production evidence](latest-web-release-2026-10-08.md).

- [x] Функциональные проверки: backend/scripts 248 passed, 8 штатных skips; frontend 171 passed, lint/typecheck/production build. AI calls mock.
- [x] Версия 1.25/code35 согласована отдельно, metadata обновлена.
- [x] Android metadata/environment: 17 tests passed. Проверены versionName/code, точное имя APK и требования к production HTTPS API/auth configuration.
- [x] `pnpm android:cloud-apk`: Android mode → cap sync → assembleProdDebug, BUILD SUCCESSFUL, 109 tasks. aapt: package com.serbiantalk.trainer, 1.25/code35, minSDK24/targetSDK36. Signature v2 verified; certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с 1.24.
- [x] Семь dist files совпали с APK, все шесть публичных JS/CSS побайтно совпали с production web. HTTPS API `https://serbian-speaking-trainer-api.vercel.app` и переключатель отладки присутствуют в пакете; секретов/testlab/mixedContent нет.
- [x] [PR #73](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/73) merged, release SHA `7dba7648c8e4b368bb6f52e2ee0da4377d704754`. GitHub checks не назначены, mergeability CLEAN. Runtime web/backend остаётся на проверенном PR #71; PR #73 меняет только metadata APK, тест и документ, повторный web/backend deploy не нужен.
- [x] [GitHub release v1.25](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.25) опубликован, tag/target совпадают с release SHA; asset uploaded, server digest/size совпали с локальным APK и Downloads.
- [ ] Физическая Android-приёмка и реальная речь. ADB/AVD не запускались; P0/P1/P2 целиком не закрыты.

Артефакт `SerboTalk-andorid16-1.25.apk`: 4 429 686 bytes, SHA-256 `7257801d38b44af2e90bb4de872b557f4b03f131a0c2b0f2c481bf535b07443f`. Копии `artifacts/SerboTalk-andorid16-1.25.apk` и `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.25.apk` проверены; APK не коммитится. [Скачать APK](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.25/SerboTalk-andorid16-1.25.apk).

Предупреждения Vite chunk >500 kB, Gradle flatDir/overridePathCheck и разницы SDK XML versions не блокируют успешную сборку. Никаких пользовательских настроек или учебных данных при выпуске не очищали. Production migration/RLS/grants, сохранение мягких подсказок после reload и аккаунт в одну строку проверены при предыдущем web smoke; реальные AI-вызовы в release smoke не выполнялись. Проверки содержимого пакета: `artifacts/android-1.25-verification.json`.


Дополнительная PostgreSQL-проверка: SELECT LIMIT 0 под SET LOCAL ROLE anon и authenticated для каждой debug table возвращает insufficient_privilege (4/4). Проверка не сохраняла данные; роли сброшены в той же транзакции. REST Data API probe вернул 503/PGRST002 (schema cache unavailable), поэтому доказательство отказа получено непосредственно в PostgreSQL. Приложение использует backend API и прямое DB connection, а не Data API; отдельная диагностика REST отмечена в audit-roadmap.
