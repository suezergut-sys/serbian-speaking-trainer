# Google Play Alpha — обновление 1.33 / code43

15.10.2026 владелец поручил собрать подписанный AAB 1.33, обновить существующий Alpha и сохранить непрерывность закрытого теста. Исходник — опубликованный релиз 1.33: runtime d132af331fec60ede8a27f6b64ffd58a212fbbf9, evidence c51c4e6fcf27520b428f551a8b9a0c9fdcc679f0. Сборка выполнена в чистой рабочей папке practice-layout; незавершённые изменения лендинга в основной папке сохранены и не включены.

- [x] Штатный scripts/build-android-play-aab.ps1: production Android build/sync, bundleProdRelease BUILD SUCCESSFUL in 27s / 190 tasks, jarsigner sign/verify. Версия 1.33/code43 без повышения номера.
- [x] Bundletool validate/dump: com.serbiantalk.trainer, min24/target36, 1.33/code43. Все 9 public assets совпали побайтно с опубликованным APK 1.33. Production API присутствует, HTTPS WebView, без landing/testlab.
- [x] Upload certificate SHA256 aa7aa2702faafb0270d967d3f4d9a318f24ce26148084acfae304f55e378cf62 совпал с AAB 1.30; приватный ключ/DPAPI вне Git, не передавались в Console.
- [x] До обновления: Alpha активен, последний выпуск 1.30/code40; 178 стран/регионов, группа testers-community@googlegroups.com, прежний opt-in URL. Dashboard: 12 участников на протяжении 2 дней.
- [x] AAB загружен в существующий Alpha, название 1.33 (43), release notes ru-RU/en-US заполнены.
- [x] Выпуск сохранён для 100% Alpha. Потерянных поддерживаемых устройств нет, блокирующих ошибок нет. Единственное предупреждение — отсутствие файла deobfuscation при minifyEnabled=false.
- [x] Common-issues precheck завершён успешно: Console показывает «Теперь вы можете передать изменения на проверку».
- [ ] Отправка в Google: технический блок. После подтверждения диалог закрывается, но Console оставляет «Ещё не отправленные» без ошибки, в том числе после успешного precheck, перезагрузки страницы и в свежей вкладке. Проверены семантическая кнопка, прямой UI click и Enter; консоль браузера не показала ошибок. История проверок содержит только запросы 1 и 2 от 13.10, новой записи нет. Окончательная отправка не засчитана; владельцу оставлен открытый финальный диалог для ручного подтверждения.
- [ ] Решение Google и доступность 1.33 участникам.
- [x] После загрузки/сохранения dashboard повторно показывает 12 участников / 2 дня. Testers Community Active / In Progress: день 2/16, 15/15 назначенных участников, 0/2 отчёта. Данные сервиса не подменяют счётчик Google.
- [ ] После подтверждённой отправки повторно проверить непрерывность теста и прежнюю группу.

Файл: C:/Users/MSumin/Downloads/SerboTalk-android-1.33.aab, 3 323 147 bytes, SHA256 e423cce4a1af0e78c9028d183057ed13428216f0826640a88813901d6f08b66a. Локальные evidence: C:/Users/MSumin/.codex/worktrees/practice-layout/Serbian Speaking Trainer/artifacts/android-1.33-aab-build.log, android-1.33-aab-validation.txt, android-1.33-aab-manifest.xml, android-1.33-aab-verification.json.

Функциональный код не менялся. Полный gate 1.33 уже выполнен при APK-релизе: 210 frontend tests / 20 files, lint/typecheck/build, 9 ru/en Android-layout сценариев. Сегодня проверяется упаковка того же кода в AAB, подпись и публикация в Alpha. Физическая установка обновления из Google Play и реальный AI-разбор остаются отдельной приёмкой.

Последний экран: `C:/Users/MSumin/.codex/visualizations/2026/10/12/01a13120-fb81-7061-bbbb-411c4c96b910/alpha-1.33-submit-handoff.jpg`. Релиз один раз временно отложен через Save changes и сразу возвращён через Unsave в список отправки при диагностике; несохранённых/отложенных изменений не осталось, только один Alpha 1.33, готовый к отправке. Старый опубликованный выпуск и настройки тестировщиков не удалялись и не приостанавливались.
