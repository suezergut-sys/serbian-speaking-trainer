# SerboTalk 1.26 — Android-релиз

08.10.2026 владелец отдельно подтвердил 1.26 / versionCode 36. Весь накопленный набор после 1.25 перенесён: восстановление сомнительной STT-расшифровки, общий мобильный layout, компактные мягкие подсказки и независимые строки нескольких исправлений. Принятая STT-подсказка сохраняет обычный сценарий роста освоения и интервала повторения при верном ответе. Серверная часть уже опубликована в PR #77; [production-проверки](assistance-publication-2026-10-08.md).

- [x] Версия согласована, metadata/environment: 17 tests passed.
- [x] `pnpm android:cloud-apk`: Android production mode → cap sync → assembleProdDebug, BUILD SUCCESSFUL, 109 tasks. Package com.serbiantalk.trainer, 1.26/code36, minSDK24/targetSDK36.
- [x] APK signature v2 verified; certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с 1.25, обновление совместимо по подписи.
- [x] Все 7 dist files совпали с пакетом; все 6 JS/CSS побайтно совпали с опубликованным web. В пакете абсолютный API `https://serbian-speaking-trainer-api.vercel.app`, HTTPS WebView, testlab/local configuration/mixedContent отсутствуют.
- [x] Копии в artifacts и Downloads совпали по SHA-256. Локальные доказательства: `artifacts/android-1.26-build.log`, `artifacts/android-1.26-verification.json`.
- [x] [PR #79](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/79) merged, release SHA `6596ffd71487faf162a3d0bd19c1207f21007c28`; MERGEABLE/CLEAN, назначенных checks нет.
- [x] [GitHub release v1.26](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.26) опубликован; tag/target совпали с release SHA. Asset uploaded, server digest `sha256:e0427e8d05d503f6cc1e2c92ac6438574630a187e666792f4bb283934a10c399` и size 4 431 246 совпали с APK и Downloads.
- [ ] Физическая Android-приёмка, реальная речь, клавиатура и обновление установленного приложения. P0/P1/P2 целиком не закрыты.

`SerboTalk-andorid16-1.26.apk`: 4 431 246 bytes, SHA-256 `e0427e8d05d503f6cc1e2c92ac6438574630a187e666792f4bb283934a10c399`. Копия: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.26.apk`. APK и логи не коммитятся.

Функциональные проверки web/backend: 256 passed / 8 штатных skips; targeted assistance 34 passed; frontend 183 passed, lint/typecheck/build; четыре Chrome mock-сценария production assets и native startup/pager. Настоящих AI-вызовов и сохранения аудио в проверках нет. Известные предупреждения chunk >500 kB и Gradle flatDir/overridePathCheck не блокируют сборку. Runtime web/backend остаётся на проверенном `1229383da0c0984d0de039d7bd22c3c9ceaac358`; metadata APK не требует повторного deploy.

[Скачать APK 1.26](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.26/SerboTalk-andorid16-1.26.apk).
