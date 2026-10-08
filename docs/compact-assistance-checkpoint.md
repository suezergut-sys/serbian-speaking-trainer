# Компактная мягкая подсказка — 08.10.2026

- [x] Общий UI desktop/mobile web и native Android: «Возможное искажение распознавания.», пары original → replacement, кнопка «Принять подсказку» справа (после принятия «Отменить»).
- [x] Убраны объяснения, счётчик уточнённых слов, сообщение об освоении и раскрывающийся raw transcript. После ручной правки блок скрывается. Недоступность сервиса сохраняет отдельный status.
- [x] Принятие/отмена, блокировка при обработке, алфавит и несколько динамических замен сохранены. Backend/API/scoring не менялись, аудио/AI вызовы в тестах подменены.
- [x] Targeted component: 6 passed. Полный frontend suite: 182 passed / 15 suites (`pnpm test --run --maxWorkers=1`).
- [x] `pnpm lint` и `pnpm build` (включая tsc -b) прошли; существующее предупреждение главного bundle >500 kB осталось.
- [x] Chrome 4 passed: desktop 1280×800, mobile 390×700, narrow 320×568, native layout 390×700. Одна подпись, отсутствие details, кнопка справа, отсутствие переполнения блока и применение замены подтверждены. Скриншоты 320px и native layout визуально просмотрены.
- [x] Локальные доказательства: `artifacts/compact-assistance-tests.log`, `artifacts/compact-assistance-{desktop,mobile,narrow,native}.png`; артефакты не включаются в Git.
- [ ] Публикация web и физическая приёмка.
- [ ] Android sync/APK по отдельной команде; версии 1.25.0 / 1.25 / code35 не менялись.

Последующая проверка нескольких независимых подсказок и отмена ограничения прогресса: [checkpoint](assistance-mastery-checkpoint.md), frontend 183 passed.
