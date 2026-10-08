# Версия приложения в настройках — 08.10.2026

Под заголовком настроек добавлена строка «Версия приложения: 1.26». Источник — существующая версия `frontend/package.json`, формат `major.minor` соответствует Android `versionName`. Используются общий шрифт и CSS-переменная `--muted` тёмной темы; строка доступна независимо от роли и наличия блока профиля.

- [x] Component regression сверяет видимый номер с `frontend/android/app/build.gradle`.
- [x] Полный frontend suite: 184 tests / 16 files passed, внешние AI-вызовы не выполнялись.
- [x] `pnpm lint`, TypeScript (`tsc -b`) и `pnpm build` прошли. Vite сообщает предупреждение о размере основного chunk >500 kB.
- [x] `git diff --check` прошёл.
- [ ] Публикация в production web.
- [ ] Ручная визуальная приёмка web.
- [ ] Перенос в следующий APK и физическая Android-приёмка по отдельной команде.

Android sync и сборка APK не выполнялись; package/Android metadata не менялись.
