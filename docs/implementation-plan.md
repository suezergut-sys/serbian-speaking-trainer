# Implementation plan этапов 0–7

## Этап 0 — каркас и запуск — готово

Monorepo `backend`/`frontend`, FastAPI health endpoint, React/Vite shell, dev proxy, env-шаблон, команды запуска и базовые проверки.

## Этап 1 — данные и каталоги — готово

SQLAlchemy + Alembic + SQLite, семь таблиц из спецификации, repository layer, seed 50 A2-навыков и 8 тем, безопасная reset/seed-команда и CRUD-тесты.

## Этап 2 — темы и старт сессии — готово

API списка тем, `TopicService`, нормализация custom topic через валидируемый structured output с локальным fallback, стартовый экран и неизменяемый snapshot темы в сессии.

## Этап 3 — генерация упражнения текстом — готово

Scheduler v1 и ExerciseGenerator через отделённый OpenAI adapter, Pydantic-схема результата, сохранение упражнения, novelty check и показ фразы во frontend. Все AI-тесты используют mock.

## Этап 4 — анализ текстового ответа — готово

Временный text input, AnswerAnalyzer с Pydantic-схемой, orchestrating service для попытки, сохранение результата и краткая/раскрываемая обратная связь. Это завершает текстовый вертикальный цикл до Learner Model и voice.

## Этап 5 — Learner Model и adaptive loop — готово

Чистая функция обновления mastery, состояния LEARNING/CONSOLIDATING/MASTERED, обновление `learner_skills` по анализу и подключение слабых/due навыков к Scheduler.

## Этап 6 — голосовой ввод короткой фразы — готово

Browser `MediaRecorder`, ограниченный временный буфер и backend-вызов OpenAI Audio Transcriptions. Аудио существует только в памяти на время запроса, не записывается в файлы/БД/логи; API key и model ID остаются на backend.

## Этап 7 — озвучивание русской фразы — следующий

Backend TTS с model ID из env, воспроизведение prompt перед включением микрофона и точный `reaction_ms` от фактического окончания воспроизведения. Затем — interrupt/retry UX и финальная e2e-проверка полного voice loop.
