# Экран упражнения — 15.10.2026

- [x] Единая desktop/mobile/Capacitor разметка, стабильные тема и original до/после распознавания и проверки, без ссылки смены темы и voice-prompt.
- [x] Общая левая граница текста original/textarea/answer/correction; процент и вердикт отдельными строками по центру.
- [x] Controls отдельной нижней строкой постоянной высоты, одинаковый размер микрофона/recording/retry/check, без hover scale. На низком viewport применяется общее уменьшение всех кнопок.
- [x] Word hints: outside pointer/focus, Escape и toggle, cleanup listeners. Использованные подсказки и payload штрафа не сбрасываются.
- [x] Круглые SVG дуги иконки повторения; общая палитра календаря/легенды из предыдущей локальной задачи включена в этот релиз.
- [x] Удалённые UI-тексты одновременно удалены из мест использования и ru/en каталога. Новых текстов нет; существующие labels/voice statuses локализованы.
- [x] Android metadata и package version прежние; sync/build/APK не выполнялись. Отдельный локальный лендинг исключён из изменения и публикации.

## Проверки

- Targeted components: App + WordHintToken + AnswerResult — 108 passed; после этого дополнительные изменения касались browser tests и удаления неиспользуемых ключей.
- Full frontend: 210 passed / 20 files (`pnpm exec vitest run --maxWorkers=1`); lint, TypeScript и production build passed.
- Backend/scripts: 299 passed / 8 skipped; Node guards: 5 passed. Внешние AI вызовы замоканы.
- Browser: 10 ru/en × desktop/mobile/320px/480px-height/Capacitor-layout scenarios. Сравниваются координаты theme/original до записи, после распознавания и проверки, y всех voice controls, общая x-граница трёх текстов, центр score/verdict и порядок строк. Проверены закрытие hints, повторная запись, завершение очереди, переход домой, круглая геометрия SVG и overflow.
- Дополнительно 6 legacy browser checks passed: word hints у краёв 320/390px web/Capacitor и dark error recovery/transcript controls web/Capacitor.
- Сохранённые regression scenarios: 6 calendar-legend, 9 localization-fixes и 2 result-navigation passed. Старый result-navigation mock дополнен существующим preferences endpoint; selector старой meta-строки обновлён в component/legacy browser tests.
- Первый широкий browser run имел один timeout загрузки страницы в legacy localization case; последующий запуск всех 9 localization cases прошёл. После устранения hover scale геометрия controls совпадает с точностью менее 1px.
- Browser scenarios используют mock API, синтетическую запись в памяти и фиктивный аккаунт; OpenAI, пользовательское аудио и реальные изменения учебных данных не используются.
- Screenshots (ignored): `artifacts/practice-layout/*`.

## Публикация

- [ ] PR/merge, production Ready/SHA/main/alias и production smoke.
- [ ] Ручная приёмка владельцем.
- [ ] Будущий APK и физическая приёмка по отдельной команде.
