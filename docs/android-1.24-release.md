# SerboTalk 1.24 — пояснения ошибок

07.10.2026 владелец поручил публикацию web/backend и новый APK, отдельно подтвердил 1.24 / versionCode 34. Состав: удалены сообщения об отсутствии мягких подсказок и ручной правке; новые разборы требуют причины каждой ошибки и объясняют смысл/контекст/правило. Добавлены проверки сохранения настройки при перезапуске и смене клиента. Алфавит пока локальный; старые разборы автоматически не переписываются.

- [x] Функциональный gate: полный backend/scripts pytest (8 штатных skips), frontend 158 tests, App/Assistance 89, adapter/analyzer 33, attempts API 7, lint/typecheck/web build. Node Android guards 5 passed; AI-вызовы в тестах mock.
- [x] Версия 1.24/code34 отдельно согласована; metadata обновлена.
- [x] `pnpm android:cloud-apk` успешен: Android mode → cap sync → assembleProdDebug. Metadata/environment 17 tests passed. aapt: package com.serbiantalk.trainer, 1.24/code34, minSDK24/targetSDK36. Signature v2 verified, прежний сертификат. Семь dist files совпали с APK; HTTPS production API и explanation_ru есть, двух удалённых сообщений/секретов/testlab/mixedContent нет.
- [x] PR #69 merged, Vercel READY frontend/backend, production smoke и восстановление включённой настройки после reload подтверждены.
- [x] GitHub APK опубликован, размер/digest совпали с локальным APK и копией Downloads.
- [ ] Физическая OAuth/STT-приёмка и оценка качества реальных AI-объяснений; ADB/AVD не запускались.

[Функциональные доказательства](explained-feedback-checkpoint.md), [сохранение настройки](preference-persistence-checkpoint.md). Миграций БД в этом релизе нет; общий профиль 1.23 продолжает использоваться. Публикация, сборка и физическая приёмка учитываются отдельно; весь P0/P1/P2 не закрыт.

Артефакт `SerboTalk-andorid16-1.24.apk`: 4 428 846 bytes, SHA-256 `f202b784520860266bdf8fab6b141399de9c95eec16dde9260ecc0041f8600ad`. Certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с 1.23. Копии: `artifacts/SerboTalk-andorid16-1.24.apk` и `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.24.apk`, хэши совпали. APK не коммитится. Предупреждения Vite chunk >500 kB и Gradle flatDir сохраняются; сборки успешны.

Runtime опубликован через [PR #69](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/69), main SHA `00ad59e80cc7370244a724c9671db865155e00a9`. У PR не было назначенных CI checks; mergeability CLEAN. Последующий commit доказательств меняет только документацию, повторный deployment не требуется.

Vercel production CLI deployments: backend `dpl_EYAsDE4NZFDdTanscFGwr4sMq94s`, frontend `dpl_79e4EpjnEEFx9Ytp1CZn5aBsyjmm`, оба READY и указывают на runtime SHA. Dirty metadata frontend относится только к незакоммиченной записи результатов в этом документе; runtime файлы не менялись. Aliases: [web](https://serbian-speaking-trainer.vercel.app), [API](https://serbian-speaking-trainer-api.vercel.app). API health ok; OpenAPI содержит explanation_ru, preferences без авторизации возвращает 401. Alembic/seed прошли без новой миграции и без вставок. Runtime error logs обоих deployments за 15 минут не содержали записей.

Авторизованный Chrome smoke: практика загрузилась, Backend готов; настройки показали включённые мягкие подсказки до и после полного reload. Выбор пользователя не изменялся. Console errors отсутствовали. Все шесть публичных JS/CSS assets byte-for-byte совпали с APK. Новый explanation_ru и удалённые сообщения проверены автоматическими тестами/контрактом/пакетом; реальные AI-объяснения и голос не вызывались при smoke.

[GitHub release v1.24](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.24) target SHA совпадает с runtime. Asset uploaded, server digest `sha256:f202b784520860266bdf8fab6b141399de9c95eec16dde9260ecc0041f8600ad`, size 4428846. [Скачать APK](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.24/SerboTalk-andorid16-1.24.apk).
