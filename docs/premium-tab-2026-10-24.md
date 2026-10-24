# Отдельная вкладка «Премиум» — 24.10.2026

## Реализация

- [x] Вкладка между статистикой и настройками в desktop/mobile/shared Android UI, существующая SVG-корона PremiumBadge. Free: два голубых оттенка, premium/admin: два золотых, выбранная вкладка светлее.
- [x] Free: ПРЕМИУМ, 100 повторений в день, создание своих фраз и своих тем, disabled КУПИТЬ. Повтор пункта о фразах в запросе трактован как создание тем. Покупки пока нет; текст 100 описывает предложение, существующие серверные лимиты этим UI-изменением не меняются.
- [x] Premium/admin: две карточки создания, прежний prepare/save contract, личные темы с полным количеством фраз (включая изученные), выбор темы и список только исходников, удаление с подтверждением. Удаление темы сохранено. Ни список, ни confirmation не показывают сербский перевод; preview при создании фразы остаётся.
- [x] Новые темы сразу появляются на домашнем экране с темами и после reload. API уже owner-scoped; backend/schema/migrations не изменяются. Премиум-пользователям доступны также прежние shortcuts добавления на домашнем экране.
- [x] RU/EN каталог и тёмная палитра, 320 px без горизонтального переполнения. При удалении остаётся открытым раздел Premium, отменяется устаревшая тренировка.

## Проверки и публикация

- [x] 12/12 Playwright mock scenarios RU/EN × desktop/mobile 320/shared Android 393 × free/premium. Создание темы → домашний экран → reload → создание/сохранение фразы → список без перевода → удаление/счётчик → настройки; цвета короны и геометрия.
- [x] Component tests: предложение без запроса каталога, выбор между двумя темами, отсутствие переводов, подтверждение и обновление счётчика, retry загрузки. Синтетические данные, AI не вызывается.
- [x] Финальный scripts/check.ps1: 377 backend/scripts passed, 8 skipped; 5 Node guards; 304 frontend tests; lint, TypeScript и production build прошли.
- [x] [PR #147](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/147) merged; runtime 50c8e2ac7483b1210cecfa7d57e22e2c2ef3308a. Web Ready/production/main: dpl_8SRLJ18BWjKAzBd8oYiN89npdnAq, [deployment](https://serbian-speaking-trainer-gk8q6swvr-suezerguts-projects.vercel.app), alias serbotalk.app и SHA подтверждены Vercel API. Git integration отсутствует, использован принятый CLI workflow из чистого git archive.
- [x] Production HTTP /, /app, /privacy, /terms, /api/health: 200; anonymous topics/custom-phrases: 401. Все 12/12 production browser mock scenarios на настоящем bundle прошли; данные/auth синтетические, AI и личный каталог production не затронуты.
- [x] В существующей авторизованной Chrome-сессии владельца: вкладка Premium, золотая корона, тема СПОРТ с одной фразой, исходник без перевода и кнопка удаления видимы. На домашнем экране тема также присутствует; её счётчик неизученных отдельно равен 0. Реальные фразы не создавались/удалялись. Проверено 24.10.2026, 20:55 МСК.
- [ ] Физическая приёмка на устройстве — после отдельной команды на будущий Android-релиз.

Android sync/build/APK и версии не менялись: 1.39/code49. Доказательства вне Git: artifacts/premium-tab-quality.log, premium-tab-browser.log, premium-tab/*.png. Production опубликован. Дополнительные evidence: premium-tab-deployment-api.json, premium-tab-production-http.json, premium-tab-production-browser.log, premium-tab/production-owner.png.

## Рабочие копии

- [x] Основная папка main обновлена fast-forward; 11 завершённых detached worktree проверены чистыми и синхронизированы с опубликованными исходниками. Ветки сохранены, новых recovery-веток не потребовалось; прежняя codex/recovery-before-139-20261024 остаётся архивом.
- [x] Доказательства выпуска идут отдельным doc-only follow-up: runtime deployment остаётся на 50c8e2a, APK 1.39/code49 не меняется. После merge документации выполняется повторная проверка 12 HEAD и git status; локальный итог — artifacts/premium-tab-worktrees-final.json.
