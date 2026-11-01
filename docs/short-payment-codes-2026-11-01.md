# Шестисимвольные коды web-оплаты

01.11.2026. Новые заявки СБП и PayPal получают код вида `7K4M9P`. Существующие длинные номера не сокращаются: их могли уже указать в переводе. Повторное открытие активной заявки возвращает тот же номер; новая заявка создаётся после отмены прежней.

Код генерируется через secrets.choice из 32 символов без0/O/1/I, шесть знаков. Это платёжная ссылка, не credential: API сохраняет проверку пользователя и администратора. Поиск/подтверждение по чужому коду не разрешены. PK payment_requests.id обеспечивает глобальную уникальность; коллизия вставки обрабатывается SAVEPOINT и новой генерацией, максимум10 попыток. Другие ошибки целостности сразу пробрасываются. SQLite BEGIN до SAVEPOINT сохраняет outer rollback даже без предшествующих записей. Ни схема String(36), ни FK, ни данные существующих заявок не меняются; миграция не нужна.

Форма/clipboard, список администратора и уведомление уже используют id целиком — runtime frontend менять не потребовалось, строки RU/EN и стиль прежние. Android1.44 не синхронизируется и не пересобирается, версия/Play не меняются.

- [x] Реализация и начальные проверки:32 payment API/service tests,14 component tests RU/EN и4 browser scenarios RU/EN desktop/mobile; дополнительные проверки bounded retry/ошибок целостности добавлены в финальный запуск.
- [x] Финальные36 payment API/service/config/migration tests и14 component tests RU/EN;4 browser scenarios RU/EN desktop/mobile. Проверены исчерпание10 коллизий, rollback новой записи без предыдущих writes, сохранение прежней активной заявки при ошибке и немаскирование прочих IntegrityError. Автотесты не обращаются к AI или реальным платежам.
- [x] ESLint src, typecheck и production build passed. Общий eslint . был остановлен из-за длительного обхода файлов; проверка всего src завершилась без ошибок, runtime frontend не меняется. На production bundle прошли4/4 сценария с synthetic API; screenshots RU mobile/EN desktop просмотрены, короткий код читаем и не обрезан.
- [x] [PR #189](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/189) merged. Backend production READY на `dd0bdc1324059e98f9171a295b123575f00ff774`, deployment `dpl_AdSxYdXg2vu9bagzyZfHq6jEDxkY`, alias `serbian-speaking-trainer-api.vercel.app`; SHA/alias/state подтверждены Vercel API. Frontend runtime не менялся, отдельный deploy не нужен.
- [x] После READY: backend/web rewrite health200, `/app`200, `/api/payments` без сессии401. Backend error log query за10мин после публикации вернул0 error-событий. Build запустил существующие migration/seed:0 additions, схема платежей не менялась.
- [x] Четыре browser scenarios на production bundle с синтетическими API прошли; настоящая платёжная заявка ради проверки не создавалась. Это не end-to-end подтверждение реального перевода. Логи/скриншоты вне Git в `artifacts/short-codes-*`/`artifacts/short-payment-codes`.
- [x] Evidence commit меняет только документацию; runtime остаётся `dd0bdc1`, повторный deploy/APK не требуется. После merge evidence все12 копий повторно проверяются и синхронизируются; фактический итоговый SHA указывается в отчёте.
- [ ] Приёмка следующей реальной оплаты владельцем; автоматические/браузерные проверки используют синтетические данные, денег и уведомлений не отправляют.

Все12 рабочих копий перед началом чистые на195238d; recovery не требовались. После публикации и evidence commit будет выполнена финальная синхронизация с origin/main.
