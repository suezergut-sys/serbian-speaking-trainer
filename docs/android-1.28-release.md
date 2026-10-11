# SerboTalk 1.28 — Android и web

11.10.2026 владелец поручил выпуск и отдельно подтвердил `1.28 / versionCode 38`. APK включает весь backlog после 1.27: предупреждение после трёх записей с несербскими буквами подряд, две отключённые премиум-карточки в сетке тем, золотую звезду от 20 попыток за день и версию справа от заголовка настроек.

- [x] Метаданные package/Gradle/имя APK согласованы: 1.28.0, 1.28/code38, SerboTalk-andorid16-1.28.apk. 3 targeted metadata/settings tests passed.
- [x] Chrome mock mobile web 320/390px и native layout 393px — 3 passed с номером v.1.28, двумя disabled карточками/badges, сеткой и звездой. Общий quality gate: 257 backend/script tests / 8 skips, 5 Node guards, 192 frontend tests, lint/typecheck/build; [доказательства](premium-phrase-checkpoint-2026-10-11.md).
- [x] pnpm android:cloud-apk: BUILD SUCCESSFUL, 109 tasks; 7 dist files побайтно совпали с APK. Package com.serbiantalk.trainer, 1.28/code38, minSDK24/targetSDK36. HTTPS WebView и absolute production API https://serbian-speaking-trainer-api.vercel.app проверены; testlab/local config/mixedContent и секретных ключей нет.
- [x] apksigner verify: certificate SHA-256 1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0 совпал с 1.27. Файл 4 432 362 bytes; SHA-256 aa79a74956cde264572af04a553f0d4114890ef9cb3476f6703775cefb9086cb. Доказательства: artifacts/android-1.28-{build.log,verification.json,badging.txt,signature.txt,metadata-tests.log,e2e.log}.
- [x] PR #87 merged, runtime SHA 670ad80c950e88fe1582b36591fa6e3f477d49e5; CLEAN/MERGEABLE, назначенных checks нет. Vercel dpl_F3PxF2Psd5YD5Q6Qoi6BdoN5S6aR READY / production; alias/SHA/main подтверждены API. Авторизованный production smoke 390px: v.1.28 справа от Настройки, обе карточки disabled и PremiumBadge; console errors []. HTTP API health 200. Runtime error logs пусты. Все 6 JS/CSS web побайтно совпали с assets APK.
- [x] GitHub release v1.28 опубликован; tag/target совпали с runtime SHA. Asset state uploaded, server size/digest совпали с APK. Копии artifacts/Downloads имеют тот же SHA-256.
- [ ] Физическая приёмка, обновление установленного APK и реальная речь.

APK и локальные логи/артефакты не коммитятся. Физическая приёмка и P0/P1/P2 остаются отдельными задачами.

[Скачать SerboTalk-andorid16-1.28.apk](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.28/SerboTalk-andorid16-1.28.apk). Локальная копия: C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.28.apk.

[Web](https://serbian-speaking-trainer.vercel.app/), [deployment](https://serbian-speaking-trainer-lg44d48lj-suezerguts-projects.vercel.app), [PR #87](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/87). Локальные доказательства: artifacts/web-1.28-{deploy.log,api.json,errors.log,assets.txt,settings.png,topics.png}, artifacts/android-1.28-github-release.json.
