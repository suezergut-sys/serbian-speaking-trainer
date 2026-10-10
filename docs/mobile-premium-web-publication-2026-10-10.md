# Публикация предупреждения STT и мобильных карточек — 10.10.2026

Production проверен около 22:03–22:05 МСК (19:03–19:05 UTC).

- [x] [PR #83](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/83) merged; runtime SHA `beb50183cb0fcde39c04eeca7e40abfb5a6d9616`. До merge MERGEABLE/CLEAN, назначенных GitHub checks нет. Локальный scripts/check.ps1 exit 0: backend/scripts 257 passed / 8 skips, Node guards 5 passed, frontend 192 passed / 17 suites, ESLint/typecheck/production build; [checkpoint](mobile-premium-stt-checkpoint-2026-10-10.md). С момента quality gate runtime не менялся, повтор тестов перед публикацией не требовался.
- [x] Штатный `vercel deploy --prod --yes --cwd frontend` из main: `dpl_8TiFzWnxGW5Dq7gHm1WUzrzxDwt7`, READY/production. [Deployment](https://serbian-speaking-trainer-qhnyqa4w5-suezerguts-projects.vercel.app), [production](https://serbian-speaking-trainer.vercel.app).
- [x] Vercel API `/v13/deployments/dpl_8TiFzWnxGW5Dq7gHm1WUzrzxDwt7` подтверждает `meta.gitCommitSha` runtime выше, `gitCommitRef=main` и production aliases. Inspect основного домена возвращает тот же deployment ID и READY.
- [x] Production env names VITE_API_BASE_URL/VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY проверены без вывода значений. Backend/env/миграции/модели не менялись. CLI env ls сопровождался сбоем get-latest worker, но список имён получен; deploy завершился с exit 0.
- [x] HTTP: web `/`, `/privacy`, `/terms` — 200; backend health — 200, auth/me без токена — 401. Реальный production entry `index-DNVO3bwc.js`, CSS `index-bRdbYrYG.css`; entry 200, содержит точное STT-предупреждение, карточку темы и premium-badge.
- [x] Авторизованный Chrome на production: мобильная сетка 390/320px, disabled карточка темы и премиум-корона, открытие/закрытие формы фразы, версия `v.1.27` в заголовке настроек с rightGap=0. На 320px grid columns 139px/139px, document scrollWidth=320. Временный viewport сброшен. Перевод/сохранение новой фразы на production не выполнялись; локальные component tests покрывают этот путь.
- [x] Production-календарь: звёзды присутствуют на днях с 29/29/26 попытками; отсутствуют на днях с 14/1/0/0. Легенда содержит «от 20 попыток». Console errors пусты; Vercel runtime error logs deployment за 15m пусты.
- [x] Снимки `artifacts/mobile-premium-production-topics-320.png` и `artifacts/mobile-premium-production-statistics.png` просмотрены визуально; metadata/build/runtime logs сохранены в ignored artifacts, не включены в Git.
- [x] Android package/versionCode/versionName/assets/APK не менялись. Контрольный APK 1.27/code37 остаётся прежним; [backlog](android-release-backlog.md).
- [ ] Реальная речь и предупреждение после 3 ошибок с настоящим STT; production smoke не отправлял аудио и не расходовал AI budget. Локальные mock-компонентные тесты проверяют счётчик и сообщение.
- [ ] Физическая мобильная web/Android-приёмка.

Последующая фиксация этого отчёта меняет только документацию; опубликованный runtime остаётся указанным SHA и не требует повторной сборки. P0/P1/P2 целиком не закрыты.
