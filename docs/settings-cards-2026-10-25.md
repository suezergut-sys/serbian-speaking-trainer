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

- [ ] GitHub PR/merge.
- [ ] Web deployment Ready, production alias/SHA и браузерная проверка опубликованного интерфейса.
- [ ] Будущий отдельно запрошенный APK и физическая Android-приёмка.

Автотесты используют synthetic auth/API и не вызывают OpenAI. Backend, схема и окружение не менялись. Production deploy только frontend по принятому CLI workflow из чистого git archive. Основная папка и 11 дополнительных worktree изначально чистые на 59019eb; recovery не потребовалась. Итоговая синхронизация фиксируется после публикации.
