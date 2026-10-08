# Мобильный layout web — 08.10.2026

## Реализовано локально

- На ширине до 780px: компактная шапка с четырьмя панелями, отдельная сетка тем, выбор темы открывает тренировку; администратор открывает пользователей из настроек.
- Соседние web-панели скрыты, горизонтального pager в браузере нет. Нативный Android сохраняет pager.
- Высота/смещение оболочки следуют visualViewport. На малой высоте уменьшаются поля и кнопки; длинное содержимое прокручивается внутри панели. Поля используют 16px шрифт, минимальные nav targets 44px.
- Черновик не теряется при смене панели или переходе mobile/desktop. Desktop сохраняет прежние две колонки.
- Предыдущие локальные исправления STT сохранены. Backend в этой задаче не менялся; API вызовы в тестах подменены, пользовательского аудио нет.

## Проверки

- `pnpm test --run --maxWorkers=1`: 182 passed, 15 suites. Новый component regression: темы/тренировка, настройки/пользователи, черновик, desktop/mobile resize. Новый hook regression: загрузка, visualViewport height/offset, снятие listeners.
- `pnpm lint`: passed.
- `pnpm build`: passed, включает `tsc -b`; существующее предупреждение bundle >500 kB остаётся.
- Chrome network regression suite: 8 passed (включая mobile layout и восстановление STT). Startup/native compatibility: 1 passed отдельным повтором. Первоначальный общий прогон: 8 passed / 1 failed из-за отсутствующего mock `/api/auth/me/preferences` в старом startup fixture; mock дополнен, native startup/pager повторно прошёл.
- Mobile browser regression проверяет 320×568, 390×700, 740×360: document scrollWidth/scrollHeight не превышают viewport, микрофон видим, ответ сохраняется, «Следующая» доступна.
- Скриншоты просмотрены: `artifacts/mobile-layout-320.png`, `artifacts/mobile-layout-390.png`, `artifacts/mobile-layout-740.png`. Логи `artifacts/mobile-layout-{full-tests,lint,build,browser,native-browser}.log`; артефакты локальные/игнорируются Git.

## Отдельно осталось

- [ ] Публикация web.
- [ ] Ручная проверка на физическом телефоне: адресная строка, настоящая экранная клавиатура, открытие подсказок и длинный разбор. Unit-тест visualViewport не заменяет эту приёмку.
- [ ] Android sync/APK/физическая приёмка по отдельной команде. Версии package/Android остаются 1.25.0 / 1.25 / code35.
