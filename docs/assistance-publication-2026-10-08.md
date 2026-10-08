# Публикация мягких подсказок — 08.10.2026

- [x] [PR #77](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/77) merged, runtime `1229383da0c0984d0de039d7bd22c3c9ceaac358`. MERGEABLE/CLEAN, назначенных GitHub checks нет.
- [x] [Backend](https://serbian-speaking-trainer-api.vercel.app) `dpl_Dfn2UWc49ihdphMk12nGjQGK5Lnd` и [web](https://serbian-speaking-trainer.vercel.app) `dpl_GmTqUJvLECbLuwFozMbTC7fA55vx`: READY/production, metadata SHA и aliases подтверждены. Релиз выполнен через штатный `vercel deploy --prod --yes --cwd backend/frontend` из main.
- [x] Набор production env проверен без чтения значений; настройки не менялись. Alembic и seed прошли, новых записей/миграций нет.
- [x] API health 200/ok, auth/me без токена 401. Runtime error logs обоих deployments за окно 15m пусты.
- [x] Авторизованный Chrome production smoke: практика, профиль, настройки и включённая мягкая помощь загружаются; console errors отсутствуют. Настройки и учебный прогресс не изменялись.
- [x] На реальном production URL четыре изолированных Chrome-сценария с mock API и синтетическим микрофоном проверили опубликованные assets: desktop/mobile/320px/native layout; три строки подсказок, отдельные кнопки, независимое принятие/отмена, отсутствие сырого текста/пояснений/прежней подписи. Первый запуск остановлен из-за жёстко заданного ключа тестового Auth storage; helper поддерживает E2E_AUTH_STORAGE_KEY, повтор 4 passed. Mock API перехватывает запросы: настоящие аудио, AI, попытки и прогресс в production не записывались.
- [x] Backend/scripts 256 passed / 8 skips, итоговый targeted assistance 34 passed, frontend 183 passed, lint/typecheck/build; [проверки прогресса](assistance-mastery-checkpoint.md), [компактный UI](compact-assistance-checkpoint.md).
- [x] Android backlog перенесён в production Android assets через `pnpm android:sync`; 17 metadata/environment tests и native startup/pager browser 1 passed. Номер версии пока не менялся.
- [ ] Отдельное согласование номера нового APK по AGENTS.md; предложено 1.26/code36.
- [ ] Production APK build, metadata/API/signature/assets verification, выдача артефакта после согласования номера.
- [ ] Реальная речь, физическая клавиатура/телефон и Android-приёмка; P0/P1/P2 целиком не закрыты.

Артефакты проверок локальны: `artifacts/assistance-release-*.log`, metadata JSON и error JSONL; не входят в Git. Последующие изменения только документации/e2e helper не меняют опубликованный runtime. Последний выпущенный APK остаётся 1.25/code35 до нового согласованного выпуска.
