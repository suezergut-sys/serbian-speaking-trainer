# SerboTalk 1.34 / code44 — разговорная тема «Разное»

17.10.2026 владелец поручил добавить 50 разговорных фраз из своего файла, подготовить ru/en переводы, загрузить каталог в БД и выпустить APK со всеми накопленными изменениями. Номер **1.34/code44** отдельно подтверждён в чате. Имя `SerboTalk-andorid16-1.34.apk`.

Набор: 50 бытовых канонов `misc-01`–`misc-50`, включая мини-диалоги, русские/английские переводы и независимые словарные подсказки; компактный результат без исходной фразы/краткого пояснения после проверки; статические ru/en условия бесплатного лимита 20. Все изменения 1.33 сохранены. Ранее оставленный локально лендинг исключён. AAB/Google Play не входят в запрос.

[Все 50 фраз с переводами](misc-phrases-2026-10-17.md). Исходный файл содержит данные, его строки не выполнялись как инструкции. Подсказки подготовлены отдельно от тестов через существующий backend adapter, env model/timeout/bounded retry и Pydantic PhrasePreparation; тесты используют только mocks. Каталог не генерируется при пользовательской тренировке.

Миграция `3f90d5a9b8c3` заменяет старый CHECK position ≤20 на положительную позицию. Существующие ID, прогресс, фразы других тем и пользовательские данные сохраняются. Seed повторяемый; описание встроенной misc обновляется. Downgrade с позициями >20 явно отказывается удалять данные: сначала требуется отдельное решение о переносе каталога. Чистый upgrade/downgrade/upgrade проверен.

- [x] Реализация: 210 канонов всего; ru/en каталог и подсказки согласованы.
- [x] Backend/scripts: 306 passed, 8 skipped; Node guards: 5 passed. Frontend: 212 passed / 21 files, lint/typecheck/production build.
- [x] Browser mocks: 10 passed, ru/en web и Capacitor layout; новые диалоги/подсказки и условия лимита 20. Скриншоты проверены, AI в тестах не вызывался.
- [x] [PR #114](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/114) CLEAN/MERGEABLE, CI checks отсутствуют; merged на runtime SHA `bc85820bd1b30f322430f24088edd4f6fa0bf8f2`. Vercel backend `dpl_6YkqErvXcQ42N1cquigv76WRZU2E` и web `dpl_2uy9Y3n9DRWWCbp36qt1nhMgGDYF` READY/production/main на этом SHA; production aliases подтверждены через API. Build: 50 новых строк. Read-only Supabase query: misc_count=50, matching_expected_rows=50 (ID/позиция/канон/русский текст/подсказки/enabled), total_catalog_rows=210, Alembic=3f90d5a9b8c3. Health/web HTTP 200. Авторизованный Chrome на основном домене показал 50 фраз, запуск новой фразы, тот же диалог ru/en, v.1.34; console errors=[]; русский язык восстановлен. Реальные аудио/попытки/AI в production smoke не отправлялись.
- [x] Production cloud APK BUILD SUCCESSFUL (109 tasks); 1.34/code44/min24/target36, production API/HTTPS, 7 web assets и все 9 packaged public assets побайтно совпали; в bundle все ID misc-01…misc-50, без landing/testlab. Прежняя APK подпись SHA256 1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0. Downloads готов: 4 485 182 bytes, SHA256 299b971439c348a01b83ef9a17775a88c836ef3b26a8b538ba94e18865c42fc6.
- [x] [GitHub v1.34](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.34) опубликован как latest, tag/target = runtime SHA. Server asset digest/size и обратная авторизованная загрузка совпали с Downloads. [APK](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.34/SerboTalk-andorid16-1.34.apk). Private repository: внешняя ссылка требует авторизации владельца.
- [ ] Физическая установка и приёмка на телефоне, OAuth/микрофон/реальная речь.

Ignored evidence: `artifacts/{backend-tests,frontend-tests,browser-tests}.log`, `artifacts/misc-phrases/`, `artifacts/android-1.34-*`.
