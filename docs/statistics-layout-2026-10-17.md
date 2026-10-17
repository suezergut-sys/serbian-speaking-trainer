# Статистика: ширина, звезда и страницы фраз — 17.10.2026

## Реализация

- [x] Desktop web: центрированный раздел статистики имеет ширину правой панели упражнения, рассчитанную из общих workspace CSS-переменных. Проверка сравнивает реальные bounding boxes при 800 и 1366px.
- [x] Звезда календаря и легенды увеличена с 14 до 18px; порог остаётся 20 попыток. Ячейки сохраняют ширину своих колонок на узком desktop.
- [x] В списке фраз по умолчанию 20 строк, селектор содержит только 20/50. Смена размера сбрасывает страницу на первую, смена темы использует default 20.
- [x] API default 20, валидация запроса/ответа допускает 20. Старые 10/50/all сохранены для совместимости; миграции не нужны.
- [x] Новых строк интерфейса нет: подписи/доступность используют существующий RU/EN каталог. Селектор сохраняет явные тёмный фон и светлый текст.

## Проверки

- [x] `pnpm test --run`: 231/231, включая RU/EN default, набор вариантов, переход на следующую страницу, сброс страницы при смене размера и существующие abort/retry сценарии.
- [x] `.venv/Scripts/python.exe -m pytest tests/test_statistics_api.py -q` из backend: 7/7. Проверены 45 синтетических фраз: страницы 20/20/5 без пересечений и выбор 50; внешние AI не вызываются.
- [x] `pnpm build`: TypeScript и production web build; `pnpm lint`.
- [x] `pnpm exec playwright test calendar-legend.spec.mjs`: 8/8 — RU/EN × desktop 1366px, compact desktop 800px, mobile 393px, Capacitor-макет 393px. Заполненная таблица не расширяет панель; календарь не имеет наложений. Скриншоты календаря проверены визуально.
- Скриншоты локальных browser-проверок: `artifacts/statistics-layout/{ru,en}-{desktop,compact-desktop,mobile,android}.png` (игнорируемые артефакты). Проверяются календарь, легенда, 18px, ширина панели, страницы 20/50 и тёмный select. Native — браузерный Capacitor-макет, не установленный APK.
- Vite сообщает о chunk >500 kB, сборка завершается успешно.

## Выпуск

- [x] 17.10.2026, 21:58 МСК: [PR #127](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/127) merged, runtime SHA `70e1292f1b8d7b90840fc577da5797e54c031f19`; обязательных GitHub checks нет, перед merge CLEAN/MERGEABLE. Backend опубликован и получил production alias до выпуска frontend.
- [ ] Приёмка владельцем.
- [ ] Android sync/build и физическая приёмка по отдельной команде. Текущие package/Android metadata 1.35/code45 не менялись.


## Доказательства production

- Полный `scripts/check.ps1`: 316 backend/scripts passed, 8 skipped; 5 Node guards passed; 231 frontend tests passed; lint/typecheck/production build passed. Локальные browser tests 8/8.
- Backend: `dpl_DqJtPrt666on3SfbgU77ZQJMiHvq`, READY/production/main; [deployment](https://serbian-speaking-trainer-a0ttqboxi-suezerguts-projects.vercel.app), alias `serbian-speaking-trainer-api.vercel.app` подтверждён Vercel API.
- Frontend: `dpl_96DJ7D3oU3Etz6KhrDdgUTxT6bQu`, READY/production/main на том же SHA; [deployment](https://serbian-speaking-trainer-jy726om25-suezerguts-projects.vercel.app), aliases `serbotalk.app` и `serbian-speaking-trainer.vercel.app` подтверждены Vercel API.
- 8/8 browser checks на `https://serbotalk.app/app`: RU/EN × desktop 1366/800px, mobile/native 393px, опубликованный bundle и synthetic API/account. Реальные OpenAI/аудио/учебные попытки не используются.
- Дополнительно существующая авторизованная Chrome-сессия: реальные темы и фразы загружаются в RU/EN, default 20 и options 20/50; выбор 50 возвращает таблицу без ошибок. Звезда 18px, ширина statistics 632px на текущем desktop viewport. Русский язык восстановлен, открыт календарь. Проверки не создают попыток и не меняют учебные данные.
- Root/app/privacy/terms/health = 200; anonymous phrases = 401. Production OpenAPI подтверждает default `20` и pattern `^(10|20|50|all)$`. Миграций нет, повторный production seed добавил 0 строк. Runtime error log rows обоих deployments = 0.
- Финальная публикация выполнена из чистого `git archive` SHA. Dry-run проверил 146 backend и 184 frontend Git-файла: локальных БД, секретов, APK и зависимостей нет. Публичный отслеживаемый `.env.android` не используется обычным web build.
- Первый незавершённый backend deployment `dpl_FqHYst29kqTMEL1VjkhoYK8RWsd4` из рабочей папки включил локальный SQLite-файл из-за отсутствия локального исключения Vercel. Deployment удалён до Ready/назначения production alias; финальный deployment пересоздан из чистого Git-экспорта. Сам SQLite-файл не изменялся и не коммитился. Содержимое БД не выводилось.
- Игнорируемые локальные доказательства: `artifacts/statistics-deployments.json`, `statistics-{backend,frontend}-clean-deploy.log`, `statistics-{backend,frontend}-errors.jsonl`, `statistics-production-http.json`, `statistics-backend-smoke.json`, `statistics-clean-{backend,frontend}-dry.json` и `statistics-layout/*.png`.

Этот последующий документальный commit не меняет runtime и не требует повторного deploy. APK остаётся 1.35/code45; Android sync/build не выполнялись.
