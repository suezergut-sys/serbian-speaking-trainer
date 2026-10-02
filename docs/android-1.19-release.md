# SerboTalk 1.19 — исправление входа, 02.10.2026

Владелец согласовал 1.19/code29. Предыдущий APK 1.18 был собран в web mode и содержал пустой API URL: native fallback обращался к http://10.0.2.2:8000. APK 1.17 содержит рабочий https://serbian-speaking-trainer-api.vercel.app. Это подтверждено чтением packaged JS, без устройства и без токенов.

- [x] Android-команды используют mode android; Vite проверяет публичный HTTPS API URL и наличие клиентской Auth-конфигурации до генерации bundle. Секретные ключи не добавлялись.
- [x] Реальный отрицательный build с пустым VITE_API_BASE_URL заблокирован; положительный build с .env.android прошёл.
- [x] Production OPTIONS /api/auth/me с Origin https://localhost, методом GET и Authorization header: 200, allow-origin https://localhost, Authorization разрешён.
- [x] Финальный frontend suite 114/114 прошёл; отдельно прошли 15/15 guard tests. Lint, TypeScript и web/native production builds прошли; 5 Chrome practice/week regression scenarios passed. GPT-6.1 Sol/medium review approved.
- [x] assembleProdDebug прошёл; package com.serbiantalk.trainer, 1.19/code29, min24/target36. В packaged JS подтверждён default API https://serbian-speaking-trainer-api.vercel.app; 9 native asset files побайтно совпали. Нет testlab.html/fixture key/permanent secret patterns; HTTPS local scheme сохранён.
- [x] APK 4 424 194 bytes, SHA256 `7795aed521b4cbb21e1fb587bf30229ed5071f45bf20acd69401aad530170940`; apksigner verification passed, certificate SHA256 `1329c4638a57777b90429bf0eff9df67c2865bf95ebb8b97f45ef4fad77eadd0` совпадает с 1.17/1.18.
- [x] 02.10.2026: [PR #56](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/56) merged; release SHA `05d2dedb5d06ddad5b3b0e31c7feb6b5ea5eb867`. [GitHub release v1.19](https://github.com/suezergut-sys/serbian-speaking-trainer/releases/tag/v1.19) опубликован; серверный digest и размер совпали. На release 1.18 размещено предупреждение и ссылка на исправление. CI checks в PR отсутствовали; проверки локальные.
- [x] Frontend Vercel `dpl_Cf1gKVni3Bxnf1uNaRgshE5kh9LB` READY на release SHA, [deployment](https://serbian-speaking-trainer-of5ynunsq-suezerguts-projects.vercel.app) и [production alias](https://serbian-speaking-trainer.vercel.app/) подтверждены через API. Авторизованный IAB reload: профиль загружен, готовая фраза/voice button доступны, profile error 0 и console errors 0. Голос не записывался.
- [ ] Реальный Google-вход и ручная приёмка на физическом телефоне.

Нативные телефонные/ADB/AVD тесты остаются остановленными по просьбе владельца. Проверка CORS и endpoint не заменяет реальный OAuth на телефоне. Данные и авторизация приложения не сбрасываются.
