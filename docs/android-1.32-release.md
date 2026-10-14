# SerboTalk 1.32 — накопленные исправления и desktop темы

14.10.2026 владелец поручил публикацию всех накопленных изменений и обновление APK, затем отдельно согласовал **1.32 / versionCode 42**. Имя: `SerboTalk-andorid16-1.32.apk`.

Набор после 1.31: RU/EN выбор до входа и сохранение после входа; локализованный review login; домик после окончания карусели к темам без выбранной темы; крупное белое поздравление; центральный transcript размером оригинала; правильный English source_text в LLM-разборе и prompt v3. Desktop темы отображаются компактными карточками в два столбца, добавление темы/фразы закрыто premium-карточками. Сербские каноны, progress/scoring и публичные API сохраняются.

- [x] Версия отдельно согласована; package 1.32.0, Android 1.32/code42, обязательное имя APK обновлены.
- [x] Backend/scripts 293 passed / 8 skipped, Node guards 5 passed; App 98 passed, 13 browser checks (ru/en desktop 1024/1366 и накопленные login/review/transcript layouts), lint/typecheck/production Android build/sync.
- [x] `pnpm android:cloud-apk` — BUILD SUCCESSFUL, 109 tasks; весь набор после 1.31.
- [x] APK 1.32/code42/min24/target36, production API/HTTPS, отсутствие testlab; 9 packaged public assets совпали побайтно с production sync. Сертификат SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с 1.31; APK 4476034 bytes, SHA-256 `f6d56abb168b5f378f3a78ef169ac809975862d7ece3cf5349b87aedaa89dcfa`. Копии artifacts/Downloads совпали.
- [ ] GitHub PR/merge и runtime SHA.
- [ ] Backend/frontend Vercel Ready/main/production/aliases и production smoke.
- [ ] GitHub release v1.32/tag/digest/size/Downloads.
- [ ] Физическая установка и приёмка на телефоне; реальная запись и новый AI-разбор.

Новый AAB и Google Play Console/закрытый трек этим запросом не обновляются; накопленные документы и reproducible AAB script 1.30 включаются в Git. Старые разборы не переписываются. [Исправления языкового контекста](localization-fixes-checkpoint-2026-10-14.md), [desktop](desktop-topics-checkpoint-2026-10-14.md).

Ignored evidence: `artifacts/android-1.32-{build.log,badging.txt,signature.txt,verification.json}`. APK: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.32.apk`; бинарник и приватные файлы не входят в Git.
