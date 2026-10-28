# Android 1.42 / code52 — APK и Google Play AAB, 28.10.2026

Владелец запросил свежий APK и сборку для обновления Google Play, отдельно
подтвердил **1.42 / versionCode 52**. Основа — актуальный main `1c015cb`;
исходники сборки: `6c51862a342a238f562d5bb81455052fcbf66fb9`.
Последующие изменения этого выпуска содержат только документацию.

- [x] Включён весь текущий общий клиент: короткие подсказки RU/EN и оба
  алфавита, личные темы/фразы, Share, email-вход, награды, переход из Android
  Premium на сайт и обновление аккаунта после возврата. После 1.41 клиентских
  изменений не было; включение подсказок нового профиля опубликовано на backend.
- [x] Package 1.42.0, Gradle versionName/code, имя APK и metadata test согласованы.
- [x] 349 frontend tests; после повышения версии отдельно 2 metadata tests;
  ESLint, typecheck, production web build, 5 Node resilience guards passed.
- [x] 24 browser mock scenarios: RU/EN × desktop/mobile/shared Android,
  Premium free/paid и подсказки latinica/ćirilica. Реальные AI не вызывались.
- [x] `pnpm android:cloud-apk`: production build/sync и assembleProdDebug,
  BUILD SUCCESSFUL, 128 tasks. Это прежний устанавливаемый debug APK.
- [x] `scripts/build-android-play-aab.ps1`: production build/sync,
  bundleProdRelease, BUILD SUCCESSFUL, 226 tasks; jarsigner sign/verify.
  Прежний upload key/DPAPI остаются вне Git.
- [x] APK apksigner verify; AAB bundletool 1.18.3 validate/dump и подпись:
  `com.serbiantalk.trainer`, 1.42/code52, min24/target36, HTTPS WebView.
- [x] Все 11 dist files побайтно совпали с APK и AAB. Production API
  `https://serbian-speaking-trainer-api.vercel.app` встроен как default;
  существующий emulator fallback остаётся в JS, но при заданном production URL
  не выбирается. Сохраняется прежняя возможность пользовательского API override.
  Landing/testlab assets отсутствуют; BrowserPlugin/SharePlugin присутствуют.
- [x] APK certificate SHA256:
  `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`.
  AAB upload certificate SHA256:
  `aa7aa2702faafb0270d967d3f4d9a318f24ce26148084acfae304f55e378cf62`.
  Оба совпадают с прежними выпусками. Подписи APK и Play различаются.
- [x] Файлы скопированы в `C:/Users/MSumin/Downloads/`; hashes копий сверены.
  APK `SerboTalk-andorid16-1.42.apk`: 4 654 757 bytes, SHA256
  `49aa676dab07804cf146b2da647f3b5b74db1b4de53fa5243b895fa25a5c1a01`.
  AAB `SerboTalk-android-1.42.aab`: 3 491 027 bytes, SHA256
  `6be4aae3947cf4bce15f0cbeb433d1c4b3de9698f7a21eb475f0cb1994c69206`.
- [ ] Загрузка AAB в Google Play, проверка свободного code52 в Console,
  отправка на проверку и доступность участникам: не запрошены и не выполнялись.
- [ ] Установка на физический телефон, микрофон/OAuth/Share, переход на сайт
  и получение Premium после возврата остаются ручной приёмкой.

Локальные evidence исключены из Git: `artifacts/android-1.42-*` — build/test/
browser logs, APK metadata/signature, AAB manifest/validation/certificate,
verification JSON. Секреты, аудио и бинарные сборки в Git не добавлялись.
Backend/web не развёртываются этим изменением. Исходники и отчёт отправляются
отдельным PR без автоматического merge; опубликованная версия остаётся 1.41.

Готовые release notes для Console (RU/EN):

> Улучшены подсказки и работа с личными темами. Обновлены настройки, вход и
> награды. В разделе Premium доступен переход на сайт; после возвращения
> приложение обновляет статус доступа.

> Improved hints and personal topics. Updated settings, sign-in and rewards.
> Premium provides a link to the website and refreshes access when you return.
