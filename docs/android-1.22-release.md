# SerboTalk 1.22 — диагностика STT и анализ мягких подсказок

05.10.2026 владелец отдельно подтвердил 1.22 / versionCode 32 после 1.21 и поручил production-публикацию и новый APK. Состав: весь накопленный клиент — безопасные причины ошибок расшифровки, анализ каждой enabled транскрибации по канону/вариантам без словаря, объяснения и статус помощи, подтверждение/отмена всех предложений без лимита трёх. Исходная расшифровка сохраняется при сбое дополнительного анализа; принятая помощь не повышает освоение. [Функциональные проверки](transcription-analysis-checkpoint.md).

- [x] Номер версии согласован, package/Gradle/имя APK и metadata tests 2/2 обновлены согласованно.
- [x] `pnpm android:cloud-apk` прошёл: Android build mode → cap sync → assembleProdDebug. Включён весь накопленный клиент, исходный web bundle в APK не копировался.
- [x] aapt: package `com.serbiantalk.trainer`, versionName 1.22, versionCode 32, minSDK 24 / targetSDK 36. Signature v2 verified; certificate SHA-256 совпадает с 1.21.
- [x] Production assets guard прошёл: testlab login/config и mixedContent отсутствуют. Семь файлов Android dist совпали с APK побайтно; HTTPS production API присутствует. В packaged JavaScript есть новый status/error контракт, нет постоянного ключа OpenAI. Старый неиспользуемый emulator fallback из baseUrl остаётся в коде, production endpoint задан Android env и проверен build guard.
- [x] Backend production env содержит OPENAI_API_KEY, OPENAI_TEXT_MODEL и OPENAI_TRANSCRIBE_MODEL; отдельно добавлены OPENAI_ASSISTANCE_TIMEOUT_SECONDS=6 и OPENAI_ASSISTANCE_MAX_RETRIES=0. Значения секретов не выводились. Миграций БД нет.
- [ ] GitHub PR/merge и release asset.
- [ ] Frontend/backend Vercel READY на release SHA и production smoke.
- [ ] Физическая приёмка OAuth/STT и качество реальных AI-гипотез; ADB/AVD не запускались.

Артефакт: `SerboTalk-andorid16-1.22.apk`, 4 427 446 bytes, SHA-256 `10a3967446948dc205594a84146eea32188f8911955aa97fcc7458ebac4a1ed8`. Certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` — прежняя подпись опубликованных APK. Копии: `artifacts/SerboTalk-andorid16-1.22.apk` и `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.22.apk`; APK не коммитится.

Функциональный gate перед релизом: 213 backend/scripts passed / 8 skipped, 139 frontend passed, Node guards 5 passed, lint/typecheck/web build; Chrome web/Android-layout 2 passed плюс STT network recovery 1 passed. Последующее изменение затрагивает только согласованную release metadata: два metadata tests и native production build прошли. Build предупреждения о chunk >500 kB и Gradle flatDir/SDK parser остаются; сборки успешны.
