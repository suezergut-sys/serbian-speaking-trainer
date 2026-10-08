# SerboTalk 1.25 — последние изменения

08.10.2026 владелец отдельно подтвердил 1.25 / versionCode 35 после команды опубликовать последние изменения и выпустить APK.

Состав: скрытие «Разбора» при отображаемых 100%, восстановление STT при неподдерживаемом алфавите, персональный режим отладки моделей для администратора Максима Сумина и выравнивание профиля/кнопки выхода. Web/backend уже опубликованы через PR #71; [production evidence](latest-web-release-2026-10-08.md).

- [x] Функциональные проверки: backend/scripts 248 passed, 8 штатных skips; frontend 171 passed, lint/typecheck/production build. AI calls mock.
- [x] Версия 1.25/code35 согласована отдельно, metadata обновлена.
- [x] Android metadata/environment: 17 tests passed. Проверены versionName/code, точное имя APK и требования к production HTTPS API/auth configuration.
- [ ] Android cloud build, metadata/API/подпись/assets и публикация APK.
- [ ] Физическая Android-приёмка и реальная речь. ADB/AVD не запускались; P0/P1/P2 целиком не закрыты.
