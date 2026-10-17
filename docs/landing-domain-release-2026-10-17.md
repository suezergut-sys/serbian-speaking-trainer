# Лендинг и вход на serbotalk.app — 17.10.2026

- [x] Работа в отдельной копии актуального main: несвязанные изменения основной папки сохранены.
- [x] Лендинг с авторской историей, ru/en мобильными скриншотами и календарём, выровненными телефонами и заглушкой Google Play перенесён из локального прототипа.
- [x] Сокращены вертикальные отступы: desktop story 125 → 60 px, how 100/90 → 60/50 px; mobile story 65 → 35 px, how 65/45 → 35/30 px; уменьшены hero, нижний блок и footer.
- [x] Встроен вход: Google, существующий review-вход, загрузка/ошибка/повтор, продолжение сохранённой сессии. Все CTA ведут к форме, успешный вход — на /app с обычной Supabase-сессией. Новый текст и accessibility labels ru/en в общем каталоге.
- [x] Host rewrite только для serbotalk.app: / → landing.html; /app → index.html. Старый vercel.app сохраняет приложение на /. Правовые страницы работают на обоих доменах.
- [x] Same-origin /api proxy к существующему production backend; frontend production VITE_API_BASE_URL переключён на пустой при выпуске (см. уточнение sensitive env ниже). Новый домен не требует открытия дополнительных CORS origins или выпуска backend.
- [x] В Supabase allow list добавлен точный https://serbotalk.app/app; прежние адреса и native callback сохранены, Site URL не изменён. Официальная документация redirect URLs и changelog проверены; ближайшее изменение старых TLS ciphers не затрагивает современный браузер.
- [x] Локально: 223 component/unit tests / 24 files, lint, typecheck и production build. Vite сообщает предупреждение о shared chunk >500 kB; сборка успешна.
- [x] Browser: 8 ru/en layout checks desktop/mobile/320px/Capacitor и 4 login→/app→reload checks с mock Supabase/API, без внешнего AI. Проверены календарь по локали и выравнивание телефонов на 800/1024/1440px, включая длинное описание.
- [x] Desktop preview просмотрен визуально: форма внутри нижнего блока, отступы сокращены, прежние иллюстрации сохранены.
- [x] Публикация frontend: PR #117/#118/#119 merged; финальный runtime 95827eaacef8d05231834be6e3595bdffb228e91, production/main, READY, aliases подтверждены.
- [x] Production smoke: лендинг, маршруты, API proxy, реальный Google callback и сохранение сессии прошли.
- [ ] Ручная приёмка владельцем.

Android 1.34/code44 и package version не менялись; cap sync/APK не запускались. Landing entry исключён из Android/testlab build; native OAuth callback и Browser.open покрыты unit test. Нет изменений схемы БД, backend, моделей или хранения аудио.

Production-проверка первой публикации выявила filesystem precedence: высокоуровневый rewrite для / попадал после handle:filesystem, поэтому существующий index.html закрывал лендинг. Исправление задаёт явные routes с host root до filesystem; остальные маршруты и API сохранены. Повторная production-проверка обязательна.

17.10.2026, 16:31 МСК: root routing исправлен через PR #118. На runtime 85192b4 авторизованный Chrome успешно прошёл Google → /app, загрузку профиля/тем/упражнения и reload. Причина первого profile error: production VITE_API_BASE_URL имел sensitive тип, поэтому env pull скрывал значение пустой строкой, а bundle содержал старый абсолютный API URL. Выполнены явная web-сборка с пустым VITE_API_BASE_URL и PATCH значения production env на пустое (тип sensitive сохранён); опубликованный bundle проверен — API относительный. Backend/CORS не менялись. Восемь production layout checks прошли.

Сохранённая Supabase-сессия может отправлять SIGNED_IN при инициализации; listener лендинга теперь только обновляет кнопку продолжения, чтобы главная страница оставалась лендингом. Переход review-входа выполняется явным onSignedIn callback; Google возвращается прямо на /app. После уточнения: 14 targeted tests, typecheck/build/lint и 4 mock login→trainer→reload→landing checks прошли. Финальная production-проверка после этой правки ожидается.

## Финальные доказательства — 17.10.2026, 16:35 МСК

- [x] [PR #117](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/117), [#118](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/118), [#119](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/119) merged. CI checks отсутствуют; локальные проверки перечислены выше.
- [x] Финальный deployment `dpl_AtSk5PtK2qVwozN7z9rWU2a9yzpU`: [deployment](https://serbian-speaking-trainer-3x4tptutd-suezerguts-projects.vercel.app), READY/production/main, runtime `95827eaacef8d05231834be6e3595bdffb228e91`. Vercel API подтвердил SHA и aliases serbotalk.app, serbian-speaking-trainer.vercel.app, team alias.
- [x] [Новый домен](https://serbotalk.app/) открывает лендинг; [тренажёр](https://serbotalk.app/app), три правовые страницы и ru-calendar PNG HTTP 200. API health 200, anonymous auth/me 401; API не открыт без сессии. Старый vercel.app/ сохраняет экран приложения.
- [x] Final deployment выполнен обычной командой без build-env override после PATCH production VITE_API_BASE_URL на пустое. Публичный bundle подтверждает относительный API URL: исправление сохранено для будущих deployments. Тип sensitive и другие env сохранены.
- [x] На основном домене 4 root checks ru/en × 1440/393px: заголовок, локализованные изображения, CTA к встроенному входу, доступный Google button, отсутствие overflow/JS errors. Дополнительно 8 production layout checks ru/en desktop/mobile/320px/Capacitor прошли на предыдущей сборке с тем же оформлением.
- [x] Реальный Chrome: Google-вход существующим аккаунтом владельца → /app → профиль/темы/упражнение; reload восстанавливает вход. На финальном runtime переход назад на главную оставляет лендинг и показывает «Продолжить тренировку»; нажатие открывает работающий тренажёр. Запись/ответы/AI-вызовы не запускались.
- [x] Финальные frontend error logs за 10 минут пусты. Backend не выпускался; его error logs при диагностике тоже пусты.
- [x] Screenshot формы без персональных данных: `artifacts/landing-production/sign-in.png`; full-page RU/EN desktop/mobile там же. Игнорируются Git.
- [ ] Ручная приёмка оформления владельцем.
