# SerboTalk 1.38 / code48 — квадратные награды

21.10.2026 владелец поручил сделать внешние рамки всех наград квадратными, увеличить текущий размер на 15%, опубликовать web и собрать новый Android. Номер **1.38 / versionCode 48** отдельно подтверждён в чате. Имя: `SerboTalk-andorid16-1.38.apk`.

- [x] Общие стили web/Android: квадратные внешние рамки, центрирование содержимого, ещё +15% к прежнему размеру. Предпочтительная сторона 215.05px для первого успеха/100% и 366.85px для 20 повторений; доступная ширина/высота ограничивает размер с отступом 12px. Медали, SVG и надписи адаптируются. Первый успех/100% центрированы в упражнении, 20 — на экране.
- [x] Сценарии активации, независимые настройки звука/анимации, двухсекундный таймер и встроенный WAV не менялись. Новых текстов нет; общий каталог RU/EN прежний. Весь общий клиент после 1.37 включён в исходники; новых backend runtime/env/миграций нет.
- [x] Quality gate: 348 backend/scripts passed / 8 skipped, 258 frontend tests (включая 8 существовавших пользовательских тестов, не включённых в commit), 5 Node guards, ESLint, TypeScript и production build. Существующее предупреждение о chunk >500kB сохраняется. AI в автоматических тестах замокан.
- [x] 20/20 passed: полная browser matrix RU/EN × 10 размеров/макетов: квадратность, рост размера, центр, границы контейнера, отсутствие переполнения, таймер/звук/настройки. Скриншоты desktop и narrow просмотрены.
- [x] pnpm android:cloud-apk: BUILD SUCCESSFUL (109 tasks). APK 1.38/code48/min24/target36, production HTTPS API и HTTPS WebView; 7 dist и 9 public assets совпали побайтно с sync/APK. Квадратные CSS и новый размер есть в packaged bundle, WAV совпал; landing/testlab/local API/backend secrets отсутствуют. apksigner verify passed, сертификат прежний. Размер 4547412 bytes, SHA256 `62cdd34f8211df06d7c2185f3b8853985cd045291f91909976f8b219638e7c8d`. Копии artifacts и Downloads совпали.
- [ ] GitHub PR/merge, production web READY/SHA/alias и проверка реального URL.
- [ ] GitHub APK release: tag/target/digest/size и обратная загрузка.
- [ ] Физическая установка, Google OAuth, микрофон/динамик и реальные награды на телефоне. Browser Android-layout не заменяет физическую приёмку. Google Play/AAB не входят в поручение.

Локальные evidence вне Git: `artifacts/square-rewards-quality.log`, `artifacts/square-success-rewards/`.

APK: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.38.apk`. Evidence: `artifacts/android-1.38-{build.log,badging.txt,signature.txt,verification.json}`, `artifacts/verify-android-1.38.py`.
