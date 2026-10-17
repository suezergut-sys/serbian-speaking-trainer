# Профиль Vercel-проектов

Файл хранит только несекретную конфигурацию production-релиза.

## Backend

- Production branch: `main`
- Deployment trigger: ручной `vercel deploy --prod --cwd backend` из checkout `main`; merge сам по себе не запускал deployment 28 сентября 2026 года.
- Vercel project name: `serbian-speaking-trainer-api`
- Production URL: `https://serbian-speaking-trainer-api.vercel.app`
- Root Directory: `backend`
- Build command: `python scripts/vercel_build.py`
- Quality command: `.\scripts\check.ps1` из корня репозитория
- Health checks: `GET /api/health`; защищённый API без access token отвечает `401`
- Required migrations: `backend/alembic`; production build также идемпотентно заполняет каталог фраз
- Scheduled jobs: нет
- Required environment variable names: `APP_ENV`, `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_ORIGIN_REGEX`
- Post-deploy smoke test: health check, проверка OAuth-защиты и наличия 210 фраз в production-каталоге

## Frontend

- Production branch: `main`
- Deployment trigger: ручной `vercel deploy --prod --cwd frontend` из checkout `main`.
- Vercel project name: `serbian-speaking-trainer`
- Production URL: `https://serbotalk.app` (лендинг `/`, приложение `/app`); прежний alias `https://serbian-speaking-trainer.vercel.app` сохранён
- Root Directory: `frontend`
- Build command: `pnpm build`
- Quality command: `.\scripts\check.ps1` из корня репозитория
- Health checks: `/`, `/privacy`, `/terms`
- Required migrations: нет
- Scheduled jobs: нет
- Required environment variable names: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Post-deploy smoke test: кнопка входа Google открывает Supabase OAuth; после входа загружаются темы и профиль

12.10.2026: для backend alias-входа требуется REVIEW_LOGIN_EMAIL (sensitive production env), REVIEW_LOGIN_USERNAME по умолчанию serbotalkreview. Frontend не получает соответствующий email как build variable.

17.10.2026: для activity notifications backend использует sensitive `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`; необязательный `TELEGRAM_TIMEOUT_SECONDS` по умолчанию 3. Текущая миграция: `713ce912ab30`; production PostgreSQL upgrade подтверждён. [Выпуск 1.35](android-1.35-release.md).
