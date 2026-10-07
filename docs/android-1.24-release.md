# SerboTalk 1.24 — пояснения ошибок

07.10.2026 владелец поручил публикацию web/backend и новый APK, отдельно подтвердил 1.24 / versionCode 34. Состав: удалены сообщения об отсутствии мягких подсказок и ручной правке; новые разборы требуют причины каждой ошибки и объясняют смысл/контекст/правило. Добавлены проверки сохранения настройки при перезапуске и смене клиента. Алфавит пока локальный; старые разборы автоматически не переписываются.

- [x] Функциональный gate: полный backend/scripts pytest (8 штатных skips), frontend 158 tests, App/Assistance 89, adapter/analyzer 33, attempts API 7, lint/typecheck/web build. Node Android guards 5 passed; AI-вызовы в тестах mock.
- [x] Версия 1.24/code34 отдельно согласована; metadata обновлена.
- [ ] Production Android build и metadata/API/assets/подпись.
- [ ] PR/merge и Vercel READY frontend/backend, production smoke.
- [ ] GitHub APK, размер/digest и копия Downloads.
- [ ] Физическая OAuth/STT-приёмка и оценка качества реальных AI-объяснений; ADB/AVD не запускались.

[Функциональные доказательства](explained-feedback-checkpoint.md), [сохранение настройки](preference-persistence-checkpoint.md). Миграций БД в этом релизе нет; общий профиль 1.23 продолжает использоваться. Публикация, сборка и физическая приёмка учитываются отдельно; весь P0/P1/P2 не закрыт.
