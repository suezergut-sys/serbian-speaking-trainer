# P1: точная подсветка, переход к темам и компактная статистика — 01.10.2026

## Поведение

- Для `jutreneg prevoza` → `jutarnjeg prevoza` подсвечивается только `jutreneg`. Клиент сравнивает слова только внутри валидированных `issue.evidence/correction`, а не весь ответ с эталоном: допустимые альтернативы не становятся ошибками.
- Жёлтый цвет по-прежнему обозначает любое замечание. Перестановки выделяют изменившие позицию слова, удаление — лишние слова. Чистая вставка не выделяет правильные соседние слова: отсутствующего слова нет в ответе. При неоднозначных повторах или фрагменте длиннее 64 слов подсветка пропускается; разбор с исправлением остаётся доступен. Защиты Unicode/алфавита, границ слова и повторяющегося evidence сохранены.
- Prompt анализатора требует минимальный фрагмент и запрещает включать соседние неизменённые слова. Автотесты не проверяют обещание модели: клиентская защита работает и при прежнем широком evidence.
- Домик Android-интерфейса открывает панель тем через тот же `showAndroidPanel(0)`, что используется для панели pager. Быстрый chooser, его state и CSS удалены. Текущие сессия, упражнение и draft сохраняются; уход с записи останавливает mic/STT. Возврат кнопкой тренировки не создаёт новую сессию.
- P1.3: месячная статистика читает только `Attempt.created_at/overall_score` и `ReviewPhrase.mastered_at`. Даты, timezone, счётчики и HTTP JSON сохранены. Фразы с устаревшей ссылкой на чужую тему сохраняются в собственной статистике, но чужое название не раскрывается; публичные/свои темы показываются как раньше.

## Проверки

- [x] Frontend: 81 tests, TypeScript, ESLint, production build; targeted component regressions и browser web/native-layout сценарии.
- [x] Mock browser regression 13/13: результаты/домик 2, lifecycle 2, практика и алфавиты 3, сеть 6.
- [x] Backend statistics API 5/5; полный pytest exit 0, PostgreSQL-случаи пропущены без DSN. Новые проверки защищают timezone/month boundary, узкий SQL SELECT и чужую stale-topic ссылку; прежний payload остаётся прежним.
- [x] Local web 3/3 с обновлённым backend: обычный цикл, replay потерянного ответа без дубликата, задержанный hint-save без блокировки оценки.
- [ ] Записать release SHA, web/backend Ready deployments и production smoke.
- [ ] Проверить изменения на следующем явно заказанном Android APK и физическом телефоне.

Review кода выполнено оркестратором: проверены ограниченный word alignment, отсутствие сравнения с canonical, cleanup при home, все callers проекций, SQL tenant filter/OUTER JOIN и прежнее преобразование timezone. Отдельный reviewer недоступен из-за лимита agent threads; component/API/E2E gates выполнены. Миграций нет.

## Сопоставимый замер P1.3

`python scripts/testing/benchmark_statistics_projection.py --warmups 3 --runs 20`. Windows, SQLite in-memory, один synthetic dataset: 800 своих попыток, 150 освоений, 40/20 чужих строк для изоляции. Порядок legacy/projection чередуется. Legacy вариант воспроизводит прежние ORM SELECT, адаптируя mastered результат к текущему сервисному контракту; это сравнение query/materialization, не точное воспроизведение старой production среды.

| Метрика | ORM baseline | Проекция |
|---|---:|---:|
| Endpoint wall p50, мс | 17,188 | 6,540 |
| Endpoint wall p95, мс | 62,236 | 14,352 |
| SQL-запросы | 2 | 2 |
| Загруженные ORM-объекты | 950 | 0 |
| SQL-текст, байт | 1361 | 507 |
| Request URL, байт | 77 | 77 |
| HTTP JSON, байт | 3721 | 3721 |

SQL-текст не является объёмом данных, полученных из БД: bind parameters/protocol не измерены. JSON совпал побайтно во всех парных запросах; SHA-256 `4d4ad4039815984b53f8282aa3e2fc333fab5f884a089cb1ce0b29711e6e9d4d`. p95 по 20 повторам предварительный. Google, настоящее STT/AI, production Supabase/pooler и физические Android latency здесь не измеряются. Numeric report хранится в ignored `artifacts/testlab/statistics-projection-2026-10-01.json`.

## Релиз и остаток

Android версия/code остаются 1.16/26; Capacitor sync и APK не выполнялись. Клиентские изменения отмечаются в backlog для отдельного будущего выпуска. Статусы остальных задач — [audit-roadmap.md](audit-roadmap.md): production pooler concurrency, прочие payload/plans, настоящие Android permissions/Back/network и ручная приёмка остаются открытыми.
