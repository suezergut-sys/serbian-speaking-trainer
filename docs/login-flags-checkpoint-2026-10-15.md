# Экран входа — 15.10.2026

- [x] Две квадратные кнопки РФ/Великобритании, тонкая золотая рамка активного языка; default ru и сохранённый выбор.
- [x] Высота и координаты карточки/заголовка/описания/Google/review/legal одинаковы в ru/en. Скрытые sizing-переводы не озвучиваются.
- [x] Только «Вход для проверки» в ru, «Review access» в en; обе подписи по центру.
- [x] Playwright: 4 новых browser checks (1366/393/320px/Capacitor Android-layout) и 3 существующих login checks прошли. Скриншоты: ignored artifacts/login-flags и artifacts/localization-fixes.
- [x] Backend/scripts: 299 passed / 8 skipped; Node guards: 5 passed. Frontend: 206 passed (20 files, --maxWorkers=1); lint, TypeScript, production build прошли. Первый parallel UI run: 205 passed, StatisticsView retry timeout; isolated 11/11 и полный повтор 206/206 прошли без изменений теста.
- [ ] Frontend production release и browser smoke: [PR #102](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/102).
- [ ] Android APK по отдельной команде; текущая 1.32/code42 без изменений.
- [ ] Приёмка владельцем.
