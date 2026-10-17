# Лендинг и вход на serbotalk.app — 17.10.2026

- [x] Работа в отдельной копии актуального main: несвязанные изменения основной папки сохранены.
- [x] Лендинг с авторской историей, ru/en мобильными скриншотами и календарём, выровненными телефонами и заглушкой Google Play перенесён из локального прототипа.
- [x] Сокращены вертикальные отступы: desktop story 125 → 60 px, how 100/90 → 60/50 px; mobile story 65 → 35 px, how 65/45 → 35/30 px; уменьшены hero, нижний блок и footer.
- [x] Встроен вход: Google, существующий review-вход, загрузка/ошибка/повтор, продолжение сохранённой сессии. Все CTA ведут к форме, успешный вход — на /app с обычной Supabase-сессией. Новый текст и accessibility labels ru/en в общем каталоге.
- [x] Host rewrite только для serbotalk.app: / → landing.html; /app → index.html. Старый vercel.app сохраняет приложение на /. Правовые страницы работают на обоих доменах.
- [x] Same-origin /api proxy к существующему production backend; frontend production VITE_API_BASE_URL уже пустой. Новый домен не требует открытия дополнительных CORS origins или выпуска backend.
- [x] В Supabase allow list добавлен точный https://serbotalk.app/app; прежние адреса и native callback сохранены, Site URL не изменён. Официальная документация redirect URLs и changelog проверены; ближайшее изменение старых TLS ciphers не затрагивает современный браузер.
- [x] Локально: 223 component/unit tests / 24 files, lint, typecheck и production build. Vite сообщает предупреждение о shared chunk >500 kB; сборка успешна.
- [x] Browser: 8 ru/en layout checks desktop/mobile/320px/Capacitor и 4 login→/app→reload checks с mock Supabase/API, без внешнего AI. Проверены календарь по локали и выравнивание телефонов на 800/1024/1440px, включая длинное описание.
- [x] Desktop preview просмотрен визуально: форма внутри нижнего блока, отступы сокращены, прежние иллюстрации сохранены.
- [ ] Публикация frontend на production и подтверждение SHA/Ready/aliases.
- [ ] Production smoke: лендинг, маршруты, API proxy, реальный Google callback и сохранение сессии.
- [ ] Ручная приёмка владельцем.

Android 1.34/code44 и package version не менялись; cap sync/APK не запускались. Landing entry исключён из Android/testlab build; native OAuth callback и Browser.open покрыты unit test. Нет изменений схемы БД, backend, моделей или хранения аудио.

Production-проверка первой публикации выявила filesystem precedence: высокоуровневый rewrite для / попадал после handle:filesystem, поэтому существующий index.html закрывал лендинг. Исправление задаёт явные routes с host root до filesystem; остальные маршруты и API сохранены. Повторная production-проверка обязательна.
