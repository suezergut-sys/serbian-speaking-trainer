# SerboTalk 1.21 — мягкие подсказки и кнопки ответа

03.10.2026 владелец отдельно подтвердил1.21/versionCode31 после1.20. Состав: весь накопленный клиент из [PR61](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/61), включая выключенную по умолчанию настройку мягких подсказок, исходный transcript/отмену/подтверждение и сохранение evidence при ручной правке; кнопки проверки и повтора по референсу. Backend ранее опубликован и проверен, контракт совместим с прежними APK. [Функциональные доказательства](soft-assistance-checkpoint.md).

- [x] Номер1.21/code31 отдельно согласован.
- [x] Production APK `SerboTalk-andorid16-1.21.apk` собран через `pnpm android:cloud-apk`/assembleProdDebug в Android build mode.
- [x] aapt/apksigner и production asset guard прошли; версия1.21/code31, package `com.serbiantalk.trainer`, minSDK24/target36. Все7 dist files совпали побайтно с APK, production API `https://serbian-speaking-trainer-api.vercel.app` присутствует. Testlab/mixedContent/local key/permanent-key patterns отсутствуют. Metadata tests2/2 и TypeScript/native production build прошли.
- [x] [PR #63](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/63) merged; release SHA `e48c7415a92169df43c15505f55648cbd3274506`. [GitHub release v1.21](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.21) опубликован: asset608435108, один production APK; серверный digest/size совпадают с локальным файлом.
- [x] Frontend deployment `dpl_6FKn3JXqXhSobF7ZVzZEfaEjKDGS` READY/production, gitCommitSha и production alias подтверждены на release SHA. [Deployment](https://serbian-speaking-trainer-67b1qeijm-suezerguts-projects.vercel.app), [production](https://serbian-speaking-trainer.vercel.app). Все7 публичных файлов побайтно совпали с APK/native dist; /, /privacy, /terms200, testlab404. Авторизованный IAB smoke: готовая практика → настройки с switch Value0 → практика; console errors0. Реальный голос/выход/смена предпочтений не выполнялись. Backend из PR61 остаётся опубликованным; изменений API в release metadata нет.
- [ ] Физическая OAuth/STT приёмка. ADB/AVD и телефонные тесты остаются остановленными владельцем, данные приложения не сбрасываются.

## Артефакт

- Размер4 426 142 bytes; SHA-256 `a62635d37633e876fe79cb60b142c0666b7f20534ca2259bc5bfeb85b2217faf`.
- Certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`, совпадает с1.20; прежний debug-сертификат, как у опубликованных версий.
- Проверенные копии: `artifacts/SerboTalk-andorid16-1.21.apk` в release worktree/старом checkout и `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.21.apk`. Артефакт не коммитится.

Функциональный gate из PR61: frontend121 passed, backend/scripts179 passed8 skipped, Chrome11 scenarios и Node guards5/5. Номер меняет только release metadata, функциональный код тот же.

[Скачать APK 1.21](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.21/SerboTalk-andorid16-1.21.apk). Downloads и обе artifacts-копии проверены по SHA-256.
