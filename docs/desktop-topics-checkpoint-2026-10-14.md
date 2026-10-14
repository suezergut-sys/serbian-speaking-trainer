# 14.10.2026 — компактные desktop темы

- [x] Desktop aside использует два столбца компактных карточек: повторение, темы, две premium-карточки добавления. Счётчики и выбор прежние; названия переносятся, descriptions убраны из карточек.
- [x] Добавление темы/фразы закрыто disabled-карточками с общим золотым PremiumBadge, как в mobile web. Desktop-формы и недоступные UI handlers удалены; API создания и существующие пользовательские темы остаются совместимыми.
- [x] Component regression подтверждает ru/en premium disabled, отсутствие доступных форм и запросов создания. Прежние component tests создания заменены проверкой закрытого интерфейса; backend integration coverage создания сохранён.
- [x] Browser regression: ru/en × 1024/1366 — 4 passed, проверены два столбца, компактные размеры, отсутствие горизонтального overflow, disabled/actions, золотые значки и выбор темы. Screenshots: `artifacts/desktop-topics/{ru,en}-{1024,1366}.png`.
- [x] Девять накопленных browser scenarios login/transcript/review для desktop/mobile/shared Android-layout прошли вместе с изменением.
- [x] Backend/scripts 293 passed / 8 skipped, Node guards 5 passed. Full UI 205 passed, App component 98 passed; lint/typecheck/production Android build и cap sync прошли.
- [ ] Публикация web/backend и production smoke.
- [x] Владелец отдельно согласовал 1.32/code42; cloud APK build, metadata/API/signature/9 packaged files/Downloads проверены. [Доказательства](android-1.32-release.md).
- [ ] Физическая приёмка на телефоне.

Публикация включает также накопленные исправления [входа/повторения/источника английского разбора](localization-fixes-checkpoint-2026-10-14.md) и ранее сохранённые документы Google Play/AAB 1.30. Обновление Play Console и новый AAB в этой задаче не выполняются.
