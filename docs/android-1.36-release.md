# SerboTalk 1.36 / code46 — центрированная анимация успеха

18.10.2026 владелец поручил исправить центрирование, сразу опубликовать web и выпустить APK. **1.36 / versionCode 46** отдельно согласованы в чате. Имя: `SerboTalk-andorid16-1.36.apk`.

Состав: анимация точных 100% центрирована внутри панели повторения, вне её прокручиваемого содержимого; дневная награда 20 остаётся в центре экрана. Весь накопленный клиентский набор после 1.35 включён: локальный встроенный звоночек, обе награды и переключатели RU/EN, статистика со звездой 18px и страницами 20/50. Серверный пропуск assistance для эталонной расшифровки уже опубликован и совместим; backend/миграции/Telegram в этом выпуске не меняются.

- [x] Общая реализация web/mobile/Android и RU/EN. Overlay perfect находится непосредственно в exercise-layout, position:absolute; родитель position:relative. Viewport-offset и portal для perfect удалены. Прокрутка текста не сдвигает награду.
- [x] Component regression проверяет принадлежность perfect к панели и screen portal для twenty; metadata regression обновлена для 1.36/code46.
- [x] 240 frontend tests чистого Git-экспорта, lint/typecheck/web production build; рабочий checkout дополнительно прошёл 248 тестов с восемью несвязанными локальными регрессиями, исключёнными из публикации. 71 исходный runtime/config-файл APK сопоставлен с committed source, с нормализацией переводов строк для текста.
- [x] Геометрия perfect и прежняя daily reward проверены RU/EN в 20 конфигурациях: desktop 1366×900, wide 1920×1080, tablet 800×1024, mobile 393×851, narrow 320×568, short 393×480, landscape 851×393, Android 393×851/320×568/851×393. Допуск центрирования <2px по сумме осей; allowance 1px для округления общей ширины страницы на tablet. Изначальный общий assert overflow=0 выявил 801px на viewport 800px после результата; проверка уточнена до сравнения с исходной шириной и допуском округления, без изменения layout вне награды. Повтор RU/EN tablet прошёл. Эффекты/таймер/переключатели проверяются с synthetic API/audio/auth, OpenAI не вызывается.
- [x] `pnpm android:cloud-apk`: BUILD SUCCESSFUL, 109 tasks. Перед итоговым sync/build завершена сборка web; в APK перенесён именно Android bundle с production API. 1.36/code46/min24/target36, HTTPS WebView.
- [x] Все 7 dist assets и 9 packaged public assets побайтно совпали с sync. Звоночек встроен в JS, его SHA-256 совпал с исходным WAV; CSS perfect содержит absolute/center, родитель relative. Нет landing/testlab, локального API и backend-секретов.
- [x] Прежний сертификат SHA256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`, apksigner verification passed. APK **4 545 896 bytes**, SHA256 `6369cfeecc5c9b388c837598fd2907bbd325e5c0bc34ca7681df42854d23d21f`; копии artifacts/Downloads совпали.
- [x] [PR #133](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/133) merged; runtime SHA `8a0c4bbf6f8d70655459606ef82052e1b7854845`, CLEAN/MERGEABLE, обязательных GitHub checks нет. Frontend `dpl_H7p12qxF28LnuTmAeVpCwra6ZQCQ` READY/production/main, aliases serbotalk.app и serbian-speaking-trainer.vercel.app подтверждены API. [Deployment](https://serbian-speaking-trainer-p81ivzanf-suezerguts-projects.vercel.app).
- [x] [GitHub release v1.36](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.36) опубликован как latest, tag/target = runtime SHA. Server digest/size и обратная авторизованная загрузка совпали с artifacts/Downloads. Репозиторий private: GitHub-ссылка требует авторизации владельца.
- [ ] Физическая установка, Google OAuth, динамик, микрофон и реальная речь на телефоне.

APK подготовлен в `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.36.apk`. AAB и Google Play Console не входят в поручение.

Локальные evidence вне Git: `artifacts/reward-centering/*`, `android-1.36-build.log`, `android-1.36-badging.txt`, `android-1.36-signature.txt`, `android-1.36-verification.json`, `verify-android-1.36.py`, `SerboTalk-andorid16-1.36.apk`.

## Production-проверки

- [x] Авторизованный Chrome на serbotalk.app/app подтвердил v.1.36, RU/EN настройки и награды; русский язык восстановлен. Реальные попытки, речь и AI-вызовы не выполнялись. Console errors: 0.
- [x] HTTP `/`, `/app`, `/privacy`, `/terms`, `/api/health`: 200; anonymous `/api/topics`: 401. В production CSS perfect находится внутри relative панели, absolute/center без верхнего отступа; SHA-256 встроенного WAV совпадает с исходным. Vercel runtime error log rows: 0.
- [x] 20/20 браузерных сценариев прошли на основном production URL serbotalk.app/app (18.10.2026, 21:35 МСК): RU/EN × 10 конфигураций; геометрия центра панели, обе награды/звук/таймер и отключение после reload подтверждены. API/аккаунт/аудио — synthetic fixtures; загружены реальные опубликованные assets, OpenAI и реальные попытки не вызывались.

Vercel project не имеет Git integration; frontend выпущен принятым CLI workflow из чистого git archive merged runtime SHA. Документальный commit после проверки не меняет runtime и не требует redeploy. Backend/Telegram/БД не перевыпускались.

Дополнительные локальные evidence: `android-1.36-deployment.json`, `android-1.36-frontend-deploy.log`, `android-1.36-http-smoke.json`, `android-1.36-frontend-errors.jsonl`, `android-1.36-github-api.json`, `android-1.36-redownload/SerboTalk-andorid16-1.36.apk`. APK: [скачать](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/download/v1.36/SerboTalk-andorid16-1.36.apk).
