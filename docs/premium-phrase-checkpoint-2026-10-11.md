# Премиум-карточка добавления фразы — 11.10.2026

- [x] Mobile web и Android-layout: обе карточки disabled, с приглушёнными элементами и reusable PremiumBadge (золотая корона в золотом шестиугольнике). Состояние/форма mobile добавления фразы удалены; desktop-ввод и API не менялись.
- [x] Targeted component regressions — 2 passed / 95 filtered skips; полный frontend suite — 192 passed / 17 suites. Проверены два disabled buttons, одинаковые значки, отсутствие формы и POST при нажатии.
- [x] Chrome mock production e2e build: mobile-premium-cards 320/390 web и native393 + Android startup/pager — 4 passed. Словарные popup bounds web/native320/390 — ещё 4 passed; устаревшее ожидание текста версии заменено на текущий формат v.major.minor из package.json. Эти проверки не вызывают OpenAI и не сохраняют аудио.
- [x] scripts/check.ps1: backend/scripts 257 passed / 8 skipped, Node guards 5 passed, frontend 192 passed / 17 suites, lint/typecheck/production build; exit 0. git diff --check прошёл.
- [ ] Web-публикация и production smoke.
- [x] pnpm android:sync: production Android build и Capacitor sync завершены; весь общий клиент после 1.27 перенесён в assets. APK не собирался, metadata остаются 1.27/code37.
- [ ] Подтверждение следующей версии и повторный production cloud APK build.
- [ ] APK metadata/API/signature, GitHub release, Downloads и digest/size.
- [ ] Физическая приёмка/реальная речь.

Предыдущий контрольный APK 1.27/code37 пока не заменён; номер следующего выпуска согласуется отдельно по правилам проекта.
