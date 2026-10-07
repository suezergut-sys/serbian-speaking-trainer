# SerboTalk 1.23 — настройки и статистика

07.10.2026 владелец поручил публикацию web/backend и сборку нового APK, отдельно подтвердил 1.23 / versionCode 33. В релиз входит весь накопленный набор: общая настройка мягких подсказок, удаление нумерации фраз и категорийных баллов в разборе, календарь с датами и попытками, одинаковая ширина сегментов графика, отдельная страница фраз с выбором темы и Android Back.

- [x] Номер согласован; package/Gradle/имя APK обновлены; 17 metadata/environment tests прошли.
- [x] Функциональные проверки: полный backend/scripts pytest, frontend 156 tests, lint/typecheck/web build, Chrome статистика 3 и подсказки 4, Node Android guards 5. После мобильной разметки App/StatisticsView 93 tests прошли. AI/audio вызовы в этих проверках не использовались.
- [x] `pnpm android:cloud-apk`: Android mode → cap sync → assembleProdDebug, BUILD SUCCESSFUL. Package `com.serbiantalk.trainer`, versionName 1.23 / code 33, minSDK 24 / targetSDK 36; signature v2 verified, прежний сертификат. Production API и markers новых функций присутствуют; семь dist files совпали с APK, production assets guard прошёл.
- [x] [PR #67](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/67) merged: `bcbce3058583d5bc7a2af201623a426a764b6305`. Backend/frontend READY на этом SHA; aliases проверены. Production Alembic `f42b8c012d33`, assistance_enabled NOT NULL DEFAULT false; seed 0/0/0.
- [x] [GitHub v1.23](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.23): asset uploaded, серверный digest/size совпали с локальным APK и Downloads.
- [ ] Физическая приёмка Android ↔ web, OAuth/STT и настоящая речь. ADB/AVD не запускались.

Функциональные доказательства: [синхронизация](assistance-sync-checkpoint.md), [нумерация](phrase-numbering-checkpoint.md), [разбор](text-analysis-checkpoint.md), [статистика](statistics-redesign-checkpoint.md). Реализация, сборка, публикация и физическая приёмка учитываются отдельно; весь P0/P1/P2 не закрыт.

Артефакт `SerboTalk-andorid16-1.23.apk`: 4 428 890 bytes, SHA-256 `1a97833b7f47719b6b676ca23a8bed06914ca2985a05491dbe9345594756aadd`. Certificate SHA-256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с 1.22. Копии: `artifacts/SerboTalk-andorid16-1.23.apk` и `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.23.apk`; APK не коммитится.

Production 07.10.2026, 18:25–18:30 UTC: backend `dpl_Ekov53uVgDJmqJsGSdsVN2bwCVCR`, frontend `dpl_FjRYhTN2sSjpsss9MG4Wb1rF5T1d`, source CLI / target production / READY / release SHA. Aliases: https://serbian-speaking-trainer-api.vercel.app и https://serbian-speaking-trainer.vercel.app. `/api/health` ok; OpenAPI содержит GET/PATCH preferences и phrase-topics; неавторизованный preferences GET — 401. В существующей Chrome-сессии подтверждены готовая практика без нумерации, календарь/легенда, отдельная страница, темы Аренда и Кафе, статусы/попытки/следующие повторы и возврат. Переключатель подсказок успешно включён, восстановлен после reload и возвращён в исходное выключенное состояние. Реальная речь/AI не отправлялись. Фильтры runtime error logs обоих deployments пусты; console errors отсутствуют. [Снимок production](../artifacts/production-1.23-statistics.png).

Шесть публичных JS/CSS assets побайтно совпали с APK. GitHub tag указывает на runtime commit; последующий commit доказательств меняет только документацию. Предупреждения Vite chunk >500 kB и Gradle flatDir/SDK parser сохраняются, сборки успешны.
