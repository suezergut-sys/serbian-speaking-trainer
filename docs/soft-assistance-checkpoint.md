# Мягкие подсказки и кнопки — 03.10.2026

Реализация от main `60f9fb27a0959c17a65ab2d57b6f5fcdee614bdc` в изолированной рабочей копии. Старый checkout с пользовательскими изменениями сохранён.

- [x] Переключатель в настройках: default off, аккаунт/устройство, следующий голосовой ввод; оба алфавита.
- [x] Локальная помощь с отменой/исходным текстом, спорные варианты только после подтверждения; защита ручного ввода и поздних запросов.
- [x] Серверные receipts с ownership, проверка индексов, запрет повышения освоения для спорной помощи; backward-compatible STT и hashes старых попыток.
- [x] Кнопки SVG/CSS по референсу: синий фон, cyan ring, green tick, статичные стрелки вокруг микрофона.
- [x] Web: 121 component/unit tests, lint, TypeScript и production build.
- [x] Backend/scripts: 179 passed, 8 skipped (внешние PostgreSQL сценарии без test DSN); миграция upgrade → повторный upgrade → downgrade → upgrade сохраняет прежние данные. Никаких платных AI-вызовов.
- [x] Chrome: прежние 9 сценариев плюс 2 opt-in assistance/artwork для web/Android layout, ширина393. Синтетический микрофон; скриншоты `artifacts/soft-assistance-web.png` и `artifacts/soft-assistance-android.png` локальные, не коммитятся.
- [x] Node resilience guards5/5.
- [x] [PR #61](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/61) merged, runtime SHA `4b2de1776b73d71639d6ceaa9a29b192e604033e`. Изменения опубликованы через GitHub.
- [x] Backend deployment `dpl_W3R2j9UU5X4xeyQj362bKbxukJtG` READY/production; [deployment](https://serbian-speaking-trainer-14mul6ydk-suezerguts-projects.vercel.app). Frontend `dpl_HiSmjj1JdLedFk47hdEwU1bSEAmJ` READY/production; [deployment](https://serbian-speaking-trainer-4v6m5rehf-suezerguts-projects.vercel.app). Оба production alias и metadata gitCommitSha подтверждены на runtime SHA.
- [x] Production PostgreSQL migration `e926b83f4d10` → `f31a7b901c22` прошла в backend build, seed0/0/0. SQL подтвердил owner postgres, RLS=true, policies0, grants anon=false/authenticated=false: browser Data API закрыт. Security advisor показывает только ожидаемый INFO `rls_enabled_no_policy` для этой приватной таблицы; это намеренно, прямых клиентских операций нет. [Описание RLS/grants](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [x] Production health200; auth/me без токена401; web /, /privacy, /terms200, testlab404. Публичные bundles содержат новый переключатель/receipt payload/cyan ring. Авторизованный IAB: готовая практика → настройки с switch Value0 и описанием → практика; console errors0. Реальная запись/проверка/выход/смена предпочтений не выполнялись.
- [x] Владелец отдельно подтвердил1.21/code31 в этом чате.
- [x] APK1.21/code31 собран; metadata/signature/HTTPS API/assets/guards прошли; [checkpoint1.21](android-1.21-release.md).
- [x] [PR #63](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/63) merged, APK1.21 опубликован в GitHub release, серверный digest/size совпали; frontend READY на release SHA, 7 assets совпали с APK; [checkpoint](android-1.21-release.md).
- [ ] Физическая Android OAuth/STT приёмка. Телефонные/ADB/AVD тесты по прежней команде владельца не возобновлялись.

Ограничения: не все ошибки речи исправляются; только ограниченные неоднозначности при строгом совпадении контекста. Дополнительный AI-проход из проектного документа остаётся будущим этапом. Настройка не синхронизируется между устройствами.
