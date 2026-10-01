# P1.5 — микрофон и возвращение к практике, 01.10.2026

Основной план: [audit-roadmap.md](audit-roadmap.md). Этот срез ограничен освобождением микрофона, отменой ненужного STT и сохранением учебного состояния при уходе из практики или сворачивании. Системный Back, отзыв разрешений, размер записи и приёмка физического телефона остаются отдельными задачами.

## Подтверждённые проблемы

- Переход в статистику/настройки web или свайп Android-панели скрывает управление микрофоном, не останавливая активную запись.
- Сворачивание не отменяет текущую запись/расшифровку; поздний STT может заменить текст при возврате.
- При использовании VoiceRecorder отдельно от App таймаут получения микрофона не закрывает поток, который разрешился позднее. App ранее вызывал stop в своём catch; класс должен корректно освобождать собственные ресурсы при ошибке.

## Границы проверки

Синтетические browser/component тесты проверяют visibilitychange и native appStateChange через mock установленного Capacitor-контракта, освобождение tracks, отмену запроса, сохранение draft и игнорирование позднего transcript. Это не физический микрофон или реальное Android background/resume; новый APK отдельно согласуется и собирается после переноса всего backlog.

Оценка ответа при уходе со страницы практики продолжает выполняться по прежним правилам; остановка голосового ввода не должна отменять сохранение попытки или очищать текущую фразу. Пользовательское аудио не сохраняется и автоматически не отправляется повторно после возврата.

## Проверки и выпуск

- [x] Реализовано: остановка mic/STT при hidden/native inactive, переходе web-панели, уходе с Android practice через header/scroll. Draft/exercise сохраняются; после возврата доступна новая запись или ручной ответ, показано сообщение о прерывании.
- [x] Frontend 77/77, TypeScript, ESLint и production build прошли. Lifecycle browser 2/2, обычные mock practice + network 9/9 и local web 3/3 прошли. Существующее предупреждение chunk >500 КБ сохранено.
- [x] GPT-6.1 Sol / medium принял финальные App/VoiceRecorder, component и browser tests без подтверждённых замечаний.
- [x] 01.10.2026, 07:46 МСК: [PR #39](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/39) объединён, runtime SHA `428109f2850ef65a2827dcebfd05e5256275049f`; web READY, aliases и публичный production smoke проверены.
- [ ] Перенести в согласованный Android-релиз и проверить реальные события устройства.
- [ ] Пройти авторизованный голосовой сценарий и ручную приёмку.

## Доказательства и ограничения

- Component tests: web hidden и переход в настройки с сохранением draft; ожидание getUserMedia; поздний STT; native appStateChange, свайп pager и позднее разрешение регистрации listener после unmount; завершение уже отправленной оценки в фоне с единственным POST.
- VoiceRecorder: таймаут выбора микрофона помечает запись stopped и закрывает поздний stream; timeout ожидания stop (30 секунд) и throw освобождают tracks/chunks, listeners finish удаляются. Автоматического retry аудио нет. Размер буфера/длительность записи в этом срезе не меняются.
- Browser tests считают stop recorder/track и проверяют draft/повтор записи; mock visibility getter восстанавливается перед teardown. Первоначальное предупреждение proxy `/api/topics` оказалось запросом при teardown из-за always-visible getter; после его восстановления 2/2 прошли без этого предупреждения.
- Первый общий mock-запуск по короткому имени `network.spec.mjs` также выбрал `local-network.spec.mjs`; loopback guard штатно отказал без testlab env. После выбора точных путей `e2e/mocked.spec.mjs e2e/network.spec.mjs` прошли 9/9. Локальный replay затем прошёл отдельно через `-Suite all`. Ошибка выбора тестов не была runtime дефектом.
- PLAYWRIGHT_NO_COPY_PROMPT запрещает автоматическую ARIA snapshot; error-context может содержать stack/source guard ошибки, но snapshot страницы не собирается. Трассы, видео, снимки, аудио и credentials не сохраняются.
- Контракт Capacitor App проверен в установленных `@capacitor/app` definitions; native-event tests используют mock, а не новый APK. Android 1.15/code 25 и native assets не менялись.

## Публикация

Web: [production](https://serbian-speaking-trainer.vercel.app), deployment `dpl_8Hx5ECZgzGrtU8DPdr2BHnKjodSH`, [deployment URL](https://serbian-speaking-trainer-r28j114k4-suezerguts-projects.vercel.app). Backend остаётся на SHA `edb0b74dc1ab4daf8711c9cd4d77c535f14ad875`, новых миграций нет.

Chrome 154: `/`, `/privacy`, `/terms` — 200; Google-вход виден, lifecycle/recovery markers в текущем bundle, testlab markers отсутствуют, `/testlab.html` — 404, page errors — 0. GitHub checks не настроены; локальные gates и независимое ревью приняты до merge.

Проверка публичная: авторизованный production/STT пока не подтверждён из-за известного request-header policy сбоя личного Chrome-плагина. Личная сессия не копировалась. При ручной приёмке: начать запись, уйти в настройки или свернуть, вернуться, проверить выключенный mic и сохранённый draft; повторить во время STT и во время оценки; оценка должна завершиться без повторной отправки. Для Android эти действия проверяются на следующем отдельно согласованном APK.
