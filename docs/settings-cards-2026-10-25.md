# Карточки настроек — 25.10.2026

## Реализация

- [x] Концепция согласована владельцем с уточнением: флаги для языков и смысловые иконки для остальных плашек. Локальные векторные флаги RU/GB, Aa/Ћћ, подсказки, колокольчик, хлопушка, share/link/feedback/debug. OpenAI icon: официальный [apps-sdk-ui](https://github.com/openai/apps-sdk-ui/blob/main/src/components/Icon/svg/OpenaiLogoRegular.tsx); лицензия в assets/settings/OPENAI-LICENSE.txt. Логотип обозначает используемый сервис распознавания и не является брендингом приложения.
- [x] Два столбца для коротких выборов и наград, три для share/copy/readonly URL на desktop, 2+1 на мобильном; длинные настройки и feedback — полная ширина. Сохранены ручное копирование, отмена share, форма отзыва, admin-only диагностика, API и account/deletion.
- [x] Выбранная radio-карточка имеет рамку и галочку; нативные radio сохраняют Arrow-key/focus и имя. Нативные checkbox/switch с видимыми on/off и disabled, status/alert, тёмные select/input. Переключение RU/EN использует общий каталог; сербские примеры не переводятся.
- [x] Shared Android-layout использует те же компоненты и CSS. Android sync/build, версия и packaged assets не менялись.

## Проверки

- [x] 36 targeted component checks: SettingsView и ShareApp/Feedback/TranscriptionModel/ModelDebug; новые проверки смены языка, алфавита, disabled и callback подсказок.
- [x] 8/8 browser checks RU/EN × desktop/mobile/320px/Android-layout: две колонки, 3/2+1 actions, флаги/logo, клавиатура, переключатели, selector/retry ошибки диагностики, account/deletion, отсутствие overflow. Fixture расширен существующим /api/custom-phrases для фоновой загрузки Android pager.
- [x] Полный scripts/check.ps1: 393 backend/scripts passed, 9 skipped (отдельный PostgreSQL testlab недоступен), 5 Node guards; 317 frontend tests, eslint, TypeScript и production build прошли. Предупреждение Vite о размере chunk прежнее. Local evidence: artifacts/settings-design/quality.log.
- [x] Screenshot review desktop и отдельных admin-карточек на узком экране; local evidence вне Git: artifacts/settings-cards/*.png, artifacts/settings-account/*.png, artifacts/transcription-models/*.png.

## Публикация и устройства

- [x] [PR #155](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/155) merged; runtime SHA `f285c6f19c7a9f2ca3fbec606208d055572a9194`. GitHub checks отсутствуют; локальный quality gate завершён.
- [x] Web deployment `dpl_FSie133r6cmwgfuvPpBMSvGNZ74x` Ready/production/main. [Deployment](https://serbian-speaking-trainer-drgp6mhfo-suezerguts-projects.vercel.app), alias `serbotalk.app` и runtime SHA подтверждены Vercel API. CLI использовал чистый git archive; backend не перевыпускался.
- [x] 25.10.2026: HTTP `/`, `/app`, `/privacy`, `/api/health` → 200; anonymous `/api/topics` → 401. 8/8 production browser scenarios RU/EN × desktop/mobile/320px/shared Android на реальном bundle `https://serbotalk.app/app`, synthetic auth/API, без production writes и AI. Тест учитывает `/app` в production base URL.
- [x] В существующей авторизованной Chrome-сессии после reload подтверждены карточки/навигация, RU↔EN, текущая версия 1.39, фактический список моделей и загруженная отладка. Модель/отладка не изменялись, отзыв не отправлялся. Local evidence: artifacts/settings-design/{deployment-api.json,production-http.json,production-browser.log,production-settings-ru.png}, production screenshots в artifacts/settings-cards/*.png.
- [ ] Будущий отдельно запрошенный APK и физическая Android-приёмка.

Автотесты используют synthetic auth/API и не вызывают OpenAI. Backend, схема и окружение не менялись. Production deploy только frontend по принятому CLI workflow из чистого git archive. Основная папка и 11 дополнительных worktree изначально чистые на 59019eb; recovery не потребовалась. После merge evidence-only follow-up все неактивные чистые detached worktree обновляются до итогового main; прежние ветки сохранены. Recovery-ветки codex/recovery-android-experiments-20261003, codex/recovery-before-139-20261024 и codex/recovery-primary-20261003 сохранены; новых не создавалось. Финальный снимок 12 HEAD/status/main/origin — artifacts/settings-design/worktrees-final.json. PR #156 содержал только документы и production URL теста и не требовал повторного deploy/APK. Затем общий клиент с настройками включён в runtime aaaa90b выпуска Premium: [доказательства](premium-offer-2026-10-25.md). Финальный main может быть новее runtime только на commits доказательств; APK прежний.
