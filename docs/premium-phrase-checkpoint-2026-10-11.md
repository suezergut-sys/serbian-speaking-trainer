# Премиум-карточка добавления фразы — 11.10.2026

- [x] Mobile web и Android-layout: обе карточки disabled, с приглушёнными элементами и reusable PremiumBadge (золотая корона в золотом шестиугольнике). Состояние/форма mobile добавления фразы удалены; desktop-ввод и API не менялись.
- [x] Targeted component regressions — 2 passed / 95 filtered skips; полный frontend suite — 192 passed / 17 suites. Проверены два disabled buttons, одинаковые значки, отсутствие формы и POST при нажатии.
- [x] Chrome mock production e2e build: mobile-premium-cards 320/390 web и native393 + Android startup/pager — 4 passed. Словарные popup bounds web/native320/390 — ещё 4 passed; устаревшее ожидание текста версии заменено на текущий формат v.major.minor из package.json. Эти проверки не вызывают OpenAI и не сохраняют аудио.
- [x] scripts/check.ps1: backend/scripts 257 passed / 8 skipped, Node guards 5 passed, frontend 192 passed / 17 suites, lint/typecheck/production build; exit 0. git diff --check прошёл.
- [x] Web: PR #85 merged; runtime SHA 582bf44345073df1c942da1242da0b402873d8f6. Vercel dpl_5CRDELASrDGFDX5dHQYM2LQTsFjB READY / production, alias https://serbian-speaking-trainer.vercel.app/ подтверждён API. HTTP web/API health 200. Авторизованный production smoke 320/390px: обе карточки disabled, badges, opacity .42, две колонки; старой mobile формы нет. Settings v.1.27, console errors []. Chrome CDP был недоступен; проверка выполнена в in-app browser с существующей сессией. Runtime error logs пусты.
- [x] pnpm android:sync: production Android build и Capacitor sync завершены; весь общий клиент после 1.27 перенесён в assets. APK не собирался, metadata остаются 1.27/code37.
- [x] Владелец отдельно подтвердил 1.28/code38 11.10.2026.
- [ ] Production cloud APK build и выпуск — [актуальный статус](android-1.28-release.md).
- [ ] APK metadata/API/signature, GitHub release, Downloads и digest/size.
- [ ] Физическая приёмка/реальная речь.

Следующий номер 1.28/code38 отдельно подтверждён владельцем; предыдущий APK 1.27 сохранён. Выпуск оформляется отдельно.

PR: https://github.com/suezergut-sys/serbian-speaking-trainer/pull/85
Deployment: https://serbian-speaking-trainer-6ri42okue-suezerguts-projects.vercel.app
Доказательства: artifacts/premium-phrase-{quality.log,android-sync.log,deployment.json,runtime.log,production-320.png,production-390.png}; artifacts игнорируются Git.
