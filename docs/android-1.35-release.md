# SerboTalk 1.35 / code45 — обратная связь и все накопленные изменения

17.10.2026 владелец поручил опубликовать все накопленные изменения и собрать новый APK; **1.35 / versionCode 45** отдельно согласованы в чате. Имя `SerboTalk-andorid16-1.35.apk`.

Состав: текстовая/голосовая обратная связь в настройках RU/EN; отдельная таблица с пользователем, UTC-временем и текстом; Telegram-уведомления о регистрации, отзыве и 20 проверках за день; исходная тема повторяемой фразы; центрирование web-подготовки. Сохранён весь опубликованный набор 1.33/1.34, включая стабильный интерфейс упражнения, компактный результат, 210 фраз с RU/EN подсказками и лимит 20. Актуальный web-лендинг с исходными скриншотами сохранён; в Android пакет входит тренажёр без лендинга.

До объединения локальная копия находилась на старом main; незакоммиченный набор сохранён commit 7864dd1, затем объединён с origin/main 029241c. Опубликованные более новые версии лендинга и интерфейса сохранены. Миграция `713ce912ab30` продолжает `3f90d5a9b8c3`, поэтому Alembic имеет одну head. Загрузчик тестовой SQLite учитывает схему до появления отзывов, сохраняя прежние таблицы и пользователей.

- [x] Номер версии и имя APK согласованы; Android/package metadata обновлены.
- [x] Backend production Telegram-env добавлены как sensitive, без передачи секрета в Git/frontend/APK. Предыдущая реальная тестовая доставка успешна.
- [x] Полный quality gate после объединения: backend/scripts 315 passed / 8 skipped; Node guards 5 passed; frontend 229 passed / 25 files; lint/typecheck/web build.
- [x] Browser regression: **70 passed** — RU/EN desktop/mobile/320px/short/Android-layout, feedback/source topic/loading, practice/hints/compact result, 210-phrase catalog, daily limit/calendar/landing/auth.
- [x] `pnpm android:cloud-apk`: BUILD SUCCESSFUL, 109 tasks. 1.35/code45/min24/target36, production API/HTTPS, без testlab и landing. Все 7 dist assets и 9 packaged public assets совпали с sync. Прежний сертификат SHA256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`. APK 4 491 588 bytes, SHA256 `333acb185b84bfa4f953ea8aa10ab71136648019227fc6b792c4aa1de2fd4f5a`, копия в Downloads.
- [x] [PR #125](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/125) merged: runtime SHA `bd540411de888509f60bab02fbdaa940940d02b4`; CLEAN/MERGEABLE, обязательных GitHub checks нет. Vercel backend `dpl_8PwaMc1Sw9P4anebKAgyDvMhfQLb` и frontend `dpl_4YvRR4cCaqwDQz4a8ygTpcUE88tH` READY/production/main на этом SHA; aliases API/serbotalk.app подтверждены API.
- [x] 17.10.2026, 21:22 МСК: production HTTP root/app/privacy/terms/health — 200; anonymous auth/me и POST feedback — 401. Production build применил миграцию PostgreSQL `3f90d5a9b8c3 → 713ce912ab30`; повторный seed добавил 0 строк. Авторизованный Chrome подтвердил «Фразы для повторения / Кафе», «Review phrases / Café», v.1.35, RU/EN настройки и успешную реальную отправку одного технического отзыва владельца. Русский язык восстановлен. Дополнительно 6/6 browser checks RU/EN desktop/mobile/Android-layout на реальном production bundle с synthetic API/account/audio. Error log rows обоих deployments = 0. Реальных аудио, OpenAI и учебных попыток в smoke не было.
- [x] [GitHub release v1.35](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.35) опубликован как latest; tag/target = runtime SHA. [APK](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.35/SerboTalk-andorid16-1.35.apk): server digest/size и обратная авторизованная загрузка совпали с artifacts/Downloads. Репозиторий private: GitHub-ссылка требует авторизации владельца.
- [ ] Физическая установка, Google OAuth, микрофон и реальная речь на телефоне.

Сохранение пользовательского аудио не добавляется: голосовой отзыв расшифровывается в памяти, перед отправкой пользователь подтверждает текст. Telegram получает email и тип события, без содержания отзыва/аудио. Доставка best-effort с timeout, без постоянной очереди. [Контракт и ограничения](feedback-activity-checkpoint-2026-10-17.md).

AAB и Google Play Console этим поручением не обновляются. Секреты и бинарные артефакты остаются вне Git; локальные доказательства — игнорируемый `artifacts/android-1.35-*`.

Браузерные проверки включают накопленные layout/hints/result/landing/catalog/calendar сценарии. Устаревшая проверка ожидавшейся исходной фразы после результата исправлена согласно уже опубликованному компактному результату. Обнаружен побочный эффект full-page screenshot в Chrome: временный viewport 1×1 пересоздаёт responsive-раскладку; снимок формы заменён на locator screenshot. Runtime-код из-за этого не менялся.

Production: [приложение](https://serbotalk.app/app), [лендинг](https://serbotalk.app/), [API](https://serbian-speaking-trainer-api.vercel.app). Последующий commit доказательств/тестового production-path не меняет deployed runtime. Файл в Downloads: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.35.apk`.
