# Закреплённая шапка и пропорции тренажёра — 17.10.2026

- [x] Шапка лендинга sticky/top:0, с собственным z-index, фоном и blur; занимает ширину экрана с отступами общего контейнера. Название и переключатель RU/EN остаются доступны при прокрутке.
- [x] Якоря учитывают высоту шапки: desktop 104px, mobile 84px + 20px отступа; заголовки и форма входа не перекрываются.
- [x] Desktop workspace: точная сетка 1fr:2fr, max-width 1020px вместо 1260px. Старое переопределение левого столбца 250px на промежуточной ширине удалено. Мобильный тренажёр и его отдельный layout не меняются.
- [x] 223 component/unit tests / 24 files, lint, typecheck, production build.
- [x] 8 landing browser checks ru/en × desktop/mobile/320px/Capacitor: sticky при прокрутке, якоря ниже шапки, переключение языка и прежние иллюстрации.
- [x] 8 desktop browser checks ru/en × 800/1024/1366/1920px: правая панель = 2 × левая с допуском <1px, карточки/выбор темы и отсутствие overflow внутри workspace; desktop screenshot просмотрен.
- [x] Отдельное сравнение baseline на 800px: document width 801px и до, и после изменения (ru/en), workspace не переполняется. Прежнее округление 1px вне workspace не увеличено.
- [ ] Frontend production Ready/SHA/alias и проверки на serbotalk.app.
- [ ] Приёмка владельцем.

Тексты и общий ru/en каталог не менялись. Backend, данные, авторизация и Android 1.34/code44 прежние. APK/cap sync не запускались. Скриншоты проверки: игнорируемые artifacts/landing и artifacts/desktop-topics.
