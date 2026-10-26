# SerboTalk 1.40 / code50 — общий выпуск 26.10.2026

Владелец поручил опубликовать доработки и собрать новый APK; отдельно подтвердил версию **1.40 / versionCode 50**. Имя файла: `SerboTalk-andorid16-1.40.apk`.

## Состав

- [x] Системная проверка ошибок у личных фраз и вне целей обычных упражнений из PR #159: замечания без учебного навыка сохраняются и подсвечиваются, неизвестные ключи не расширяют каталог.
- [x] Личные темы Premium/admin после основных, тонкий разделитель, два столбца и сортировка по отображаемому названию RU/EN.
- [x] Компактные карточки действий, тем и фраз в активном Premium; фильтрация, формы и подтверждение удаления сохранены.
- [x] Весь накопленный main после 1.39: двуязычные названия личных тем, карточки настроек, предложение Premium с кофе. Email OTP, ShareApp, личный каталог и награды из 1.39 сохранены.
- [x] 411 backend/scripts, 329 frontend, 5 Node guards, ESLint/typecheck/production web build; 44 browser scenarios по Premium/grouping/settings/result RU/EN desktop/mobile/shared Android-layout прошли суммарно (38 прежних + 6 новых с финальным повтором 18 Premium/grouping). После смены номера 7 metadata/grouping tests passed. AI mocked, 9 PostgreSQL checks skipped.

## Отдельные статусы

- [ ] GitHub PR/merge и SHA исходников.
- [ ] Production backend/frontend Ready, aliases/SHA, HTTP, runtime и browser-проверки.
- [x] `pnpm android:cloud-apk`: BUILD SUCCESSFUL, 128 tasks. Metadata: 1.40/code50/min24/target36. 9 dist и 11 public assets побайтно совпали с APK; production HTTPS API, OTP, SharePlugin, новые grids и разделитель включены, testlab/local secrets/landing отсутствуют. apksigner verify passed; SHA256 сертификата `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпал с прежним. Размер 4 635 958 bytes; APK SHA256 `d2bbcd65c6b7501894a2e6b504fb898313c0076bf72b83a51afa4fc86b838ad7`. Downloads копия проверена.
- [ ] APK в Downloads и GitHub release: tag/target/digest/size и обратная загрузка.
- [ ] Финальная синхронизация всех 12 рабочих копий с origin/main, чистый Git status; recovery-ветки и исключения.
- [ ] Физическая установка/микрофон/OAuth/share/реальная речь и новые темы RU/EN на телефоне. Browser Android-layout не заменяет проверку устройства. Google Play/AAB не входят в этот запрос.

Локальные логи и screenshots находятся в игнорируемом `artifacts/`: `premium-cards-quality.log`, `premium-cards-frontend-final.log`, `premium-cards-browser-release.log`, `premium-topic-cards/`, `android-1.40-*`. SHA deploy/APK и последующих documentation-only commits будут различаться; пересборка ради обновления доказательств не выполняется.
