# SerboTalk 1.32 — накопленные исправления и desktop темы

14.10.2026 владелец поручил публикацию всех накопленных изменений и обновление APK, затем отдельно согласовал **1.32 / versionCode 42**. Имя: `SerboTalk-andorid16-1.32.apk`.

Набор после 1.31: RU/EN выбор до входа и сохранение после входа; локализованный review login; домик после окончания карусели к темам без выбранной темы; крупное белое поздравление; центральный transcript размером оригинала; правильный English source_text в LLM-разборе и prompt v3. Desktop темы отображаются компактными карточками в два столбца, добавление темы/фразы закрыто premium-карточками. Сербские каноны, progress/scoring и публичные API сохраняются.

- [x] Версия отдельно согласована; package 1.32.0, Android 1.32/code42, обязательное имя APK обновлены.
- [x] Backend/scripts 293 passed / 8 skipped, Node guards 5 passed; App 98 passed, 13 browser checks (ru/en desktop 1024/1366 и накопленные login/review/transcript layouts), lint/typecheck/production Android build/sync.
- [x] `pnpm android:cloud-apk` — BUILD SUCCESSFUL, 109 tasks; весь набор после 1.31.
- [x] APK 1.32/code42/min24/target36, production API/HTTPS, отсутствие testlab; 9 packaged public assets совпали побайтно с production sync. Сертификат SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с 1.31; APK 4476034 bytes, SHA-256 `f6d56abb168b5f378f3a78ef169ac809975862d7ece3cf5349b87aedaa89dcfa`. Копии artifacts/Downloads совпали.
- [x] [PR #97](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/97) CLEAN/MERGEABLE, обязательных CI checks нет; merged на runtime SHA `05e47a408727de550e964d0684ffafdd6929cb9e`.
- [x] Backend `dpl_rFgGAKBzSYQZSUaLonwZ3pq1taZY` и frontend `dpl_4eRCUvphnrnaejJWBKWvjZn4AhKj` READY/production/main на runtime SHA 05e47a4; aliases API подтвердил. Health/web/privacy 200, защищённый auth/me 401, CORS X-Interface-Language 200. Авторизованный Chrome подтвердил desktop два столбца, обе disabled premium-карточки и золотые значки, обе локали, v.1.32; исходный English восстановлен. Console errors [], runtime error rows 0 для обоих deployments. Реальные попытки/аудио/AI не отправлялись.
- [x] [GitHub release v1.32](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.32) опубликован; tag/target = runtime SHA, server digest/size совпали. APK скачан обратно через авторизованный gh, SHA-256/size совпали с artifacts/Downloads. Репозиторий private: anonymous download возвращает 404, ссылка доступна авторизованному владельцу.
- [ ] Физическая установка и приёмка на телефоне; реальная запись и новый AI-разбор.

Новый AAB и Google Play Console/закрытый трек этим запросом не обновляются; накопленные документы и reproducible AAB script 1.30 включаются в Git. Старые разборы не переписываются. [Исправления языкового контекста](localization-fixes-checkpoint-2026-10-14.md), [desktop](desktop-topics-checkpoint-2026-10-14.md).

Ignored evidence: `artifacts/android-1.32-{build.log,badging.txt,signature.txt,verification.json}`. APK: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.32.apk`; бинарник и приватные файлы не входят в Git.

Metadata/environment regression: 17 passed. Повторный App+metadata запуск во время Gradle: один native STT testcase timeout 5s; изолированный повтор обоих ru/native сценариев — 2 passed, без изменения кода. Полный UI до сборки — 205 passed.

Production: [web](https://serbian-speaking-trainer.vercel.app), [API](https://serbian-speaking-trainer-api.vercel.app). [APK](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.32/SerboTalk-andorid16-1.32.apk). Browser screenshots: `artifacts/desktop-topics/production-{ru,en}.png`. Дополнительные ignored evidence: `artifacts/android-1.32-{production.json,api-smoke.json,runtime-logs.json,github-release.json,frontend-deploy.log,backend-deploy.log}`.
