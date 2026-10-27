# SerboTalk 1.41 / code51 — 27.10.2026

Владелец поручил исправить рублёвую сумму на 500 ₽, убрать покупку внутри Android
для пользователей без Premium, оставить сообщение и кнопку сайта, затем собрать
новый APK. Номер **1.41 / versionCode 51** отдельно подтверждён владельцем.
Имя APK: `SerboTalk-andorid16-1.41.apk`.

## Состав

- [x] Android free: только «Оплатить премиум вы можете на сайте» и кнопка
  `https://serbotalk.app/`, открывающая Capacitor Browser. RU/EN, тёмная тема,
  loading/disabled/error/retry; нет BUY, цены, кофе, списка преимуществ или
  платёжной формы. Active Premium/admin сохраняют свои темы и фразы.
- [x] При возвращении Android в foreground запрашивается актуальный аккаунт:
  оплата на сайте может открыть Premium без перезапуска. Timeout/abort/epoch
  защищают от зависшего или устаревшего ответа, запись не продолжается сама.
- [x] Google Play Billing SDK, Billing permission и платёжной интеграции в
  исходном Android-проекте нет; ничего связанного с оплатой через Play не
  добавляется. Google Play/AAB/закрытый трек не входят в этот выпуск.
- [x] Включён весь клиентский main после 1.40, включая короткие смысловые
  подсказки RU/EN, оба алфавита и один штраф на конструкцию из PR #169.
  Накопленная ручная оплата внутри Android отменена новым решением владельца:
  форма и реквизиты доступны только на web.

## Цена RUB

- [x] Backend Settings поддерживает вложенные env overrides; production
  `MANUAL_PAYMENTS__METHODS__SBP__AMOUNT=500.00` добавлен и прочитан обратно.
  Закрытый `MANUAL_PAYMENTS` с реквизитами не раскрывался и не заменялся.
  Изменяется только сумма СБП; PayPal/ALTA и прочие поля сохраняются.
- [x] Unit test проверяет именно переход JSON 5000.00 → nested env 500.00,
  равенство остальных реквизитов/методов и Decimal-валидацию. Документация:
  [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/#parsing-environment-variable-values).
- [x] Найдены одна awaiting_payment и одна cancelled СБП-заявки по 5000.00 RUB;
  частный snapshot неоплаченной сохранён в ignored
  `artifacts/android-premium-release/unpaid-before-tool.json`.
- [ ] После backend deployment исправить только ещё не оплаченную заявку с
  точными ID/статусом/старой суммой и null paid_at/reported_amount. Отменённую
  и историю оплат не менять; подтвердить повторным чтением и нулевым reapply.
- [ ] Проверить новые backend/web deployments и фактическую production-сумму.

## Проверки и выпуск

- [x] До финального resume-изменения: 470 backend/scripts passed, 9 PostgreSQL
  checks skipped; 348 frontend tests, ESLint/typecheck/production web build.
  Все AI-вызовы mocked. 5 Node Android resilience guards passed.
- [x] 28 browser scenarios: 12 Premium RU/EN desktop/mobile/shared Android,
  4 web payment, 12 контекстных подсказок/алфавитов. Android free не загружает
  платёжные API; website button передаёт правильный URL браузеру; paid CRUD
  сохранён. Тёмный RU Android-layout просмотрен.
- [x] Финальные 120 App/Android/component tests passed, включая получение
  Premium после resume; scoped lint passed. `pnpm android:cloud-apk` завершился
  BUILD SUCCESSFUL, 128 tasks; выполнены build:android и Capacitor sync.
- [x] APK: 1.41/code51/min24/target36; production HTTPS API, 11 dist files
  побайтно совпадают с assets в APK, BrowserPlugin/SharePlugin присутствуют.
  Нет landing/testlab/local transport и строки Google Play в JS; Billing
  permission отсутствует. Signature verify passed, сертификат SHA256 совпадает
  с прежним: `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`.
- [x] Размер APK 4 969 183 bytes, SHA256
  `c42d40602392cbe63d6903af363744d2f78227ab260d36167e88938636d7b822`.
  Копия `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.41.apk` проверена.
  Evidence: ignored `artifacts/android-premium-release/apk-*.{json,txt}`,
  `android-build-final.log`; секретов и аудио в APK/fixtures нет.
- [ ] Commit/push/PR, web/backend production и GitHub APK release.
- [ ] Синхронизация основной папки main и всех неактивных worktree, финальная
  проверка чистоты после коммита доказательств. Исходный main `1f7d494`.
- [ ] Физическая установка, браузер, реальная оплата и возврат/микрофон на
  телефоне; browser shared Android-layout не заменяет физическую приёмку.

Deployment/APK source SHA и последующий documentation-only main фиксируются
отдельно; повторные build/deploy ради доказательств не нужны. Секреты, APK,
логи и частные платёжные данные не входят в Git.
