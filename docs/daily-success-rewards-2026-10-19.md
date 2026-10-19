# Первый успех дня и награды — 19.10.2026

- [x] Первый точный overall_score=1 после штрафа за подсказки получает локальную золотую SVG-галочку и RU/EN «Успешный старт!» / «Successful start!». Следующие точные успехи показывают 100% и «Верно» / «Correct» внутри медали.
- [x] Отдельный блок score/verdict точных 100% под ответом удалён, в том числе при выключенных эффектах. Оценки ниже 100%, answer/translation, hint penalty и управление сохранены.
- [x] Весь visual reward увеличен на 10% CSS transform (фразовая медаль 76 → 83.6px, дневная 110 → 121px); центрирование и длительность 2 секунды сохранены, reduced-motion оставляет статичный масштаб. WAV/звук и его условия воспроизведения прежние, внешних ассетов нет.
- [x] Сервер возвращает additive first_success_today. Query использует существующие Attempt/Exercise/TrainingSession, изолирован по аккаунту и диапазону UTC [start,end), выполняется до вставки под существующим user lock. Без новой таблицы/миграции. Зарезервированная в прошлом дне попытка не потребляет сегодняшний первый успех.
- [x] Флаг включён в прежний response_json, replay стабилен; старые response snapshots читаются с false. Старый APK игнорирует additive поле. Первый успех, совпавший с 20-й проверкой, показывает start и twenty последовательно (2+2 секунды), с одним звуком.
- [x] Integration: первый/последующий/другая сессия, повтор request ID, вчерашний успех, другой аккаунт, .999, UTC start-inclusive/end-exclusive; файловый SQLite concurrency test подтверждает один first_success_today для двух параллельных успешных ответов.
- [x] Unit/component: очередь start/twenty и один звук, тексты/DOM RU/EN, удаление постоянного score в web/Android-layout, включая отключённые анимации.
- [x] Полный backend: 292 passed / 8 skipped; frontend 245 tests чистого Git-экспорта (рабочий checkout дополнительно включал 8 несвязанных регрессий), lint/typecheck/production build. 10 browser checks RU/EN desktop/mobile/320px/Android narrow/landscape проверили start/perfect/twenty, размер +10%, центр, отсутствие постоянного score, отключение после reload и прежний звук. Дополнительно 16 regression checks результата/навигации web/Android RU/EN прошли.
- [x] [PR #135](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/135) merged, runtime SHA `9fa4a1902a1613d5de551a16cd1a96b3fe35c940`; backend и web READY/production/main/aliases подтверждены API. Backend выпущен первым; production OpenAPI содержит first_success_today:boolean/default false. Новых миграций нет, seed добавил 0 skills/topics/phrases.
- [x] Production HTTP root/app/privacy/terms/health: 200, anonymous topics: 401. OpenAPI/JS содержат новый server flag/тексты, CSS содержит scale(1.1), start/verdict; embedded WAV совпал SHA-256 с исходным и прежним ассетом. Авторизованный Chrome загрузил темы/упражнение, backend ready, console errors 0; runtime error rows обоих deployments 0.
- [x] 19.10.2026: 10/10 production browser scenarios RU/EN web/mobile/narrow/Android narrow/landscape на serbotalk.app/app прошли. Загружен реальный bundle, API/auth/audio synthetic: start/perfect/twenty, центр, размеры 83.6/121px, отсутствие отдельного score до/после исчезновения, прежний звук и отключение после reload. Live AI/попытки не выполнялись; скриншоты RU desktop start / EN narrow perfect просмотрены.
- [ ] Приёмка владельцем.
- [ ] Перенос общего клиента в будущий APK по отдельной команде. Android sync/build и версии не меняются, 1.36/code46.

Тесты используют fake AI и synthetic auth/API/audio. Никаких реальных попыток, речи, уведомлений и AI-вызовов во время автоматических проверок. Local evidence: `artifacts/daily-success-rewards/*`, `daily-rewards-backend-tests.log`, `daily-rewards-backend.xml`. Оценка .999 по-прежнему не является точным 100% для звука/наград; существующее округление отображаемых промежуточных оценок не менялось.

## Выпуск

Backend: [deployment](https://serbian-speaking-trainer-bwkiwtaf0-suezerguts-projects.vercel.app), `dpl_2bDkNsGUiL4uNc8kZzzsoGhpQZ8R`, alias serbian-speaking-trainer-api.vercel.app.
Frontend: [deployment](https://serbian-speaking-trainer-oy4wr2ryp-suezerguts-projects.vercel.app), `dpl_3FPL3gVmV2xLQu6URXm294fXVJPQ`, aliases serbotalk.app и serbian-speaking-trainer.vercel.app.

Оба выпущены принятым CLI workflow из чистого git archive merged runtime SHA, поскольку Git integration у Vercel проектов отсутствует. Локальные посторонние диагностика/регрессии исключены из commit/export; их файлы сохранены. Документальный commit после выпуска не меняет runtime и не требует redeploy. Android sync/build не запускались; metadata/package/APK 1.36/code46 прежние.

Дополнительные evidence (вне Git): `daily-rewards-deployments.json`, `daily-rewards-{backend,frontend}-deploy.log`, `daily-rewards-production-http.json`, `daily-rewards-{backend,frontend}-errors.jsonl`, `artifacts/daily-success-rewards/*`.
