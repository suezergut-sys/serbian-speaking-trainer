# SerboTalk 1.23 — настройки и статистика

07.10.2026 владелец поручил публикацию web/backend и сборку нового APK, отдельно подтвердил 1.23 / versionCode 33. В релиз входит весь накопленный набор: общая настройка мягких подсказок, удаление нумерации фраз и категорийных баллов в разборе, календарь с датами и попытками, одинаковая ширина сегментов графика, отдельная страница фраз с выбором темы и Android Back.

- [x] Номер согласован; package/Gradle/имя APK обновлены; 17 metadata/environment tests прошли.
- [x] Функциональные проверки: полный backend/scripts pytest, frontend 156 tests, lint/typecheck/web build, Chrome статистика 3 и подсказки 4, Node Android guards 5. После мобильной разметки App/StatisticsView 93 tests прошли. AI/audio вызовы в этих проверках не использовались.
- [ ] Production Android build, packaged API/assets/metadata/подпись.
- [ ] PR/merge и публикация backend/web, production-миграция `f42b8c012d33`, проверка aliases и авторизованного интерфейса.
- [ ] GitHub APK и копия Downloads, серверный digest/size.
- [ ] Физическая приёмка Android ↔ web, OAuth/STT и настоящая речь. ADB/AVD не запускались.

Функциональные доказательства: [синхронизация](assistance-sync-checkpoint.md), [нумерация](phrase-numbering-checkpoint.md), [разбор](text-analysis-checkpoint.md), [статистика](statistics-redesign-checkpoint.md). Реализация, сборка, публикация и физическая приёмка учитываются отдельно; весь P0/P1/P2 не закрыт.
