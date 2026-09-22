# Профиль Vercel-проектов

Файл хранит только несекретную конфигурацию production-релиза.

## Backend

- Production branch: `main`
- Vercel project name: `serbian-speaking-trainer-api`
- Production URL: `https://serbian-speaking-trainer-api.vercel.app`
- Root Directory: `backend`
- Build command: `python scripts/vercel_build.py`
- Quality command: `.\scripts\check.ps1` из корня репозитория
- Health checks: `GET /health`; защищённый API без access token отвечает `401`
- Required migrations: `backend/alembic`; production build также идемпотентно заполняет каталог фраз
- Scheduled jobs: нет
- Required environment variable names: `APP_ENV`, `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_ORIGIN_REGEX`
- Post-deploy smoke test: health check, проверка OAuth-защиты и наличия 160 фраз в production-каталоге

## Frontend

- Production branch: `main`
- Vercel project name: `serbian-speaking-trainer`
- Production URL: `https://serbian-speaking-trainer.vercel.app`
- Root Directory: `frontend`
- Build command: `pnpm build`
- Quality command: `.\scripts\check.ps1` из корня репозитория
- Health checks: `/`, `/privacy`, `/terms`
- Required migrations: нет
- Scheduled jobs: нет
- Required environment variable names: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Post-deploy smoke test: кнопка входа Google открывает Supabase OAuth; после входа загружаются темы и профиль
