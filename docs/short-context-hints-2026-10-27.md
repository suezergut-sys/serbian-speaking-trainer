# Короткие смысловые подсказки — 27.10.2026

## Область аудита

- [x] Все 210 фраз: по 20 в темах работа, аренда, банк, врач, кафе,
  отпуск, собеседование, транспорт; 50 — «Разное». Проверены независимые
  RU/EN-наборы, всего 420 словарей. Каноны и исходные фразы не менялись.
- [x] Через подключённый Supabase прочитаны все 9 вручную созданных фраз,
  включая фразу из обращения владельца. Для каждой подготовлен исправленный
  набор. Личные тексты/ID/исходные данные и результаты находятся только в ignored
  `artifacts/context-hints/{manual-before,baseline,prepared}.json`, не в Git.
- [x] Изменились 149 RU-наборов, 194 EN-набора и 8 личных; остальные проверены
  и сохранены по смыслу. В итоговых данных 2437 подсказок: 2128 однословных,
  157 из двух слов, 109 из трёх и 43 из четырёх (включая пример владельца).
- [x] Production inventory: 210 presets, 79 review cards (9 personal),
  1166 exercises, 516 sessions. Все 70 catalog-linked review cards имеют исходник
  и первый канон, совпадающие с preset; проверено read-only SQL.

## Поведение

- [x] Одно слово остаётся основной единицей. Неделимые конструкции получают
  короткий фрагмент, максимум 4 исходных и 5 сербских слов. Для примера владельца:
  «мне не с кем» → `nemam s kim`; «поговорить» → `da pričam` отдельно.
- [x] Типовые исправления: «у нас» → `imamo`, «арендная плата» → `kirija`,
  «коммунальные услуги» → `komunalije`, «не хватает» → `nedostaju`,
  «в конце» → `krajem`. Обычные предлоги/прилагательные/существительные
  разделены там, где у каждого есть собственное соответствие.
- [x] «мне» → `mi` не показывается, если `mi` отсутствует в каноне. EN `time`
  больше не получает `vreme` в каноне `Kada je najbolje kupiti…`.
- [x] Непокрытые слова — обычный текст. Нет требования подсказки к каждому
  слову, добавления опущенных местоимений, отдельного нажатия на части фрагмента.
- [x] Один фрагмент — одно открытие, одна запись изучения и один штраф 0.08;
  повторный POST/финализация попытки не удваивает штраф.
- [x] Старый APK может отправить отдельное слово внутри новой конструкции:
  API возвращает всю однозначную конструкцию и учитывает её ключ один раз,
  даже если отправлены несколько её слов. При неоднозначности между двумя
  конструкциями сервер не угадывает. Новое групповое подчёркивание требует
  нового клиента; устаревшие встроенные EN-подсказки APK сервер не заменяет.
- [x] Проверка сервиса требует полных токенов и точного непрерывного сербского
  фрагмента канона; учитывает оба сербских алфавита, регистр и диакритику.
  Подстроки (`mi` внутри другого слова), неподтверждённые формы, слишком длинные,
  конфликтующие повторные ключи и пересечения не становятся подсказками.
  Это структурная защита; семантику обеспечивают аудит данных и prompt,
  а не автоматический морфологический анализатор.
- [x] Versioned prompts `phrase_preparation_v3` / `exercise_generator_v2`
  применяются к новым личным и генерируемым фразам; Pydantic и существующие
  timeout/retry/safe errors сохранены. Модель берётся только из env.
- [x] Additive API `source_en` подтверждает совпадение с каноном preset,
  `source_hints` сохраняет исходный словарь при EN → RU без нового AI-запроса.
  Личная фраза с тем же исходником, но другим каноном, не заимствует EN-словарь.
- [x] Общий web/Android-клиент использует прежний тёмный стиль, подсказку-портал,
  Escape, защиту от позднего ответа и повтор сохранения; ошибка RU/EN теперь
  говорит «подсказка», что подходит и слову, и фрагменту.

## Перенос существующих данных

- [x] Подготовлен `scripts/repair_hint_snapshots.py` и сервис `hint_repair`:
  dry-run по умолчанию; персональные записи ограничены проверенными ID,
  исходником и первым каноном. Изменяются только hints в catalog/review/exercise/
  session snapshot, без AI-запросов. При apply используется транзакция и row locks;
  перед commit сохраняется частный rollback journal под `artifacts/`.
- [x] Tests проверяют dry-run, повторный запуск, другой канон, неизменность
  прогресса и updated_at, сохранение revealed hints и посторонних JSON-полей.
- [x] Seed обновляет подсказки catalog-linked карточек, а продолжение личной
  сессии берёт актуальную карточку вместо устаревшего embedded snapshot.
- [ ] Применить частный manifest к production БД после согласованной публикации
  web/backend; записать количества, повторное чтение и нулевой повторный diff.
- [ ] Merge и production deployment требуют отдельного разрешения; данные
  production на этом этапе не изменялись. Исторические attempts/оценки/старые
  записи открытых слов не переписываются.

Команды сопровождающего (не запускать в автоматических тестах):

```powershell
.venv/Scripts/python.exe scripts/audit_context_hints.py --manual artifacts/context-hints/manual-before.json
# Проверить/отредактировать частный checkpoint; export не публикует личные тексты.
.venv/Scripts/python.exe scripts/audit_context_hints.py --manual artifacts/context-hints/manual-before.json --export
# DATABASE_URL берётся из backend settings; сначала проверить окружение и dry-run.
.venv/Scripts/python.exe scripts/repair_hint_snapshots.py artifacts/context-hints/prepared.json --journal artifacts/context-hints/dry-run.json
# Только после проверки dry-run, для того же целевого окружения:
.venv/Scripts/python.exe scripts/repair_hint_snapshots.py artifacts/context-hints/prepared.json --journal artifacts/context-hints/applied.json --apply
```

## Проверки и публикация

- [x] Полный backend/scripts suite: 469 passed, 9 PostgreSQL-only skipped при
  отсутствии isolated test DB; после последнего изменения совместимости —
  29 targeted tests passed. Все автоматические AI-запросы mocked.
- [x] Финальный полный frontend suite: 344 passed (38 files), включая новые
  component scenarios групповой подсказки web/native.
- [x] Финальные 7 focused component/catalog tests passed, source splitter/tooltip
  tests passed; full lint и scoped lint, typecheck/production build прошли.
  18 browser scenarios: RU/EN × desktop/mobile/shared Android × latin/cyrillic
  для конструкций (12), независимый preset EN/RU (6). Скриншоты
  `artifacts/context-hints/screens/*.png`; тёмный мобильный RU-layout просмотрен.
  5 Node resilience guards passed. Android build/sync не запускались.
- [x] Исходники/tests/docs отправлены: `c7f740362a9941cf7f964d59b148de874a0d6ba8`,
  [PR #169](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/169).
  GitHub подтверждает MERGEABLE/CLEAN; remote CI checks для ветки отсутствуют,
  локальные результаты перечислены выше. Следующий commit только фиксирует
  доказательства и не является новым runtime/deploy/APK.
- [x] Основная папка проверена на main = origin/main =
  `fedf24967492e5fbfcd32a8bc0e9d808a8a61d8e`, все 12 рабочих копий чистые на
  этом SHA. После документационного push проверка повторяется; свидетельство
  хранится в ignored `artifacts/context-hints/worktrees-final.json`.
  Ветка реализации сохранена/pushed, recovery-ветки не требовались.
- [ ] Production web/backend/data verification и ручная приёмка владельца.
- [x] Android 1.40/code50 и package version не менялись; sync/APK не выполнялись.
  Групповое отображение старого APK потребует отдельно разрешённого Android-релиза;
  проверка общего Android-layout в браузере не означает выпуск APK.

Основная папка и 11 остальных рабочих копий до изменения были чистыми на
`fedf24967492e5fbfcd32a8bc0e9d808a8a61d8e`. Recovery/WIP не требовались.
Ветка реализации: `codex/short-context-hints`.

Частный reviewed manifest SHA256:
`d05838bac101a43d2ef751876bfbedee07918e5b9db7122599ab068fca8711b4`.
