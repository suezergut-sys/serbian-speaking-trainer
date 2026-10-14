# 14.10.2026 — независимые английские подсказки

## Причина и исправление

Прежний English catalog содержал только привязки к Russian word_ru. При отображении английской фразы интерфейс искал русский ключ в сохранённых подсказках упражнения. В 136 из 160 фраз отсутствовала 261 подсказка, включая best/time/buy. Прежние тесты подтверждали существующие привязки, но не проверяли каждое слово исходной английской фразы. Владелец уточнил: наборы должны быть независимыми.

- [x] Frontend English dictionary: английское слово → свой контекстный сербский перевод; Russian word_ru удалён из всех записей английского каталога. Всего 1124 записи для 160 фраз после объединения possessives/hyphenated words. Все слова кроме a/an/the покрыты. Тексты фраз, ID и сербские каноны сохранены.
- [x] Independent backend English dictionary и service selector выдаёт английские ключи при X-Interface-Language=en. Russian hints остаются самостоятельными. Даже прежняя review/exercise запись без stored hints получает English hints из английского набора; новые AI-вызовы не нужны.
- [x] Для отображения и сохранения передаётся само английское слово, без русского alias. WordLearningItem содержит английские ключи; legacy API names word_ru/source_ru сохраняются для совместимости, а не обозначают обязательный русский язык.
- [x] При смене языка использованные слова каждого набора сохраняются отдельно. Попытка учитывает все действительно открытые ключи из обоих проверенных наборов; повтор того же слова не добавляет штраф. Фразовый progress общий. Score rule прежний: 8 п.п. за уникальный ключ, максимум 30 п.п.
- [x] Старые APK 1.32 и прежние English clients могут продолжать отправлять Russian keys: узкий compatibility fallback использует их сохранённые Russian hints. Новый English dictionary от этого не зависит. Доступ к упражнению остаётся owner-scoped; неизвестный ключ не создаёт подсказку.
- [x] Дополнительно выверены 78 прежних переводов субъектных местоимений: I→ja, we→mi, you→vi; если местоимение опущено в сербском каноне, note ru/en объясняет это. Thank you сохраняет контекстное vam.
- [x] Грамматические слова имеют подсказки. Если в каноне нет отдельного сербского слова, используется стандартный эквивалент или поясняется целая конструкция; заметки есть в ru/en. Например time → vreme с пояснением, что канон оставляет слово неявным; вопросительное does без отдельного эквивалента обозначено — с пояснением, без выдуманного перевода.
- [x] bank's/tomorrow's/two-room и русские слова с дефисом не разбиваются на ошибочные отдельные ключи. Проверены контекстные значения; исправлены bank→banke, strength→jaka strana, year→godinu dana, long→Koliko, take→traje, next→Sledeće и другие ошибочные alignments.

## Проверки

- Full backend/scripts: 298 passed / 8 skipped; после последней проверки possessive добавлен дополнительный API testcase, targeted English/interface suite 21 passed.
- Full frontend: 205 passed; после добавления дополнительного lexical/compound regression targeted i18n suite 5 passed. App/data checks 102 passed; lint/TypeScript/production build успешны.
- Playwright english-word-hints.spec.mjs: 6 passed — ru/en × desktop/mobile web/Capacitor Android-layout. Два примера владельца, все видимые English words кроме the, переводы is/best/time/buy/have, использование English keys при POST, отсутствие русских aliases и самостоятельные RU hints.
- API tests проверяют выдачу English response keys без изменения stored Russian dictionary, старую запись без hints, реальное сохранение English learning items, повтор/штраф/unknown word, смену языка с двумя независимыми ключами, старый APK и possessive как один ключ. OpenAI не вызывается.
- Corpus coverage использует тот же frontend tokenizer, что отображение; backend parity test сверяет весь English dataset, а не только число слов.
- Screenshots локально: `artifacts/english-hints/{ru,en}-{desktop,mobile,android}.png`. Реальное пользовательское аудио отсутствует.

## Публикация и Android

- [ ] Web/backend PR/production deployment и фактическая проверка.
- [x] Android versionName/versionCode/package/APK не менялись; общий layout проверен, изменение внесено в backlog.
- [ ] Перенос в следующий APK только по отдельной команде владельца.
- [ ] Физическая приёмка нового APK.
