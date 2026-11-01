# Открытое тестирование 1.44 — подготовка 01.11.2026

Владелец сообщил о получении production access и предложил начать с открытого тестирования. Dashboard подтвердил одобрение заявки; production неактивен. До изменений Console: активная Alpha1.43/code53, последняя загруженная AAB1.44/code54 в Alpha draft release5. Production не создавался и не отправлялся.

## Проверка подходящей сборки

- [x] Использован существующий AAB54 из библиотеки, без повторной загрузки/сборки/Capacitor sync/изменения версии. Hash Downloads `9be18a1375e946e8e006f29fbc6efbf584e2e41d73b0302a1a57e98d30776d23` совпадает с ранее загруженным. Исходники APK/AAB `9cb113d`, сервер после последних web-изменений `dd0bdc1`; клиент диагностики после1.44 остаётся в Android backlog.
- [x] В packaged JS есть claim `/auth/me/android-premium` и Android Premium recovery. Исходники и ранее принятая владельцем1.44 содержат автоматическое бессрочное предоставление Premium новым/существующим web-аккаунтам при Android-входе, Premium UI без покупки/реквизитов. При неудачной активации — восстановление доступа, без предложения оплаты. Лимиты прежние100 тренировок/5тем×30фраз.
- [x] Повторные11 backend Android Premium/migration tests и6 frontend Android claim/payment tests прошли (RU/EN, mocks, без настоящей оплаты/AI). Это не установка из Play и не новая аппаратная приёмка; прежняя приёмка APK владельцем31.10 отдельно сохранена.

## Выполнено в Console

- [x] Создан и сохранён Open Testing track `4698673175551070067`, release1, название `1.44 (54) — открытое тестирование`, включён только AAB54/1.44/API24+/target36.
- [x] RU notes: «Вход через Google. Premium в Android активируется автоматически. Улучшена работа русских и английских заданий, личных фраз и подсказок.»
- [x] EN notes: «Sign in with Google. Premium activates automatically on Android. Improved Russian and English exercises, personal phrases and hints.»
- [x] Выбраны все178 стран/регионов (как в существующей Alpha), независимый таргетинг от production; тестировщики без ограничения. Feedback URL/email пока не заполнен (необязательное поле).
- [x] Снята исходная приостановка Open Testing: изменение «Продолжить тестирование» сохранено в очереди публикации. Локальный статус канала Active не означает доступность ещё не проверенного релиза.
- [x] Ошибка отсутствия стран устранена. Единственное предупреждение release review — отсутствие deobfuscation mapping; R8/minifyEnabled false, оно не блокирует сохранение.
- [x] В Publishing Overview пять ожидающих отправки изменений: выпуск54,177 стран,остальные страны,отмена синхронизации,продолжение теста. Managed publishing off. Предварительные автоматические проверки стартовали; на момент снимка Console сообщает до14мин, успешное завершение не заявляется.
- [ ] Заменить устаревший App access: нынешняя инструкция предписывает отключённый Review access и запрещает Google sign-in. Данные не изменялись, пароль/логин не экспортировались в документы/Git. Требуется рабочий Google-аккаунт для проверки, выбранный владельцем, и актуальная English instruction.
- [ ] После актуализации доступа проверить итог предварительных проверок и состав очереди, отправить Open Testing на review. Сейчас НЕ отправлено. Alpha1.43 и production не менялись.
- [ ] Дождаться решения Google; затем проверка установки/нового и web-аккаунта/Premium и отсутствие оплаты из Play. Opt-in URL из Console: https://play.google.com/apps/testing/com.serbiantalk.trainer (доступность после публикации не проверялась).

## Почему требуется аккаунт

Console говорит, что проверяющие не могут создавать/использовать собственные аккаунты; опубликованные требования Google явно распространяются на Sign in with Google: https://support.google.com/googleplay/android-developer/answer/15748846 . Нужны повторно используемые данные и доступ без зависимости от местоположения/одноразового подтверждения владельцем. «Тестовый» — назначение обычного аккаунта; допустим существующий выделенный аккаунт. Личный основной/аккаунт владельца Console для этого не рекомендуется. Пароль вводится владельцем прямо в Console, не в чат. Никаких настроек безопасности Google-аккаунта агент не менял.

Предложенный текст Other instructions (вставляется после предоставления рабочих учётных данных):

> Android 1.44: tap Sign in with Google and use the dedicated Google account supplied above. Premium activates automatically after sign-in; no purchase is required. Open Practice to choose a topic and answer an exercise; allow microphone access for speaking. Open Premium to create personal topics and phrases. Internet is required. The old Review access username/password form is no longer available.

Владелец уточнил возможность использовать существующий Google-аккаунт; выбор/заполнение ещё не выполнены. Отправка ожидает этих данных. UI открыт на App content > Sign-in details, без модального окна с секретами.

Доказательство вне Git: `artifacts/open-testing-2026-11-01/pending-publication.png`; тестовые логи `artifacts/open-testing-premium-*`. Изменения только в документации; build/deploy не повторяются. На старте12 копий чистые наa77ae42, recovery не требовался. После evidence PR повторяется финальная синхронизация всех копий с origin/main; итоговый SHA сообщается отдельно.


## Следующее решение владельца — парольный вход

Вместо предоставления Google-аккаунта владелец поручил вернуть прежний парольный доступ закрытого тестирования, собрать и загрузить новую версию; отдельно согласовал1.45/code55. Новый Google-аккаунт больше не требуется. Подготовленный Open Testing54 будет заменён55; текущие статусы перенесены в [Android1.45](android-1.45-release.md).


## 1.45 отправлена на проверку

Восстановлен прежний парольный вход; настоящие credentials прошли проверку на production deployment. AAB55/1.45 принят и сохранён в следующем Open Testing release2,54 исключён. Страны178/unlimited/100% rollout сохранены. Обновлён только текст App access (Premium100/день), логин/пароль/права прежние. Console подтвердил «Изменения на проверке»; pre-review ещё выполняется, далее решение Google. Alpha53/production не менялись. [Доказательства](android-1.45-release.md).
