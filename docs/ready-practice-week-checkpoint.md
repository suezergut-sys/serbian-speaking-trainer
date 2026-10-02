# Готовая практика после входа и выбор недели — 02.10.2026

## Запрос владельца

Скрыть поэтапное появление элементов тем, выбрать повторение при непустой очереди или первую тему с неизученными фразами и заранее подготовить её первую фразу. В статистике показывать по центру «Неделя · даты», разрешить прошлые недели и скрывать стрелку вперёд на текущей.

## Проверки

- [x] Недельная навигация: 5 component tests (включая прежние retry/abort), 2 isolated Chrome browser tests для web и Android layout. Граница года, reuse месячных данных, поздний ответ, отсутствие перехода в будущее и центрирование подтверждены.
- [x] Startup: темы + summary + первая фраза завершаются до раскрытия UI; приоритет review, иначе первая непустая тема; пустой каталог и ошибки допускают retry/manual path. Отдельные регрессии сохраняют draft при background catalog retry и игнорируют позднюю отменённую подготовку.
- [x] GPT-6.1 Sol / medium финально одобрил startup и недельную навигацию после двух исправлений recovery; новых блокеров не обнаружено.
- [x] Полный frontend component suite: 99/99. Root browser regression: 17/17 (practice/network/lifecycle/highlight/lazy/week); отдельный delayed startup browser test прошёл. Lint прошёл; финальная сборка подтверждается отдельно.
- [x] Lint, typecheck и production build прошли. Main JS 521.72 KB / 155.81 KB gzip; обычный warning >500 KB остаётся. Startup browser включает horizontal pager scroll, ready mic и один session POST. App 70/70 повторно прошли после коррекции timings.
- [x] Web опубликован через PR #52; Vercel READY и авторизованный production startup/week navigation проверены.
- [ ] Перенести изменения в отдельно заказанный Android-релиз и проверить физический телефон.

Android layout в Chrome не является проверкой APK/WebView/устройства. APK остаётся 1.17/code27; native sync/build, phone/ADB tests в этом срезе не выполняются. Автоматические тесты используют fake API/STT без OpenAI calls и без сохранения аудио.

## Поведение и границы

- Повторное нажатие выбранной темы не создаёт вторую сессию и не стирает готовую фразу/черновик.
- Обычный refresh каталога после запуска отделён от startup: сетевой retry не перезапускает тренировку.
- Начальная очередь может опустеть между summary и стартом: только `review_queue_empty` переключает на первую непустую тему. Другие ошибки показывают восстановление.
- Native first_phrase timing начинается при показе панели упражнения, а не включает время ожидания пользователя на темах. Topics timing включает подготовку стартового экрана. Это изменение оснастки, а не новый performance benchmark.
- Week navigation строится в локальных календарных датах; месячные ответы используются повторно внутри месяца, при смене месяцев запрос отменяется. Будущие недели недоступны.

Финальный полный isolated Chrome run после всех изменений: 18/18 (включая startup и две week-navigation проверки). Production/Android verification остаётся отдельной отметкой.

## Production — 02.10.2026

- [PR #52](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/52) merged; source/runtime SHA `d4a9e629973dcc7d70ac9e1225c1376cfcd56fff`. Обязательных GitHub CI checks не показано; локальные проверки и независимое ревью подтверждены выше.
- Frontend deployment `dpl_A4NTfhGKycrbJT97otbmoaVJo2gc` READY на том же SHA, alias подтверждён Vercel API: [deployment](https://serbian-speaking-trainer-9ad8gu69s-suezerguts-projects.vercel.app), [production](https://serbian-speaking-trainer.vercel.app). Entry `index-gCWnNNU3.js`, CSS `index-Cuvt3oqO.css`, stats chunk `StatisticsView-DjdSiXWj.js`. Cloud main JS 521.77 KB / 155.83 KB gzip.
- Авторизованный IAB после reload: вход сохранился, review selected (`review-topic is-selected`), счётчик очереди загружен, первая фраза сразу показана и кнопка ответа доступна без выбора темы. Запись/оценка/изменение изученности не выполнялись; автоматический session start — ожидаемая часть нового поведения.
- Неделя 28 сентября — 4 октября → 21 — 27 сентября → текущая: данные загрузились, стрелка вперёд появляется только в прошлом и исчезает на текущей. Возврат к практике сохранил ту же готовую фразу. Console errors: 0.
- Android cold start/swipe проверены только в browser native layout/fixtures. APK 1.17/code27, native assets, backend runtime/schema и физический телефон не менялись.
