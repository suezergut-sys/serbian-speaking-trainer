# Serbian Speaking Trainer

Локальное приложение для адаптивной тренировки быстрого перевода разговорных фраз с русского на сербский (latinica), уровень A2.

Сейчас реализованы этапы 0–6: текстовый адаптивный цикл дополнен голосовым вводом через OpenAI Audio Transcriptions. Текстовый режим остаётся доступным как fallback.

Android-приложение использует тот же React-интерфейс в нативном контейнере Capacitor и тот же FastAPI backend. Web и Android регистрируют пользователя и выполняют вход через Google в Supabase Auth; профиль, прогресс, темы, попытки и интервальные повторения изолированы по `user_id`.

Для облачного режима frontend и FastAPI разворачиваются как два Vercel-проекта из одного GitHub-репозитория, а `DATABASE_URL` backend указывает на Supabase PostgreSQL через transaction pooler. Web и Android используют один HTTPS API и, следовательно, одну базу фраз и повторений. Постоянный OpenAI API key хранится только в environment variables backend-проекта Vercel.

Обычному аккаунту доступны 10 проверенных фраз за календарные сутки UTC. Администратор и будущий тариф `premium` не ограничены; сейчас администратором назначается email из `ADMIN_EMAILS` (`suezergut@gmail.com`). Только администратор видит раздел «Пользователи» с датой регистрации, последней активностью и количеством фраз за сегодня. Платёжный провайдер пока не подключён: `access_tier` оставлен отдельным от роли, чтобы позднее webhook Lemon Squeezy или Paddle мог выдавать premium-доступ без изменения Google-входа.

Интерфейс практики построен как единое рабочее пространство: темы находятся слева, упражнение и ответ — в центре, контекстные подсказки — справа. В каждой из восьми готовых учебных тем хранится по 20 разнообразных A2-фраз с постоянным разговорным сербским переводом, поэтому начало тренировки не ждёт генерации. Дополнительно доступна пустая тема «Разное». Пользовательские темы тоже создаются пустыми: приложение не заполняет их автоматически. «Статистика» показывает календарь активности, состав попыток по дням и отдельную вкладку «Фразы» с состоянием интервального повторения. «Прогресс» пока остаётся явно обозначенной заглушкой.

Русская фраза разбита на интерактивные слова. Для всех 160 фраз готовых тем контекстные переводы слов заранее хранятся в SQLite и согласованы с каноническим переводом по лексике, роду, числу и падежу, поэтому подсказка появляется сразу и не вызывает OpenAI. Нажатие добавляет слово в список неизученных и уменьшает итог попытки на 8 процентных пунктов за уникальное слово (не более 30 пунктов). После проверки подробный разбор показывается в правой панели.

Каждая проверенная фраза получает карточку интервального повторения. Нажатие на «Фразы для повторения» запускает карусель активных и просроченных карточек. При добавлении собственной русской фразы backend сначала создаёт и показывает канонический сербский перевод, после чего пользователь выбирает тему и только затем сохраняет фразу. Два самостоятельных результата от 95% подряд переводят карточку в «выучена» до следующей даты повторения. Трудность определяется автоматически: успех с первой попытки — лёгкая, одна ошибка перед успехом — средняя, две и более — трудная. Базовые интервалы составляют 14/7/3 дня и увеличиваются после каждого успешно завершённого цикла, но не более чем до года.

## Требования

- Python 3.12+
- Node.js 22+ и pnpm 9+
- Для сборки Android: Android Studio 2025.2.1+, SDK Platform 36 и JDK из поставки Android Studio

Docker, Redis и PostgreSQL не нужны.

## Первый запуск

```powershell
Copy-Item .env.example .env
Copy-Item frontend\.env.example frontend\.env.local
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".\backend[dev]"
python -m app.db.cli reset --yes

Set-Location frontend
pnpm install
Set-Location ..
```

`OPENAI_API_KEY` необязателен для готовых тем и текстового локального fallback. Для создания канонического перевода новой пользовательской фразы и семантического анализа задайте `OPENAI_TEXT_MODEL`, а для голосового ввода — `OPENAI_TRANSCRIBE_MODEL`. Ключ читается только backend и `.env` исключён из Git.

Для входа настройте Google provider в Supabase Auth. В Google Auth Platform создайте OAuth client типа Web application, а callback укажите как `https://<project-ref>.supabase.co/auth/v1/callback`. В Supabase Redirect URLs разрешите `http://localhost:5173/**`, production web URL и `com.serbiantalk.trainer://auth/callback`. Публичные `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` задаются backend, их Vite-версии `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` — frontend. Google Client Secret и любые service-role keys в browser или APK не передаются.

Публичные страницы `/privacy` и `/terms` доступны без входа и используются в Google OAuth consent screen. Они описывают состав данных, сторонние сервисы, дневной лимит и правило хранения аудио только во временной памяти.

## Запуск

В двух терминалах из корня репозитория:

```powershell
.\.venv\Scripts\Activate.ps1
Set-Location backend
uvicorn app.main:app --reload --port 8000
```

```powershell
Set-Location frontend
pnpm dev
```

Откройте `http://localhost:5173`. Vite проксирует `/api` на `http://127.0.0.1:8000`. Проверка backend доступна по `http://127.0.0.1:8000/api/health`.

## Android 16

Android-проект находится в `frontend/android`, имеет package id `com.serbiantalk.trainer` и собирается с `compileSdk = 36`, `targetSdk = 36`, `minSdk = 24`.

```powershell
Set-Location frontend
pnpm android:apk
```

Команда собирает web bundle, синхронизирует его с Capacitor и создаёт debug APK версии 1.4 в `frontend/android/app/build/outputs/apk/debug/SerboTalk-andorid16-1.4.apk`. Адрес backend задаётся сборкой. Ручная панель подключения с адресом эмулятора или LAN доступна только администратору; обычные пользователи не могут менять endpoint из интерфейса.

Проект развивается web-first. Обычные web-доработки не повышают Android-версию и не запускают сборку APK. Изменения для следующего Android-релиза собираются в `docs/android-release-backlog.md`; перенос, повышение версии и APK выполняются только по явной команде владельца.

APK содержит только клиент. Постоянный `OPENAI_API_KEY`, база фраз, попытки и состояния повторения остаются на backend. Для записи WebView объявлены Android-разрешения `RECORD_AUDIO` и `MODIFY_AUDIO_SETTINGS`, которые Capacitor проверяет совместно; пользователю показывается только системный запрос доступа к микрофону. Запись остаётся в памяти WebView и после получения transcript освобождается по тем же правилам, что и в browser-версии. Для локальной отладки разрешён cleartext HTTP, а для внешнего backend следует использовать HTTPS.

Облачный APK собирается с публичными `VITE_API_BASE_URL`, `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` из `frontend/.env.android`:

```powershell
Set-Location frontend
pnpm android:cloud-apk
```

В APK не добавляются `OPENAI_API_KEY`, пароль PostgreSQL или Supabase service key.

## Облачное развёртывание

GitHub-репозиторий: `suezergut-sys/serbian-speaking-trainer`.

Production URL:

- web: `https://serbian-speaking-trainer.vercel.app`;
- API: `https://serbian-speaking-trainer-api.vercel.app`.

В Vercel создаются два проекта из этого репозитория:

- `serbian-speaking-trainer-api` с Root Directory `backend`;
- `serbian-speaking-trainer` с Root Directory `frontend` и `VITE_API_BASE_URL`, равным production URL API.

Backend environment variables:

- `APP_ENV=production`;
- `DATABASE_URL` — transaction pooler Supabase на порту 6543 с `sslmode=require`;
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — проверка пользовательского access token через Supabase Auth;
- `ADMIN_EMAILS=suezergut@gmail.com`, `FREE_DAILY_PHRASE_LIMIT=10`;
- `OPENAI_API_KEY`;
- `OPENAI_TEXT_MODEL` и `OPENAI_TRANSCRIBE_MODEL`;
- `OPENAI_TIMEOUT_SECONDS`, `OPENAI_MAX_RETRIES`, `MAX_AUDIO_BYTES`;
- `CORS_ALLOWED_ORIGIN_REGEX` для production/preview доменов frontend.

Frontend environment variables: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Publishable key предназначен для клиента; backend по-прежнему принимает решения о роли, лимите и доступе к данным.

При production-deploy backend один build-step применяет миграции и идемпотентный seed. PostgreSQL advisory lock не даёт двум production-сборкам изменять схему одновременно. Preview не меняет production-базу. Ту же операцию можно безопасно повторить вручную:

```powershell
$env:DATABASE_URL = "postgresql://..."
python -m app.db.cli seed
```

Vercel-функция не запускает миграции при холодном старте. Для serverless-соединений SQLAlchemy использует `NullPool` и отключает prepared statements; постоянные соединения и DB credentials в browser или APK отсутствуют.

Для обычного локального запуска можно использовать ярлык `Serbian Speaking Trainer` на рабочем столе. Он применяет миграции и seed, перезапускает принадлежащий проекту backend при появлении более нового Python-кода, запускает отсутствующие backend/frontend, ждёт их готовности и открывает приложение в Google Chrome. Чужие процессы на портах приложения ярлык не завершает. Команда, на которую ссылается ярлык:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-local-app.ps1
```

## Реализованный текстовый сценарий

- `GET /api/topics` — список восьми готовых тем, пустой темы «Разное» и пользовательских тем.
- `POST /api/topics` — создание сохранённой пустой пользовательской темы.
- `POST /api/topics/normalize` — нормализация своей темы.
- `POST /api/sessions` — новая сессия со snapshot темы.
- `GET /api/sessions/{id}` — состояние сессии.
- `POST /api/sessions/{id}/next-exercise` — следующее упражнение из постоянного каталога preset-темы; для своей темы используется прежний AI/fallback-поток.
- `POST /api/attempts` — анализ текстового ответа, сохранение попытки и ошибок.
- `POST /api/transcriptions` — расшифровка короткой записи из памяти без передачи API key во frontend.
- `POST /api/review-phrases/prepare` — подготовка валидированного канонического перевода пользовательской фразы.
- `GET/POST /api/review-phrases` — список фраз для повторения и сохранение подготовленной фразы в выбранную тему.
- `POST /api/exercises/{id}/word-hints` — получение подготовленного перевода слова и добавление его в неизученные.
- `GET /api/learning-words` — текущий список слов, открытых через подсказки.
- `GET /api/statistics/monthly?month=YYYY-MM&utc_offset_minutes=...` — общее число переводов, правильные результаты от 95% и полностью освоенные фразы по дням месяца в локальном часовом поясе пользователя.
- `GET /api/statistics/phrases?page=1&page_size=10|50|all` — фразы, сгруппированные по темам из БД, с числом попыток, статусом и датой следующего повторения.

Если ответ после нормализации полностью совпадает с каноническим или другим допустимым вариантом, backend детерминированно выставляет 100% без вызова OpenAI. В остальных случаях настроенный OpenAI использует Responses API со strict Pydantic structured outputs и `store=false`; некорректный или недоступный AI-ответ заменяется локальным результатом. Анализ не ограничивается точным сравнением с одной строкой, неизвестные `skill_key` от модели отбрасываются, а пустые и самопротиворечивые issues не сохраняются. Карточка результата всегда показывает сохранённый канонический вариант; если модель предложила вместо него стилистическую альтернативу, backend согласованно заменяет и вариант, и пояснение, чтобы подробный разбор не ставил канон под сомнение.

После каждой попытки Learner Model обновляет mastery целевых навыков, состояния `LEARNING`/`CONSOLIDATING`/`MASTERED`, streak и дату следующего повторения. Отдельный планировщик карточек фраз ведёт трудность, серию успешных ответов, растущий интервал и автоматически возвращает просроченные карточки в очередь. Темы карточек ссылаются на таблицу `topic_presets`, поэтому статистика не зависит от фиксированного списка тем. UI показывает обновлённый прогресс навыков в обратной связи.

## Голосовой ввод

В карточке упражнения нажмите «Ответить голосом» и разрешите браузеру доступ к микрофону. Browser записывает короткую фразу через `MediaRecorder` в память. После нажатия «Завершить запись» все media tracks останавливаются, Blob отправляется как `multipart/form-data` на backend и передаётся в OpenAI Audio Transcriptions с языком `sr`.

Допустимы только поддерживаемые audio MIME-типы, размер ограничен `MAX_AUDIO_BYTES` (по умолчанию 1 МБ), а внешний запрос использует общий timeout и ограниченный retry. Backend не пишет аудио в файл, БД или лог; после ответа временные байты освобождаются. Если модель вернула сербскую кириллицу, результат детерминированно приводится к latinica. В БД сохраняется только текстовая расшифровка после отправки ответа на проверку.

## База данных

Команды выполняются из корня с активным virtualenv:

```powershell
# Применить миграции и добавить недостающие seed-записи
python -m app.db.cli seed

# Пересоздать только локальную dev-БД и заполнить каталог
python -m app.db.cli reset --yes

# Обычный Alembic workflow
Set-Location backend
alembic upgrade head
```

Seed идемпотентен по ключам и поддерживает 50 навыков, 8 заполненных тем, пустую тему «Разное», 160 постоянных тематических фраз и их пословные подсказки. Reset отказывается работать без `--yes` и разрешён только для SQLite.

## Проверки

```powershell
.\scripts\check.ps1
```

Или отдельно:

```powershell
python -m pytest backend/tests
Set-Location frontend
pnpm test --run
pnpm lint
pnpm build
```

## Безопасность и границы

- Пользовательское аудио не сохраняется ни в каком виде.
- Постоянный OpenAI API key никогда не попадает во frontend.
- Model IDs задаются env-переменными.
- Structured outputs проходят Pydantic-валидацию.
- Scheduler и Learner Model реализованы отдельными сервисами и не находятся в routers.

План этапов находится в [`docs/implementation-plan.md`](docs/implementation-plan.md), принятые решения — в [`docs/decisions.md`](docs/decisions.md).
