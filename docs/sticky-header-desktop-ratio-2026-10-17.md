# Закреплённая шапка и пропорции тренажёра — 17.10.2026

- [x] Шапка лендинга sticky/top:0, с собственным z-index, фоном и blur; занимает ширину экрана с отступами общего контейнера. Название и переключатель RU/EN остаются доступны при прокрутке.
- [x] Якоря учитывают высоту шапки: desktop 104px, mobile 84px + 20px отступа; заголовки и форма входа не перекрываются.
- [x] Desktop workspace: точная сетка 1fr:2fr, max-width 1020px вместо 1260px. Старое переопределение левого столбца 250px на промежуточной ширине удалено. Мобильный тренажёр и его отдельный layout не меняются.
- [x] 223 component/unit tests / 24 files, lint, typecheck, production build.
- [x] 8 landing browser checks ru/en × desktop/mobile/320px/Capacitor: sticky при прокрутке, якоря ниже шапки, переключение языка и прежние иллюстрации.
- [x] 8 desktop browser checks ru/en × 800/1024/1366/1920px: правая панель = 2 × левая с допуском <1px, карточки/выбор темы и отсутствие overflow внутри workspace; desktop screenshot просмотрен.
- [x] Отдельное сравнение baseline на 800px: document width 801px и до, и после изменения (ru/en), workspace не переполняется. Прежнее округление 1px вне workspace не увеличено.
- [x] Frontend production READY/main, runtime d98e2092002678a8bdf97a54b9f7896d247fdccc; alias serbotalk.app подтверждён, production-проверки прошли.
- [ ] Приёмка владельцем.

Тексты и общий ru/en каталог не менялись. Backend, данные, авторизация и Android 1.34/code44 прежние. APK/cap sync не запускались. Скриншоты проверки: игнорируемые artifacts/landing и artifacts/desktop-topics.

## Публикация — 17.10.2026, 17:10 МСК

- [x] [PR #121](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/121) merged; CI checks отсутствуют.
- [x] Deployment `dpl_CdQ14P9LoYhh8gLfJut9yRet6aTZ`, [deployment URL](https://serbian-speaking-trainer-fs5tj0rud-suezerguts-projects.vercel.app), READY/production/main на d98e209; Vercel API подтвердил SHA и aliases serbotalk.app / прежний vercel.app.
- [x] На основном домене 16/16 browser checks: 8 sticky/anchor ru/en desktop/mobile/320px/Capacitor и 8 desktop ratio/card ru/en 800/1024/1366/1920px. Тренажёр проверен с mock API и synthetic session, реальные аккаунты/прогресс/AI не затрагивались.
- [x] Дополнительная root-проверка serbotalk.app/#how: шапка y=0 и EN в viewport после прокрутки; screenshot artifacts/landing/sticky-production.png просмотрен.
- [x] /, /app, /privacy и /api/health HTTP 200; error logs финального deployment за 10 минут пусты.
- [ ] Приёмка владельцем. APK/cap sync/version не менялись.
