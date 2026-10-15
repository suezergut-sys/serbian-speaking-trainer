# SerboTalk 1.33 — накопленные обновления после 1.32

15.10.2026 владелец поручил выпустить APK со всеми накопленными обновлениями. После production Android sync и проверок отдельно согласовал **1.33 / versionCode 43**. Обязательное имя: `SerboTalk-andorid16-1.33.apk`.

Набор после 1.32:

- самостоятельные английские подсказки всех 160 фраз и покрытие слов, grammar notes и независимые ключи прогресса;
- флаги RU/EN на входе со стабильными размерами и сохранением языка;
- отдельные разделы аккаунта/удаления, читаемые мобильные данные, обновлённые ru/en тексты мягких подсказок и отладки с уведомлением о временном аудио;
- круглая иконка повторения; тема и оригинал постоянно сверху, без «сменить» и отдельного voice-prompt; answer/translation с одной левой границей; score/verdict по центру; постоянная нижняя панель voice controls;
- закрытие word hints вне слова, по фокусу, Escape и повторному нажатию;
- цвета календарной легенды совпадают с активными днями.

Источник — опубликованный main после PR #107 (`6b69725`), включая web runtime PR #106 (`46b3067`). Отдельный локальный лендинг сохранён в исходной рабочей папке и исключён из APK. Backend/API, scoring, данные и правила обучения не меняются. Новых LLM вызовов и миграций нет. AAB/Google Play не выпускаются.

- [x] Весь набор перенесён штатным production `pnpm android:sync`; в WebView абсолютный HTTPS production API, 9 public assets, без testlab/landing.
- [x] До смены номера: 17 metadata/environment tests и 9 ru/en Android-layout browser scenarios passed (English hints, login, settings/error recovery, exercise, calendar).
- [x] Номер 1.33/code43 отдельно согласован владельцем; package/Gradle/имя APK и metadata test обновлены одновременно.
- [x] Полный UI 210 passed / 20 files; lint passed. `pnpm android:cloud-apk` — BUILD SUCCESSFUL in 1m 7s, 109 tasks. Production Android build включает TypeScript check.
- [x] APK metadata: 1.33/code43, applicationId com.serbiantalk.trainer, min24/target36. HTTPS production API внутри packaged JS, WebView HTTPS без mixed-content override/server URL/testlab/landing. Все 9 packaged public assets совпали с результатом cap sync; 7 web assets побайтно совпали с production Android dist, ещё 2 — Cordova shims.
- [x] Подпись SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпала с опубликованным APK 1.32. APK 4475926 bytes, SHA-256 `edb2e1e46dbaf35ba3ee9a5c06e5135432ff8f8677d13d83d94ce0b9f0b3947d`. Копии artifacts и `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.33.apk` совпали.
- [ ] PR/merge и GitHub release/tag/asset digest/обратная authenticated загрузка.
- [ ] Физическая установка, Google OAuth, реальный микрофон и AI-разбор на телефоне.

Предыдущие записи backlog о «будущем APK» отражают состояние на дату конкретной доработки. Этот выпуск закрывает перенос накопленного исходного кода, но не закрывает исторические пункты ручной/физической приёмки, Google Play и P0/P1/P2 целиком.

Evidence (ignored): `artifacts/android-1.33-*`.
