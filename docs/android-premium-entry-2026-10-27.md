# Android Premium и переход на сайт — 27.10.2026

База: `a4b46055989ff6621d7296ead850e681360ee32e`.

- [x] Free Android повторяет web offer: корона, три преимущества, 5 евро, кофе и объяснение API. Кнопка RU/EN «КУПИТЬ НА САЙТЕ» / “BUY ON WEBSITE”, loading/disabled/error/retry; PaymentForm не монтируется, платёжные API не вызываются. Premium/admin сохраняют каталог.
- [x] Browser.open: `https://serbotalk.app/app?from=android&next=premium`. После входа или при существующей сессии открывается Premium. Обычный вход и reload после успешного перехода — прежняя стартовая страница. Intent ограничен вкладкой/30 минутами, одноразовый, без произвольных redirect URL; Google callback сохраняет intent через sessionStorage. При заблокированном storage сохранение через внешний Google-вход ограничено.
- [x] Component/unit: 136 tests (App, AndroidPremiumPayment, PremiumView, premiumEntry); Google callback, expiry, ordinary entry, StrictMode, existing/new session, RU/EN error/retry.
- [x] Playwright: 12 premium-tab scenarios (RU/EN × desktop/mobile/shared Android × free/premium); 4 android-premium-entry (RU/EN × ordinary/Android link, вход по паролю и существующая сессия); 4 прежних landing-auth scenarios. Все API/Auth mocked, OpenAI не вызывается.
- [x] Typecheck + production web build + eslint; у Vite остаётся предупреждение о chunk >500 kB.
- [x] RU Android screenshot просмотрен: `artifacts/android-premium-entry/ru-android.png`; RU/EN browser assertions проверяют загрузку coffee, золотую корону и отсутствие overflow. Скриншоты ignored, не входят в Git.
- [ ] Commit/push/PR и CI — ожидают публикации.
- [ ] Merge и production web — отдельно, без разрешения не выполнялись.
- [ ] Android sync/build, версия и физическая приёмка — отдельно. Текущий APK 1.41/code51 прежний; исходники Android/package version не менялись.

До изменений все 12 копий чистые на базе main; recovery/WIP не требовались. После публикации PR основная папка возвращается на неизменённый актуальный main, финальная сверка всех копий повторяется.
