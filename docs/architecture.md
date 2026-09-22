# Архитектура

```text
React/Vite -> REST /api -> FastAPI routers -> services -> repositories -> SQLAlchemy -> SQLite
Capacitor/Android -> тот же REST /api -/
                                      \\-> OpenAI adapter (начиная с этапа 2)
```

Android-клиент не содержит отдельной предметной БД. Он хранит локально только адрес backend и использует те же API-контракты, что browser-клиент; это сохраняет единый источник истины для фраз, повторений и будущих пользовательских профилей. `OPENAI_API_KEY` и model IDs остаются исключительно в backend-окружении.

В cloud-конфигурации React/Vite и FastAPI развёрнуты отдельными Vercel-проектами. Browser и APK вызывают HTTPS FastAPI; FastAPI использует Supabase PostgreSQL через Supavisor transaction pooler. Клиенты никогда не подключаются к PostgreSQL и OpenAI напрямую. Для PostgreSQL SQLAlchemy использует драйвер psycopg 3, `NullPool`, SSL connection string и отключённые prepared statements, что соответствует короткоживущим serverless-инстансам.

API-слой отвечает за HTTP-контракт и dependency injection. Сервисы владеют orchestration и бизнес-правилами. Репозитории изолируют запросы и транзакции. SQLAlchemy-модели не экспортируются напрямую как API response.

`TopicService` разрешает preset-тему или нормализует пользовательскую. `SessionService` сохраняет неизменяемый snapshot темы. Для preset-тем `ExerciseGenerator` выбирает без недавних повторов одну из 20 записей `TopicPhrase`: русский текст и канонический разговорный перевод уже находятся в SQLite. Для произвольных тем сохраняется structured AI/fallback-поток. Scheduler выбирает навыки только из контролируемого каталога, а итоговое упражнение всегда сохраняется перед выдачей.

`AttemptService` координирует `AnswerAnalyzer` и repositories. До внешнего анализа `AnswerAnalyzer` нормализует пунктуацию, регистр и пробелы: полное совпадение с любым допустимым вариантом получает детерминированные единичные оценки, пустой список issues и не вызывает OpenAI. Для остальных ответов сервис передаёт модели русскую фразу, допустимые варианты, ответ и timing placeholder; фильтрует неизвестные skill keys, issues с нулевой серьёзностью и самокоррекции, где evidence совпадает с correction; локально рассчитывает fluency при наличии timing. Отображаемое `corrected_sr` заменяется сохранённым `canonical_sr`, поэтому образец не меняется между попытками.

После сохранения попытки `LearnerModelService` применяет чистую функцию `update_mastery`, обновляет состояние, streak и `next_review_at` для каждого продемонстрированного навыка. Scheduler читает агрегированное learner state и добавляет веса weakness, error ratio и due review, сохраняя penalties за буквальное повторение и недавнее использование.

`StatisticsService` строит месячную read-model из `Attempt.created_at`: одна сохранённая попытка соответствует одному переводу, а результат от 0.95 считается правильным. Переход `ReviewPhrase` в `mastered` фиксируется в `mastered_at` и даёт число полностью выученных фраз. Границы месяца и группировка дней учитывают переданное browser смещение UTC. Отдельная таблица дневных итогов не нужна.

`ReviewService` владеет персональными фразами и словарными подсказками. `TopicPhrase.word_hints_json` содержит заранее валидированные переводы каждого слова preset-фразы; они строятся с обязательным контекстом `canonical_sr`, поэтому грамматические формы совпадают с каноном. При создании упражнения подсказки копируются в его snapshot и не требуют сетевого запроса. `ReviewPhrase` хранит русскую фразу, допустимые сербские варианты, лучший результат и серию успешных самостоятельных ответов; после трёх результатов от 95% подряд запись становится `mastered`. `WordLearningItem` создаётся только после явного открытия подсказки. `AttemptService` валидирует подсказанные слова по данным упражнения и применяет ограниченный штраф к итоговому баллу.

OpenAI adapter получает permanent key и model ID только из backend env, вызывает Responses API с `store=false` и возвращает только Pydantic-валидированный результат. Routers не содержат правил Scheduler.

Голосовой ввод короткой фразы использует browser `MediaRecorder` и backend Audio Transcriptions adapter. Blob передаётся как multipart только после остановки записи; backend держит ограниченный буфер в памяти и не сохраняет аудио на диск или в БД. Постоянный OpenAI key и model ID остаются на backend.
