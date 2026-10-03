# Согласованность рабочих копий — 03.10.2026

## Причина

Основная папка была на ветке `codex/android-swipe-panels`, SHA `36cae4b`, при актуальном `origin/main` `60f9fb2`. Отставание — 78 commits. В ней оставались 20 изменённых отслеживаемых файлов и 26 неотслеживаемых исходников/документов; часть была копиями уже опубликованного, часть — устаревшими промежуточными вариантами. Android build.gradle/package.json указывали 1.10/code20, правила и опубликованный APK — 1.20/code30.

Git worktree разделяет историю и refs, но у каждой копии свой HEAD, индекс и файлы. Merge/push не обновляет соседние копии. Защита незакоммиченных файлов была необходима, но создание нового worktree вместо разбора и завершения старого накопило рассинхронизацию. В прежнем критерии готовности отсутствовала обязательная проверка всех копий после выпуска и после публикации доказательств.

## Сохранение

Все исходные изменённые/неотслеживаемые файлы основной папки сохранены в [codex/recovery-primary-20261003](https://github.com/suezergut-sys/serbian-speaking-trainer/tree/codex/recovery-primary-20261003), commit `d0cb56f270909d072f0aa20bb500dda6ac75db65`: 46 файлов.

Незавершённые Android testlab-эксперименты из `audit-p0` сохранены в [codex/recovery-android-experiments-20261003](https://github.com/suezergut-sys/serbian-speaking-trainer/tree/codex/recovery-android-experiments-20261003), commit `ad6869b2e7a7fc0ff65cda6d2d40fc14857f384b`: 14 файлов. Они не включены в main и не объявлены готовыми. Продолжение телефонных проверок остаётся остановленным владельцем.

Оба снимка отправлены на GitHub; сохранённые blobs сверены с файлами с нормализацией CRLF/LF. Зависимости `node_modules` исключены; локальное правило `/node_modules/` добавлено в общий `.git/info/exclude`. До commit проверены пути, размер файлов и шаблоны приватных ключей/токенов. Прежние ветки и commits сохранены; reset/clean/force push не использовались. Recovery-ветки нужны для восстановления старой работы, а не как источник следующего релиза.

## Синхронизация

На первом контрольном шаге все семь копий получили `60f9fb2` и пустой `git status --porcelain`:

- Основная папка `C:/Users/MSumin/Codex проекты локальные/Serbian Speaking Trainer` — ветка main, fast-forward.
- `.codex/worktrees/android-next-release/Serbian Speaking Trainer`.
- `.codex/worktrees/audit-p0/Serbian Speaking Trainer`.
- `.codex/worktrees/audit-p1-p2/Serbian Speaking Trainer`.
- `.codex/worktrees/oct03-ui-release/Serbian Speaking Trainer`.
- `.codex/worktrees/phrase-startup-latency/Serbian Speaking Trainer`.
- `.codex/worktrees/weekly-stats-instant-phrase/Serbian Speaking Trainer`.

Завершённые дополнительные копии переведены в detached HEAD на опубликованный main; их старые ветки сохранены. Новую работу следует начинать созданием ветки от актуального origin/main. В доступном списке чатов не было другого выполняющегося чата проекта. Исторические ветки/теги не передвигаются на main.

Обновлены только исходники из Git; APK, Capacitor assets, env и пользовательские БД не пересобирались и не очищались. Локальные зависимости и старые игнорируемые build artifacts не являются частью согласованности Git; перед запуском/выпуском используются актуальный lockfile и новая сборка.

## Проверки и публикация правил

- [x] `git fetch origin`, инвентаризация 7 worktree, сохранение и push двух recovery-веток.
- [x] После первой синхронизации: 7/7 HEAD совпадают с origin/main, 7/7 Git status пуст.
- [x] `pnpm --dir frontend install --frozen-lockfile` и `scripts/check.ps1`: 165 backend/scripts passed, 8 skipped; Node guards 5/5; frontend 116/116; lint, TypeScript и production web build прошли. AI mocked, API budget не использовался. Имеются deprecation warnings зависимостей и предупреждение Vite о chunk >500 kB; проверка завершилась с кодом 0. Android metadata 1.20/code30 подтверждены.
- [x] Правила закоммичены и отправлены: [PR #60](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/60), GitHub MERGEABLE/CLEAN; настроенных CI checks нет.
- [ ] Merge PR #60 после разрешения владельца и повторная финальная проверка 7/7 на его merged SHA.

Этот change касается сопровождения и документации, не меняет runtime и не требует нового web deploy или APK. Состояние выпуска 1.20 и его ручной приёмки остаётся в [доказательствах релиза](android-1.20-release.md).
