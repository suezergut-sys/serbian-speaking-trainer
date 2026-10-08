# Строка аккаунта в настройках — 08.10.2026

- [x] Общий CSS web/Android: профиль слева, «Выйти» справа; flex row с align-items:center и space-between. Убран нижний отступ профиля, аватар/кнопка не сжимаются, длинное имя может переноситься внутри своей колонки. Header profile styles не изменены.
- [x] Chrome mock preview общего SettingsView: web и Android-layout на ширинах 390 и 320 CSS px. Разница вертикальных центров profile/button = 0 px во всех случаях; горизонтального переполнения нет. Снимок web: artifacts/debug-preview/account-web.png. Production/account settings не менялись, выхода из реального аккаунта не было.
- [x] Settings component tests 7 passed, lint, typecheck/production build и diff check прошли. Сохраняется штатное предупреждение Vite chunk >500 kB. Для CSS-изменения новые тесты структуры не добавлялись; геометрия проверена в браузере.
- [ ] Публикация web.
- [ ] Android sync/APK по отдельной команде; версия 1.24/code34 не менялась.
- [ ] Физическая Android/production-приёмка. Весь P0/P1/P2 не закрыт.


08.10.2026: [x] Web/backend опубликованы; [публикация 08.10.2026](latest-web-release-2026-10-08.md). [x] APK 1.25/code35 собран и опубликован, [выпуск 1.25](android-1.25-release.md). [ ] Физическая приёмка открыта.
