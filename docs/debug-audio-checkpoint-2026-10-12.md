# Диагностика STT и временное аудио — 12.10.2026

- [x] Read-only production SELECT последних трёх записей разрешённого debug-admin. Время МСК: 17:15:35/38, 17:15:55/57 и 17:16:08. Первые две записи имели по одному semantic retry; третья прошла с первого вызова.

| Запись | Исходный ответ | Повтор | Размер / provider duration |
| --- | --- | --- | --- |
| 1 | Волеў бых данаручэм, јаку кафу без шећера. | Волеў бых данаручым, яку каву без шэчара. | 34814 bytes / 7 s |
| 2 | Волеў біг да наручем, јаку кафу без шећера. | Волеў біг да наручем, як у кафу без шећера. | 36588 bytes / 10 s |
| 3 | Волео бих да наручим јаку кафу без шећера. | Не требовался | 36853 bytes / 7 s |

Модель gpt-transcribe, languages=[sr], response_format=json и исходный prompt v2 одинаковы. Все пять HTTP-ответов 200, sdk_retries=0, error_json=null; provider пометил язык sr даже для неподдерживаемых букв. Первые ответы содержат ў/ы/э/і, которые не входят в сербскую кириллицу. Третий ответ допустим и детерминированно преобразуется в `Voleo bih da naručim jaku kafu bez šećera.`. Указание латиницы проигнорировано и в успешном ответе; меняются входное аудио и результат модели, а не настройки. Аудио этих старых попыток отсутствует; его невозможно восстановить из логов и определить причину различий произношения.

- [x] По явному новому указанию владельца добавлено временное исключение прежнего запрета: только его разрешённый debug-admin и enabled-mode сохраняют исходное аудио в бинарном поле отдельном от JSON. Не больше 1 МБ на запись; только initial STT log, retry связан SHA-256 того же буфера. Ошибки SDK также сохраняют исходный буфер; диагностическая ошибка не ломает обучение.
- [x] Последние 20 записей, срок доступности 7 дней; очистка выполняется при следующем capture/read/download, без фонового задания. Выключение отладки удаляет все строки с аудио; generation fence исключает восстановление поздним ответом после off/on. Чужие и обычные аккаунты не получают debug context.
- [x] Авторизованный owner-scoped GET `/api/admin/model-debug/logs/{log_id}/audio`, 404 для отсутствующего/чужого/просроченного ID, no-store/nosniff. Nullable deferred binary поле, Alembic upgrade/downgrade; существующие RLS/revoke наследуются без новых прав. Read-only production проверка: RLS=true, anon/authenticated SELECT=false.
- [x] Тексты настройки и privacy обновлены; обычные записи не сохраняются. Ключи и аудио не попадают в JSON/консоль/Git; тесты используют только синтетические байты и mock SDK.
- [x] Backend/scripts 263 passed / 8 штатных skips; Node Android guards 5 passed; frontend 192 passed / 17 suites с --maxWorkers=1, включая 7 debug UI tests. Тесты покрывают opt-in, owner/no-auth, initial/retry/error, off/on fence, 20-record cap, expiry, schema exception и повторный upgrade/downgrade. Фоновое чтение большого синтетического failure-log вызвало перегрузку первого UI запуска; команды чтения остановлены, повтор прошёл.
- [x] Lint/typecheck/production build прошли, frontend gate exit 0; git diff --check прошёл. Локальные логи: artifacts/debug-audio-final-quality.log (263 backend/scripts и 5 guards), artifacts/debug-audio-frontend-verified.log (192 UI tests, lint/build).
- [x] PR #89 merged, runtime SHA a8d9a2626466fd09f3733aea5085cb56b3d3d871. Production migration 2e89c4f8a7b2 применена через Supabase apply_migration с guard прежней revision f53c9d123e44; Alembic revision/3 nullable поля/RLS и revoke проверены. Старые audio=NULL, retained_audio=0 на момент проверки. Debug mode владельца уже enabled=true/generation3; состояние не менялось.
- [x] Backend dpl_323tP2JkphTN7ZMVf8H4ZCJ9QAfY и web dpl_Fq399yKz3g1M4pjTSVLJtcoD2U5c READY / production на том же SHA/main; aliases проверены Vercel API. Backend ждал concurrency queue, затем завершил build. API health 200; GET debug-mode и нового audio endpoint без токена 401. Авторизованный in-app browser: новые тексты, enabled-mode, версия 1.28, 390px тёмная тема/перенос проверены; reload после backend Ready подтвердил чтение режима новым сервисом. Console errors [] и runtime error logs пусты.
- [ ] Следующий Android-релиз: перенос обновлённых текстов, отдельная команда/номер/сборка.
- [ ] Проверить новую реальную запись и сравнить с transcript. Микрофон не запускался; автоматические тесты используют mock AI.

[PR #89](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/89), [web](https://serbian-speaking-trainer.vercel.app/), [API](https://serbian-speaking-trainer-api.vercel.app/api/health). Локальные доказательства: artifacts/debug-audio-{backend-deploy.log,web-deploy.log,backend-api.json,web-api.json,backend-errors.log,web-errors.log,settings-390.png}; Git игнорирует artifacts.

Supabase security advisors до/после: новых findings нет; INFO RLS без policies для закрытых таблиц ожидаем при revoked browser grants. Существующий WARN leaked-password protection не относится к этой миграции; [описание](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Очистка относится к текущей БД, политика внешних backup не менялась.
