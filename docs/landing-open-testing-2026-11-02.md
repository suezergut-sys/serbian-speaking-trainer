# Google Play Open Testing и ссылка с лендинга

02.11.2026. Живая Console: Open Testing1.45/code55 активен, доступен неограниченному количеству тестировщиков,178 стран/регионов. Отображаемая дата выпуска2ноября19:14 (время Console, без отдельного пересчёта). Это доступный открытый тест; production отдельно.

- Opt-in для внешних пользователей: https://play.google.com/apps/testing/com.serbiantalk.trainer
- Карточка установки из Console: https://play.google.com/store/apps/details?id=com.serbiantalk.trainer
- Проверенная public opt-in страница показывает SerboTalk и Become a tester. От имени владельца к тесту не присоединялись. Установка на физическое устройство этой проверкой не подтверждается.

## Изменение лендинга

- [x] Обе заглушки Google Play заменены одинаковой доступной ссылкой участия, target=_blank,rel=noopener noreferrer; обозначение «Открытое тестирование»/«Open testing». Под нижней CTA инструкция присоединиться и установить из Play. RU/EN в одном изменении; существующие тёмные стили и web sign-in сохранены.
- [x] Два component scenarios RU/EN и8 browser scenarios (desktop/mobile/320px/shared Android layout) прошли. Начальная component-проверка обнаружила слитное accessible name без пробела; добавлен явный пробел в видимую строку, assertions сохранены, component повтор прошёл. Backend/Auth/AI не менялись и не вызывались тестами. Скриншоты вне Git вartifacts/landing.
- [x] ESLint src/typecheck/production build passed. Первый выборочный eslint завис при обходе двух путей и был остановлен; полный src lint завершился успешно.
- [x] [PR #194](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/194) merged. Web runtime `d7b45fe6913b77f40227a9b4d32d7599dce9bc9b`, deployment `dpl_F6uYgiwZCfh6Su5muwkNJpUahGJP`, https://serbian-speaking-trainer-bxakkrl1x-suezerguts-projects.vercel.app : READY/production/alias serbotalk.app/SHA подтверждены Vercel API. Backend остаётсяc1cffbc; APK/AAB1.45 не менялись.
- [x] Production homepage HTTP200;8/8 production browser scenarios RU/EN desktop/mobile/320px/shared Android после финального whitespace-fix прошли. Проверены обе ссылки/target/rel, инструкция, изображения, overflow, sticky header и отсутствие page errors. Frontend runtime error query за10мин вернул0 событий.
- [x] Настоящая owner-сессия открыла основной serbotalk.app: видны обе Google Play Open Testing ссылки, продолжение web-входа сохранено. Screenshot `artifacts/landing-play-production.png`; Console proof `artifacts/open-testing-active-2026-11-02.png`. В аккаунт Google тестировщиком не вступали, микрофон/AI/платежи не запускались.
- [x] Последующий evidence commit меняет только документацию; web не развёртывается повторно. После merge повторяется проверка main==origin/main и12 чистых синхронизированных копий; фактический итоговый SHA сообщается отдельно.
- [ ] Установка из Play владельцем/внешним пользователем: Google-вход, автоматический Premium, отсутствие оплаты, речь/проверка. После приёмки production release отдельно.

Android sync/build/version не менялись: APK/AAB1.45 остаются с исходникамиc1cffbc и прежними hashes. Веб-лендинг не требует пересборки APK. Перед работой12 копий чистые наd582e23; recovery не требовались. После публикации/evidence все копии повторно синхронизируются, итоговый SHA фиксируется в отчёте. Артефакты и секреты вне Git.
