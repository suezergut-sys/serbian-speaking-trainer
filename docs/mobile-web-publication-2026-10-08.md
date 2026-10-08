# Публикация mobile web и восстановления STT — 08.10.2026

Проверено 14:28 MSK (11:28 UTC).

- [x] [PR #75](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/75) объединён в main; runtime SHA `eefb4ae5ef20009ae8e0de9b29acabbf7bf7c366`. Перед merge MERGEABLE/CLEAN; назначенных GitHub checks нет.
- [x] Backend/scripts 253 passed / 8 штатных skips, Node guards 5 passed; frontend 182 passed / 15 suites, lint/typecheck/build, Chrome network 8 passed, native startup/pager 1 passed. [STT](transcription-script-recovery-checkpoint.md), [mobile layout](mobile-web-layout-checkpoint.md). Повторный запуск тех же успешных проверок перед публикацией не требовался: runtime с момента проверки не менялся.
- [x] Backend deployment `dpl_85FE8Br5kBRbkePT7ABHE2wMyxtg` READY/production; [deployment](https://serbian-speaking-trainer-1i0jrt1vn-suezerguts-projects.vercel.app), [API](https://serbian-speaking-trainer-api.vercel.app). Frontend deployment `dpl_A3Ssnufr9t2oU3vUz9e4NzLZKTUi` READY/production; [deployment](https://serbian-speaking-trainer-qrfy2xam4-suezerguts-projects.vercel.app), [web](https://serbian-speaking-trainer.vercel.app).
- [x] Vercel API metadata обоих deployments подтверждают runtime SHA, ветку main и production aliases. Публикация выполнена штатным `vercel deploy --prod --yes --cwd backend/frontend` после merge.
- [x] Набор имён production env проверен без раскрытия значений. Новый необязательный OPENAI_TRANSCRIBE_LANGUAGE_PARAMETER использует default `languages`; env/model IDs не менялись. Backend production build установил зависимости pyproject (SDK >=2.54), Alembic прошёл, seed: 0 skills/topics/phrases added; новых миграций нет.
- [x] Production health 200/ok; auth/me без токена 401; OpenAPI содержит `TranscriptionResponse.review_required`; web `/`, `/privacy`, `/terms` отвечают 200.
- [x] Авторизованный Chrome smoke на production: стартовая тренировка, отдельные темы, выбор текущей темы открывает тренировку, настройки/ссылка пользователей, возврат к desktop. На 390×700 document scrollWidth/Height =390/700; на 320×568 =320/568, нижняя граница микрофона 524.81px. Временный viewport override снят. Console errors: 0. Runtime error logs обоих новых deployments за окно 15m: пусты.
- [x] Production screenshot просмотрен: `artifacts/mobile-release-production-320.jpg`. Deployment metadata и logs хранятся локально в `artifacts/mobile-release-*`; не включены в Git.
- [x] Android metadata/package version/APK не менялись; sync/build не выполнялись, контрольная версия 1.25/code35.
- [ ] Реальная речь, экранная клавиатура/адресная строка физического телефона, физический Android. Smoke не отправлял аудио и не вызывал проверку ответа; эффективность prompt на реальной речи ещё не измерена.

Последующий commit с этим документом меняет только документацию. Опубликованный runtime остаётся указанным SHA; документация не требует пересборки web/backend. P0/P1/P2 целиком не закрыты.
