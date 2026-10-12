# SerboTalk 1.29 — Android

12.10.2026 владелец поручил обновить Android для проверки и скриншотов с телефона, отдельно согласовал `1.29 / versionCode 39`. Включён весь накопленный frontend после 1.28: актуальное пояснение owner-scoped аудио отладки (PR #89), вход ревьюера по email/паролю и инструкция удаления из настроек (PR #91). Backend уже опубликован; новых миграций нет.

Подготовлен [draft PR #92](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/92), исходный commit `58a3fe2`. Публикация выпуска и слияние metadata ожидают телефонной проверки; функциональный web из PR #91 уже опубликован.

- [x] Package 1.29.0, Gradle 1.29/code39, имя `SerboTalk-andorid16-1.29.apk`; 19 targeted metadata/environment/settings tests прошли.
- [x] `pnpm android:cloud-apk`: BUILD SUCCESSFUL, 109 tasks. APK production flavor `prodDebug`, прежняя подпись для обновления установленного APK. Это сборка для телефонной проверки, не подписанный release AAB для Google Play.
- [x] Package com.serbiantalk.trainer, minSDK24/targetSDK36, HTTPS WebView; production API https://serbian-speaking-trainer-api.vercel.app внутри APK. Review login и `/delete-account` присутствуют; testlab/local config/mixed content отсутствуют. Все 7 dist files совпали побайтно с packaged assets.
- [x] apksigner verify; certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпал с 1.28. APK 4 434 486 bytes, SHA-256 `ddfa95553ac3b9f166d1d8560f02b32cccb37580d1ce548ecb85699bc0b89cb5`. Копии artifacts и Downloads проверены.
- [x] 5 Node resilience guards прошли. Предшествующий runtime frontend: 196 tests / 18 suites, lint/typecheck/build. Изменения после него — только согласованные metadata и документация.
- [ ] Публикация GitHub/Web metadata 1.29 и подтверждение deployment/alias/SHA.
- [ ] Физическая приёмка: установка поверх 1.28, вход тестовым аккаунтом, голосовой ответ, ссылка удаления, версия в настройках.
- [ ] Скриншоты с телефона для карточки Google Play, отдельно release AAB/подпись и закрытый тест.

Локальная копия: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.29.apk`. Доказательства в игнорируемом artifacts: android-1.29-build.log, badging.txt, signature.txt, verification.json. APK и секреты в Git не входят.
