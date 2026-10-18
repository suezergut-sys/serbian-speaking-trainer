# Награды за успехи — 18.10.2026

- [x] Общая реализация desktop web, мобильного web и Android-layout, RU/EN.
- [x] Точные 100%: позитивный колокольчик и краткая анимация с иконкой колокольчика.
- [x] 20-я проверка за сутки UTC (daily_usage.used=20): центральная панель, золотой круг с 20, 32 частицы конфетти; закрытие через 2000 мс. Оценка этой попытки может быть любой.
- [x] Независимые переключатели звука и анимации, сохранение на устройстве; отключение анимации скрывает текущую награду, отключение звука останавливает воспроизведение. Системный reduced-motion убирает движение и конфетти.
- [x] Собственный синтезированный WAV 1.25 с / mono PCM 22050 Hz, 55168 bytes, импорт ?inline. CSS и звук входят в клиентский bundle, отдельные запросы за ассетами не нужны. Никакое пользовательское аудио не записывается.
- [x] 239 unit/component tests из чистого Git-экспорта (247 в рабочем checkout с восемью посторонними локальными регрессиями, исключёнными из публикации); новые тесты покрывают точную границу 100%, дневные 19/20/21, повтор ID, независимое отключение, сохранение, оба языка, таймер, cleanup и AudioContext без fetch. Старые тесты переключателя помощи уточнены по accessible name после добавления двух новых переключателей.
- [x] Lint, TypeScript и production build. Vite предупреждает о размере существующего общего chunk >500 kB; сборка успешна.
- [x] 6 browser mock-сценариев RU/EN × desktop/mobile/Capacitor-layout: центр панели, конфетти, реальный AudioBufferSourceNode.start, отсутствие WAV/MP3/OGG сетевых запросов, исчезновение панели и сохранение выключенных переключателей после reload.
- [x] Web опубликован через [PR #131](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/131), runtime SHA `7a42b11e12791f547885ae77284498047070ce5c`; production READY/main и aliases подтверждены 18.10.2026, 20:56 МСК.
- [ ] Перенос в production APK и проверка packaged bundle: ожидают отдельной команды на Android-релиз. Android sync/build и версии не менялись, текущая версия 1.35/code45.
- [ ] Приёмка владельцем и воспроизведение динамиком физического Android-устройства.

Браузерные screenshot evidence: `artifacts/rewards/{ru,en}-{desktop,mobile,android}.png`, дополнительно `*-settings.png`. В тестах используются только синтетические auth/API/микрофон, внешние AI-вызовы отсутствуют.

## Выпуск и production-проверки

- Frontend: [deployment](https://serbian-speaking-trainer-cxfugdr7m-suezerguts-projects.vercel.app), `dpl_Dx8PUyXeoUehqNnHYd6k4FMPqYUe`. Aliases: [serbotalk.app](https://serbotalk.app/app), `serbian-speaking-trainer.vercel.app`.
- GitHub PR #131: CLEAN/MERGEABLE, обязательных remote CI checks нет; squash merge подтверждён. Выпуск из отдельного чистого Git archive merged SHA, без несвязанных локальных изменений. Существующий Vercel project не имеет Git integration, поэтому использован принятый CLI production deployment с SHA/main metadata.
- 192 входных frontend-файла: встроенный WAV присутствует; нет секретных .env, БД, APK, зависимостей и dist. Два прежних tracked .env.android/.env.example содержат только публичные VITE_API_BASE_URL/VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY. Backend, миграции, Telegram и Android не менялись.
- Шесть browser-сценариев на опубликованном production alias: RU/EN × desktop/mobile/Android-layout. Загружен реальный bundle; API/аккаунт/микрофон — синтетические fixtures. Проверены реальный AudioBufferSourceNode.start, золотая награда/32 частицы, центр viewport, 2-секундное закрытие, отсутствие сетевых запросов WAV/MP3/OGG, сохранение переключателей и повторная проверка без эффектов после reload.
- В существующей авторизованной Chrome-сессии на serbotalk.app/app проверены новые RU/EN тексты и независимые переключатели, выключенное состояние после reload. Русский язык и оба включённых переключателя восстановлены; счётчик остался 21, реальные попытки/STT/AI не запускались. Console errors: 0.
- HTTP `/`, `/app`, `/privacy`, `/terms`, `/api/health`: 200, anonymous `/api/topics`: 401. SHA-256 встроенного WAV в production JS совпал с исходным ассетом; отдельных загрузок звука нет.
- Vercel runtime error log rows: 0. Документальный commit после выпуска не меняет runtime и не требует redeploy.

Локальные evidence (не коммитятся): `artifacts/rewards-production-inputs.json`, `rewards-frontend-deploy.log`, `rewards-deployment.json`, `rewards-production-http.json`, `rewards-frontend-errors.jsonl`, `rewards-production-settings.png`, `artifacts/rewards/*`. Физическая приёмка динамика/Android остаётся открытой.
