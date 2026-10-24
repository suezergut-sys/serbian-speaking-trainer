# Личный каталог: серверный перевод, лимиты и удаление — 23.10.2026

## Итог

Реализованы и опубликованы требования владельца: до **15 слов в исходной фразе**, до **5 пользовательских тем**, до **30 фраз в каждой**, общий предел **150 своих фраз**. Новые фразы добавляются только в личные темы; системный каталог и его размеры не меняются. Выученные личные карточки тоже занимают место в лимите.

Канонический сербский перевод формирует только модель. UI показывает preview обычным текстом, без редактора. Сохранение больше не принимает исходный текст, canonical, варианты или hints от клиента.

Вход в управление: «Свои темы и фразы» под карточками тем; из формы при достижении лимита доступна кнопка «Удалить свои фразы или темы». Доступ UI по-прежнему только у admin. Все сообщения, подтверждения, состояния запроса и действия реализованы в RU/EN и общем desktop/mobile/Android-layout.

## Новый контракт и данные

- `POST /api/review-phrases/prepare` принимает `source_ru`: 3–240 символов и максимум 15 слов. Слова считаются по пробельным разделителям; несколько пробелов/переносы строк схлопываются, слово с дефисом считается одним. Превышение отклоняется **до AI-вызова**, код validation error `phrase_word_limit`.
- Валидированный результат AI сохраняется в owner-scoped `phrase_preparation_receipts`. Ответ содержит `preparation_id` и preview. Подготовка пригодна для сохранения **30 минут**, просроченные записи этого владельца физически очищаются при следующей подготовке.
- `POST /api/review-phrases` принимает **только** `{ preparation_id, topic_id }`. Дополнительные поля отклоняются 422. Canonical/варианты/hints читаются из серверной записи; чужой/просроченный/уже удалённый результат использовать нельзя.
- После успешного сохранения повтор того же запроса возвращает прежнюю карточку, без дубля. Использованный результат нельзя сохранить в другую тему или использовать для восстановления удалённой карточки.
- Повторное добавление того же исходного текста в ту же тему сохраняет canonical и весь прогресс. Если исходный текст уже есть в другой теме/системной карточке, API возвращает конфликт и UI предлагает сначала удалить прежнюю собственную фразу. Неявного переноса или редактирования больше нет.
- `GET /api/topics` дополнен `custom_phrase_count` — числом собственных карточек всех статусов, отдельно от счётчика неизученных. Ограничения проверяются сервером под существующей блокировкой UserRepository; UI даёт предварительное сообщение и ссылку на управление.
- Новая Alembic-миграция **a910bc57d302** после **84bc27e9a101** создаёт таблицу результатов подготовки. Перед запуском обновлённого backend требуется штатный `alembic upgrade head` из backend-окружения целевого развёртывания. Проверены upgrade → upgrade → downgrade → upgrade на отдельной SQLite БД. Downgrade удаляет только временные результаты подготовки; пользовательские карточки не затрагиваются.
- Контракт save намеренно несовместим со старым body с `canonical_sr`; старые методы чтения/практики сохранены. В опубликованном APK кнопки добавления были отключены; новый UI требует новый backend и миграцию. Новых env/секретов нет.

## Удаление

- `GET /api/custom-phrases` возвращает собственные некаталожные карточки всех статусов, включая выученные и старые личные карточки вне новых тем.
- `DELETE /api/custom-phrases/{id}` удаляет только собственную личную карточку; удаление системной каталожной карточки или чужой записи возвращает 404.
- `DELETE /api/topics/{id}` разрешён только для своей темы `is_custom`; удаляет **все** ReviewPhrase этой темы, затем саму тему в одной транзакции. Готовые темы защищены, даже для admin.
- Подтверждение явно сообщает о каскаде. При отмене ничего не меняется; при ошибке список сохраняется и можно повторить запрос. Фокус переводится к подтверждению, чтобы оно было доступно после прокрутки длинного списка. Закрытие управления доступно вверху.
- Слот темы/фразы освобождается после удаления; интерфейс обновляет каталог и summary повторения. Все новые DELETE включены в CORS, в том числе для native origin `http://localhost`.
- История выполненных Attempt/Exercise и агрегированная статистика сохраняются. Связанные активные отдельные сессии становятся недоступными; упражнения удалённых карточек помечаются как удалённый контент. Проверка запрещает позднее сохранение и в начале запроса, и после уже начавшегося AI-анализа. Повтор старого request ID также не отдаёт удалённое упражнение. Карусель может продолжить остальные карточки.

## Проверки

- Полный frontend: **289 passed / 32 files**, затем отдельно **3 manager tests passed** после улучшения фокуса подтверждения.
- Финальный полный backend: **328 passed / 8 skipped**. Отдельный targeted custom content/migration/concurrency/attempt прогон: **35 passed**.
- Финальные `pnpm lint`, `pnpm build` (TypeScript + production bundle) и `git diff --check` прошли. В сборке остаётся предупреждение о chunk >500 kB; pytest сообщает deprecation warnings зависимостей.
- **6 browser mock scenarios passed**: RU/EN × desktop/mobile/shared Android-layout; создание темы, prepare-preview-save с точным body без canonical, счётчики, тёмные controls/overflow, отмена/подтверждение удаления фразы и темы. Скриншоты локально `artifacts/custom-content/*` и `*-delete.png`; просмотрены RU desktop и EN mobile подтверждения.
- Проверены 15/16 слов, 5/6 тем, 30/31 фраза с выученной карточкой, общий предел 150, освобождение места после удаления, сохранение duplicate canonical/streak, чужие ID/receipt, expiry, запрет подмены body, защита preset тем, native CORS.
- File-backed SQLite concurrency test с двумя отдельными Session/потоками: конкурирующие запросы на последнее место дают один успех и один quota conflict; итог ровно 5 тем / 30 фраз.
- Удаление в середине анализа не восстанавливает фразу; отдельная сессия блокируется, карусель сохраняет другие фразы. Существующая история попыток после удаления темы не меняется.
- Все автоматические AI-вызовы замоканы; API-бюджет и production-каталог не использовались. Реальный OpenAI-перевод, PostgreSQL concurrency и production UI этим прогоном не проверялись.

## Статусы и оставшиеся ограничения

- [x] Локальная реализация, API/БД/unit/component/migration/concurrency/browser mock checks.
- [x] 23.10.2026: [PR #143](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/143), backend/web Ready/main/aliases на `69ff666`; миграция и авторизованная production-проверка подтверждены ниже.
- [ ] Ручная приёмка владельцем с реальным переводом.
- [ ] Android build/устройство по отдельной команде; 1.38/code48 и package version этой задачей не менялись.
- [ ] API добавления по-прежнему разрешён любому вошедшему владельцу своего каталога; admin-only остаётся UI-политикой. Отдельные server roles и частота prepare не изменялись этой задачей.
- [ ] Реальная производственная нагрузка/гонки на PostgreSQL и многодевайсная приёмка.

Посторонние изменения рабочей копии сохранены; Git commit/PR/deploy не выполнялись. Прежний [аудит](custom-content-audit-2026-10-23.md) отражает исходное состояние; пункты доверия к canonical, лимитов, удаления, переноса дублей и конкурирующих вставок закрыты этим изменением в описанных границах.

## Подготовка production-релиза

23.10.2026: релиз из отдельной чистой ветки `codex/custom-content-production`, без посторонних ShareApp/регрессий и без изменений Android/package/lockfile. Полный `scripts/check.ps1`: **373 backend/scripts passed, 8 skipped; 5 Node guards; 270 frontend tests; lint/typecheck/production build**. **6 browser mock checks** RU/EN desktop/mobile/shared Android-layout.

Расширенный gate обнаружил отсутствие новой схемы в testlab bootstrap. Добавлено точное распознавание предшествующей 84bc27e9a101, с сохранением более старых путей миграции, и отдельная регрессия. Независимая env-зависимость теста model-debug воспроизведена на чистом HEAD baseline (503 без локального API config); тест теперь явно подставляет свои synthetic settings, runtime не менялся.

Публикация: backend первым через принятый Vercel CLI workflow (Git integration отсутствует), build применяет Alembic/идемпотентный seed под существующей advisory lock; frontend после Ready/проверки API. Production projects и имена env проверены без вывода значений. Итоговые SHA/PR/deployment/проверки записываются после выпуска.

## Production — 23.10.2026

Проверки завершены 23.10.2026, 12:50 МСК.

- [PR #143](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/143) merged; runtime SHA **69ff6665af682c00c815fc84d8fee34fbaf66ee5**. CLEAN/MERGEABLE, GitHub checks отсутствуют. Выпущен чистый `git archive` merged SHA; gitCommitSha/githubCommitSha/main заданы явно и совпадают в Vercel API.
- Backend: **dpl_D7vM9otpbiECQ5VUrjquGyQnJbJs**, [deployment](https://serbian-speaking-trainer-oynpufzxz-suezerguts-projects.vercel.app), Ready/production; alias **serbian-speaking-trainer-api.vercel.app** подтверждён API. Build применил PostgreSQL migration 84bc27e9a101 → a910bc57d302; seed добавил **0 skills / 0 topics / 0 phrases**.
- Web: **dpl_7obDXvhcnocugbLqfUquoC1NC9X8**, [deployment](https://serbian-speaking-trainer-m6mfmreig-suezerguts-projects.vercel.app), Ready/production; aliases **serbotalk.app** и **serbian-speaking-trainer.vercel.app** подтверждены API. Основной URL: [serbotalk.app/app](https://serbotalk.app/app).
- HTTP root/app/privacy/terms/health: 200. Anonymous topics/custom-phrases: 401. Production OpenAPI содержит DELETE routes и save-schema только preparation_id/topic_id; canonical не принимается.
- В существующей авторизованной Chrome-сессии владельца проверены активные admin-кнопки, форма темы RU/EN со счётчиком 0/5, форма фразы, предупреждение 16/15 слов и disabled submit, успешная загрузка пустого личного каталога. Никакие реальные темы/фразы не создавались и не удалялись, AI/попытки не запускались. Исходный RU восстановлен, debug/assistance/model настройки не менялись. Console errors: **0**.
- **6/6 production browser mock checks** на реальном serbotalk.app/app bundle: RU/EN × desktop/mobile/shared Android-layout, prepare-preview-save, точный save-body без canonical, отмена/подтверждение удаления фразы/темы, счётчики и палитра. API/auth синтетические: production-каталог и AI-бюджет не затронуты.
- Vercel runtime error log rows: **0 backend / 0 frontend** на момент проверки. Прежние личные каталоги и назначенные access tiers не менялись; выпуск Android не выполнялся.

Локальные доказательства вне Git: `artifacts/custom-content-{backend,frontend}-deploy.log`, `*-deployment.json`, `*-errors.jsonl`, `custom-content-backend-smoke.json`, `custom-content-production-http.json`, `custom-content-release-checks/*`. Документальный follow-up commit фиксирует выпуск и не требует redeploy runtime.
