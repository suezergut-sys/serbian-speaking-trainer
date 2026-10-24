# Снятие дневного лимита — 23.10.2026

- [x] По команде владельца двум указанным в чате production-аккаунтам назначен `access_tier=premium`; роль обоих сохранена `user`. Персональные данные в документ не включены.
- [x] UPDATE в Supabase MCP изменил ровно две записи `public.users`, с ограничением по идентификаторам, email, прежней роли и уровню доступа.
- [x] Отдельный SELECT подтвердил для обоих `role=user`, `access_tier=premium`, `unlimited_daily_phrases=true`. Условие соответствует `UserService.usage`: для premium дневной limit и remaining равны null.
- [x] README проверен: описание безлимитного premium актуально. Код, схема БД и Android не менялись; сборка и redeploy не требуются.

Проверка выполнена на уровне production-БД и серверного условия лимита; пользовательские сессии и реальные AI-вызовы не использовались.

- [x] По дополнительной команде владельца ещё одному указанному в чате аккаунту включён premium. UPDATE изменил ровно одну запись; отдельный production SELECT подтвердил role=user, access_tier=premium, unlimited_daily_phrases=true.
