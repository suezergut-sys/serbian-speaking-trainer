# Предложение Premium — 25.10.2026

## Реализация

- [x] Только экран до активации: большая золотая корона PremiumBadge и заголовок по центру; 100 повторений в день, до 5 личных тем, до 30 фраз в каждой (150 своих фраз всего). Лимиты сверены с backend custom_content_policy и опубликованным Premium daily limit.
- [x] Кнопка КУПИТЬ/BUY по ширине слова с padding, однократный платёж 5 евро по команде владельца, картинка двух чашек кофе, ниже мелким текстом причина оплаты — API-вызовы внешней модели OpenAI. RU/EN каталог обновлён одновременно, тёмная палитра и общие шрифты.
- [x] Активный Premium/admin сохраняет создание/просмотр/удаление своих тем/фраз. Покупка остаётся disabled: платёжный backend не добавлялся, пользователей автоматически не активировали.
- [x] Общие web/Android-layout; Android 1.39/code49 без sync/build/package/version изменений.

## Проверки

- [x] 5 PremiumView component tests: RU/EN offer, limits/price/image/API explanation, disabled buy/no private load и существующий active catalog/error retry.
- [x] 12/12 browser scenarios RU/EN × desktop/mobile 320px/shared Android × free/premium. Crown color, compact centered button, decoded coffee image, correct limits/price, no overflow; existing active catalog creation/phrase deletion/home-card behavior. Screenshot review RU desktop и EN 320px. Local evidence: artifacts/premium-tab/*.png.
- [x] Полный scripts/check.ps1: 393 backend/scripts passed, 9 PostgreSQL testlab skips, 5 Node guards, 317 frontend tests, eslint, TypeScript и production build. Local evidence: artifacts/premium-offer/quality.log.

## Выпуск

- [x] [PR #157](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/157) merged; runtime `aaaa90b0879d3d4eb648380558632c763a102ab3`. Web deployment `dpl_9uTAkdAfHKJSQDeWKMyG2EXNDb45` Ready/production/main; [deployment](https://serbian-speaking-trainer-mt57hjpl5-suezerguts-projects.vercel.app), serbotalk.app alias и SHA подтверждены Vercel API. Чистый git archive + принятый CLI workflow, backend не перевыпускался.
- [x] HTTP landing/app/API health и packaged WebP → 200; anonymous topics → 401. Local evidence: artifacts/premium-offer/{deployment.json,production-http.json,deploy.log}.
- [x] 20/20 production browser scenarios на https://serbotalk.app/app: 12 Premium (RU/EN, free/active, desktop/mobile/shared Android) и 8 настроек (RU/EN desktop/mobile/320px/shared Android). Реальные опубликованные assets, synthetic API/auth без production writes/AI; проверены decoded WebP, цена/лимиты и контраст/геометрия кнопки. Local evidence: artifacts/premium-offer/production-browser.log, artifacts/premium-tab/*.png и artifacts/settings-cards/*.png.
- [ ] Отдельно запрошенный APK и физическая Android-приёмка.

## Иллюстрация

Встроенный ImageGen, transparent_background=true; исходный PNG RGBA 1536×1024 сохранён генератором в Codex generated_images. В приложение включён frontend/src/assets/premium/two-coffees.webp: 768×512, alpha сохранён, 67790 bytes. Оптимизация Pillow только resize/encode, без изменения композиции. Один локальный asset без сетевых запросов во время показа.

Итоговый промпт:

> Use case: product illustration. Asset type: small illustration under the one-time price on SerboTalk's dark navy Premium page. Primary request: exactly two elegant ivory ceramic cups of coffee on matching saucers, one espresso and one cappuccino with simple latte art, sitting side by side with gently curling steam. Style: polished warm editorial 3D still life, tasteful, friendly, realistic ceramic materials, subtle golden warm highlights; clear readable silhouettes at 240px wide. Composition: centered wide pair, three-quarter view, both cups and saucers fully visible, no extra objects. Genuine transparent background, no colored backdrop, no border. No text, no letters, no prices, no logos, no watermark.

Финальная синхронизация после merge документации: основная папка main=origin/main и 11 чистых detached worktree на том же SHA. Прежние ветки, включая codex/recovery-android-experiments-20261003, codex/recovery-before-139-20261024 и codex/recovery-primary-20261003, сохранены; новых recovery не потребовалось. Финальный снимок HEAD/status всех 12 копий: artifacts/premium-offer/worktrees-final.json (дублирован для settings evidence). Runtime остаётся aaaa90b; документальный follow-up не требует повторного deploy/APK.

Автотесты не обращаются к OpenAI. Создание иллюстрации выполнено отдельным встроенным ImageGen по запросу пользователя и не использует backend API budget приложения.
