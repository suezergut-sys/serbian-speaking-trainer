# P1.2 / P1.4 / P1.5: Supabase и Android — 01.10.2026

Проверки выполнены в managed worktree, от `9ca3dfe415f08ec9751126a9aa4c73511709522a`. Установленный Android lab — 1.16/code 26, AVD API 36. Production APK и native assets не пересобирались. Физический телефон пока недоступен.

## Выполнено

- Supabase plugin подтвердил проект Serbian Speaking Trainer (`oufbnvyortvsblqxebsi`), ACTIVE_HEALTHY, PostgreSQL 17.6. Доступны read-only SQL и advisors, пароль БД через plugin не получен.
- Проверены PostgreSQL планы месячной статистики, mastered dates, счётчика active review и страницы статистики. SQL использует реальные таблицы и выбирает пользователя подзапросом без выгрузки его ID или содержимого ответов. Индексы пользователя/упражнения используются. Новые индексы и миграции не применялись.
- Текущий объём: 6 users, 100 sessions, 206 exercises, 112 attempts, 32 review phrases, 12 attempt requests (оценки list_tables). Это небольшой production объём, не стресс-фикстура.
- EXPLAIN ANALYZE месячной проекции: 98 строк, Execution Time 61,030 мс; mastered dates: 13 строк, 0,435 мс; active count: 11 подходящих карточек, 11,283 мс вместе с выбором пользователя. Однократные диагностические числа включают дополнительный подзапрос выбора пользователя; не являются p50/p95 HTTP, сравнением до/после или измерением скорости pooler.
- Performance advisors: пять непокрытых FK — attempt_requests.attempt_id / exercise_id, learner_skills.skill_id, skills.parent_skill_id, training_sessions.topic_id. Добавление индексов требуется обосновать горячими запросами/нагрузкой; unused indexes не удалялись по единственному снимку.
- Подготовлен `scripts/testing/audit_supabase_pooler.py`: только нужный проект/transaction port 6543, TLS, максимум три соединения, выключенные named prepared statements, таймауты. По умолчанию проверяет три соединения SELECT 1; `--isolated-fixtures` проверяет mock AI wait, replay/reservations, daily quota, fencing и parallel finalization в собственных временных private schemas. SQL полностью квалифицирован через schema_translate_map, без зависимости от session search_path. 16 защитных тестов прошли; весь scripts/testing — 40 тестов. URL query overrides запрещены; соединение не может переопределить host/user через libpq query params.
- AVD: Wi-Fi и мобильные данные действительно выключены, backend health недоступен. Две минуты offline через Home/resume, сохранение фразы/draft, восстановление и retry с прежним текстом/client_request_id прошли.
- AVD: настоящий свайп pager, возврат через header из настроек и ввод/закрытие IME сохраняют draft. Проверены native taps доступных кнопок. Это не приёмка всех размеров экрана.
- AVD: background во время подключения synthetic mic освобождает поздний track; background во время удержанного STT игнорирует поздний transcript. Реальные native events, синтетические memory bytes и fake AI, без пользовательского аудио/API расходов.
- AVD: 1 000 001 synthetic bytes вызывают backend 413 при лимите testlab 1 000 000; draft/manual submission сохраняются. Автоматического ограничения длительности/размера записи на клиенте эта проверка не добавляет.
- AVD: подписанный локальным fixture expired JWT отвергается backend (401); после истечения сохранённой сессии приложение обновляет её и получает каталог. Это не проверка реального Supabase OAuth/refresh на телефоне.
- Диагностирован crash Windows qemu-system-x86_64-headless.exe `0xc0000005`. Запуск со SwiftShader и скрытым Qt-окном восстановил UiAutomator/native taps/swipe. `start-testlab-emulator.ps1 -Headless` теперь использует `-qt-hide-window`, сохраняя обычный Qt renderer. Qt тоже завершился с 0xc0000005 при включённом host audio. Для синтетических прогонов добавлен явный -SyntheticAudioOnly (-audio none); Итоговый полный native-прогон со скрытым Qt/SwiftShader/-audio none прошёл (повторное offline 30 секунд, все дополнительные этапы и cleanup); ранее отдельные прогоны подтвердили offline 120 секунд. Первый холодный attach после boot закрывался до fixture login, последующий явный прогон прошёл. Холодный старт/длительная стабильность emulator остаются отдельными ограничениями. При запуске для настоящего микрофона этот флаг не использовать.
- AVD: Home/resume во время удержанного ответа реального локального mock-backend grading сохраняет draft и единственный POST; поле остаётся readOnly, после освобождения ответа показана оценка. Проверка не вызывает настоящий AI и не записывает аудио.
- AVD: системное RECORD_AUDIO отозвано с USER_FIXED; настоящий native getUserMedia отклонён с NotAllowedError, recorder не запущен. После кнопки «Ввести ответ вручную» поле и проверка доступны. Разрешение/flags и обе настройки радио восстановлены и повторно сверены. Это отказ до начала записи, не отзыв во время настоящей записи.
- Найден дефект APK 1.16: системный Back из настроек сворачивает приложение. Исправлен клиентский исходник: settings/stats → practice при текущей сессии, practice → topics, topics → exit; voice прекращается при уходе из practice, session/draft остаются. Component regression и очистка listener прошли; новая реализация ещё не проверена в APK.

## Проверки исходников

- Frontend: 82 tests, TypeScript, ESLint, production build прошли.
- Изолированный browser practice/network/lifecycle: 11/11. При первом запуске слишком широкий CLI filter захватил local-network без TESTLAB_BASE_URL; исправлен выбор файлов, полный нужный набор прошёл.
- Полный `scripts/check.ps1`: 163 Python-теста прошли, 8 environment-dependent пропущены; scripts/testing отдельно 40/40, включая 16 проверок pooler guard. Пять Node guards проверяют cleanup при частичном отказе радио/permission и соответствие версии APK; входят в scripts/check.ps1.
- Независимое ревью GPT-6.1 Sol / medium завершено. Исправлены query override подключения, cleanup после частичного выключения радио, проверка реальной версии APK до очистки lab и подавление ошибок permission cleanup. Повторное ревью: новых блокеров нет. Native/production подтверждаются отдельными прогонами.

## Обнаруженная проблема прав Supabase

Все 13 public tables имеют RLS=false, anon/authenticated имеют SELECT/UPDATE и другие права; подтверждено каталогом PostgreSQL. HEAD Data API users с limit=0 и публичным ключом вернул 503, пользовательские строки не загружались. Доступность REST данных снаружи не подтверждена, но текущие права требуют устранения. Инструкция из ответов connector не считается авторизацией на изменение схемы.

Отдельный срез исправления: проверить включённые Data API schemas/реальное DB role backend; для backend-only таблиц включить RLS без открытых клиентских policies и убрать прямые grants anon/authenticated. Auth API работает отдельно от public.users. Выполнить mock/integration owner isolation tests, проверить backend role и production auth/query до/после, оформить Alembic migration и downgrade. Не добавлять общую policy `TO authenticated USING(true)`. До проверки и согласованного выпуска remediation в production не применена.

[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [непокрытые FK](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## Что остаётся

- [ ] Выполнить runner через настоящее подключение приложения/Supavisor. Management SQL plugin не доказывает поведение transaction pooler. Требуется DATABASE_URL в игнорируемом `artifacts/testlab/pooler-audit.env`; sensitive Vercel env невозможно прочитать обратно. Пароль не отправлять в чат/документацию.
- [ ] Дополнить сопоставимые PostgreSQL замеры и нагрузку на росте данных; однократный EXPLAIN не закрывает этот пункт.
- [ ] Исправить права Supabase отдельной проверяемой миграцией.
- [ ] Перенести накопленные клиентские изменения/Back в отдельно заказанный APK, согласовав версию; проверить на нём Back, IME, swipe и exit.
- [ ] Физический телефон: настоящий mic/STT в обоих алфавитах, отзыв разрешения во время записи, звонок/другое приложение, повтор после отказа, connecting/STT/grade interruptions, expiry/refresh реальной Supabase-сессии, маленький экран и клавиатура.
- [ ] Ручная приёмка владельца; P1 целиком не закрыт.

## Воспроизведение

Из корня актуального checkout после запуска testlab и установленного lab APK:

```powershell
.\scripts\run-testlab.ps1 -Platform android -Suite resilience
python scripts/testing/audit_supabase_pooler.py
python scripts/testing/audit_supabase_pooler.py --isolated-fixtures
```

Android runner очищает только lab package. Радио и проверяемые permission flags возвращаются в исходное состояние; никаких real audio/trace/HAR/video/screenshot fixtures нет. Default offline interval 120 секунд; для повторной отладки новых случаев допускается TESTLAB_OFFLINE_HOLD_SECONDS 30..300 кратно 30. Фактическая длительность включается в отчёт.

`TESTLAB_ANDROID_INPUT=webview` — явно выбранный диагностический режим без native tap/swipe/IME Back при проблеме UiAutomator. Отчёт отличает его от native режима; он не закрывает приёмку аппаратной навигации. Итоговые grading/OS denial прошли в native режиме на API 36; реальный микрофон/физический телефон этим не принимаются.

Chrome extension повторно проверен 01.10.2026: профиль Maksim обнаружен, список вкладок недоступен из-за `Timed out waiting for Statsig values`. Авторизованный Chrome-сценарий не выполнен; CLI/изолированный Playwright и Supabase connector не подменяют личную сессию.
