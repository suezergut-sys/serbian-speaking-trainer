# SerboTalk 1.37 / code47 — общая модель распознавания

20.10.2026 владелец поручил назначить gpt-4o-transcribe всем пользователям, опубликовать web и собрать новый APK со всем бэклогом. **1.37 / versionCode 47** отдельно подтверждены в чате. Имя APK: `SerboTalk-andorid16-1.37.apk`.

Состав после 1.36: золотой первый успех дня; последующие 100%/Верно внутри медали; масштаб 110%, центрирование и прежний встроенный звук; персональный селектор STT для разрешённого admin и передача выбранного алфавита из клиента. Все функции и RU/EN уже находятся в общем исходном коде; production cap sync переносит весь набор. Серверный default действует и для старых APK.

- [x] Backend production env: OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe, OPENAI_TRANSCRIBE_LANGUAGE_PARAMETER=language. Язык sr и prompts v3 прежние; ключ/model IDs остаются в backend env. Существующий owner override сохранён и сейчас совпадает с default.
- [x] Backend READY: `dpl_7fd2Lh1kga3skT86ihgcjna8idFe`, [deployment](https://serbian-speaking-trainer-rlxlfykwm-suezerguts-projects.vercel.app), основной alias serbian-speaking-trainer-api.vercel.app подтверждён API. Runtime из чистого git archive 6f7e9ab, только env изменён; seed добавил 0 skills/topics/phrases. Авторизованный UI показывает «По умолчанию (gpt-4o-transcribe)», health 200.
- [x] Два API regression tests подтверждают общий env-default и language=sr для обычного пользователя с обоими алфавитами, даже при старом экспериментальном выборе. Тест языкового retry изолирован от локального env. Все AI ответы синтетические, реальные OpenAI транскрибации в тестах не вызываются.
- [x] Quality gate: 348 backend passed / 8 skipped, 258 frontend tests рабочего checkout, 5 Node guards, lint/typecheck/production build. 8 frontend tests владельца существовали до задачи и не входят в commit. После смены версии дополнительно 5 targeted metadata/settings tests passed. Предупреждение Vite о chunk >500KB прежнее.
- [x] `pnpm android:cloud-apk`: BUILD SUCCESSFUL, 109 tasks. Production Android bundle, затем cap sync, затем assembleProdDebug; обычный web bundle не переносился в APK.
- [x] APK 1.37/code47/min24/target36; production HTTPS API внутри JS, HTTPS WebView. Все 7 dist assets и 9 public assets совпали побайтно с sync и APK. Включены first_success_today/Successful start, selector API и alphabet; embedded WAV совпал с исходным. Landing/testlab/local API/backend secrets отсутствуют.
- [x] apksigner verify passed, прежний сертификат SHA256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0`. APK 4 547 328 bytes, SHA256 `9c72d37302623e0bf709278017f5efe2c9fecd92998121ef0a661f3a843d7165`; artifacts и Downloads совпадают.
- [x] 28/28 browser scenarios RU/EN × rewards/settings layouts passed, включая Android narrow/landscape и 320px. Награды/таймер/центр/звук/настройки и selector/reset проверены на mock API; screenshot en-android-narrow-start просмотрен. Новая версия отдельно покрыта metadata/settings tests.
- [ ] GitHub PR/merge, web 1.37 READY и production UI/HTTP/error logs.
- [ ] GitHub release/APK server digest/size/обратная загрузка.
- [ ] Физическая установка, Google OAuth, динамик/микрофон и сравнение реальной речи на телефоне.

APK: `C:/Users/MSumin/Downloads/SerboTalk-andorid16-1.37.apk`. AAB/Google Play Console не входят в поручение. Локальные evidence вне Git: `artifacts/android-1.37-build.log`, `android-1.37-badging.txt`, `android-1.37-signature.txt`, `android-1.37-verification.json`, `verify-android-1.37.py`, `android-stt-quality-gate.log`, `global-stt-backend-{deployment,alias}.json`.
