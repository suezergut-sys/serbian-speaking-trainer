# P2.2/P2.3: web-разделение панелей и компактные выборки

Статус на 01.10.2026: реализация web-среза, повторные тесты и финальный reviewer recheck прошли. Web/backend опубликованы и production проверен. Контрольный Android остаётся 1.17/code 27, APK не менялся.

## Реализовано

- Statistics и Admin загружаются отдельными отложенными chunks.
- UI статистики фраз показывает страницы 10 и 50; выбор `all` скрыт. Backend сохраняет прежний `page_size=all` для старых клиентов.
- При ошибке загрузки месячной статистики или страницы фраз доступен retry. Устаревший ответ не заменяет актуальную панель/результат.
- Прямые переходы Statistics ↔ Admin используют distinct React component key; исправление reviewer финально одобрено.
- Удалена загрузка внешнего Google Font; используется системный шрифт.
- Admin user counts: было 1+N запросов, стало 2; границы UTC и JSON contract не менялись.

## Подтверждённые проверки и размеры

- Backend: 125 passed, 8 PostgreSQL cases skipped; полный прогон завершился exit 0.
- Frontend: 88 tests passed; focused App + DeferredPanel: 63 passed; lint и production build прошли.
- Browser: 15/15 passed, включая изолированный выбор network/lifecycle/mock сценариев, lazy panels, result/navigation, прямой переход Stats↔Admin, chunk failure/retry и practice на латинице/кириллице/смешанном тексте. Финальный reviewer recheck одобрил distinct React component key fix.
- Один ранний launch передал случай без поднятого local server; explicit config guard его остановил. Это ошибка конфигурации прогона, не регрессия приложения; корректно выбранные 15 browser сценариев прошли.
- Сопоставимый paired build: main JS 529.55 KB / 157.54 KB gzip → 519.35 KB / 155.32 KB gzip. Deferred Statistics: 10.14 KB / 3.07 KB gzip; Admin: 2.19 KB / 0.96 KB gzip. Main chunk всё ещё превышает 500 KB.
- Отдельная сборка с production environment: main JS 519.43 KB / 155.38 KB gzip; chunks `index-uZqMQ3LK.js`, `StatisticsView-CbyNHLmJ.js`, `AdminUsersView-DiffH-kH.js`. Не сравнивать её напрямую с paired build из-за различий конфигурации.
- Размеры относятся только к production build assets. Они не измеряют время первой доступной практики, latency на телефоне или production performance.

## Ожидает

- [x] Расширенный browser run 15/15 и повторный backend run 125 passed / 8 skipped.
- [x] Reviewer recheck одобрил исправленный distinct React component key для Stats↔Admin.
- [x] Web/backend опубликованы через PR #50; оба READY на одном commit, authorized production navigation и API smoke прошли.
- [ ] Проверить рост статистических/админских данных и репрезентативные production запросы.
- [ ] Включить накопленные клиентские изменения в Android только в отдельно заказанном APK-релизе.

## Отдельные открытые проверки

Полный P1/P2 остаётся открытым. Physical phone tests остановлены владельцем, см. [p1-physical-android-checkpoint.md](p1-physical-android-checkpoint.md); ранее прошедшие AVD fixtures не заменяют phone/manual acceptance. Также остаются открытыми Google OAuth, настоящий STT, real offline, производительность на растущих данных и Supabase RLS/grants замечание. Никакие новые Android build или phone tests в этом web-срезе не выполнялись.

## Публикация и production — 01.10.2026

- [PR #50](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/50) merged; source/runtime SHA `9f243ee857f0fc37513031c0d55cf360dc6ce155`. GitHub обязательных CI checks не показал; локальные checks и независимое ревью описаны выше.
- Frontend `dpl_Gc6pPS7mjiJxnjiNFpexnqBDmxkZ`: READY, SHA подтверждён Vercel API; [deployment](https://serbian-speaking-trainer-kmcb6vi4b-suezerguts-projects.vercel.app), [production alias](https://serbian-speaking-trainer.vercel.app). Реальный production entry: `index-B0AxxI7m.js`; локальный Windows build с env имел другой hash, приведённый выше.
- Backend `dpl_FLamtHQA4BgWUSqVGuEA73z3aRGz`: READY на том же SHA; [deployment](https://serbian-speaking-trainer-8gw08k4n3-suezerguts-projects.vercel.app), [production alias](https://serbian-speaking-trainer-api.vercel.app). Idempotent deploy seed: 0 skills/topics/phrases добавлено; новых schema migrations в срезе нет.
- Авторизованный IAB: вход сохранился; темы → статистика → пользователи → статистика → фразы прошли. Список пользователей загрузился (6 строк; персональные данные здесь не публикуются). Select содержит только 10/50; выбор 50 и пагинация прошли; приложение возвращено к темам. Console errors: 0. Голосовые вызовы и изменения учебных данных не выполнялись.
- HTTP smoke: health 200; unauthenticated topics/monthly statistics 401; privacy/terms 200. В опубликованном CSS нет внешних Google Font URL.
- Сбой динамического chunk и retry проверены в isolated Chrome mock suite, а не вызваны искусственно на production. Эти проверки не являются замерами скорости.
