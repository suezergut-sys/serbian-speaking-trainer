# Переработанный лендинг: web-релиз — 17.10.2026

- [x] Пользователь разрешил публикацию desktop и мобильного web после замены Google Play.
- [x] Локальный редизайн из [preview checkpoint](landing-real-screens-preview-2026-10-17.md) включён целиком: восемь исходных JPEG 1280×2772 без потери качества, вертикальная статистика, без врезок и наклона, выровненная галерея, RU/EN.
- [x] Обе store-кнопки используют /landing/google-play.png, 520×582 RGBA, прозрачный фон. Знак извлечён из предоставленного оригинала, непрозрачные цветные пиксели сохранены; генеративный вариант отклонён как неточный. Убраны только белое поле и внешние пустые поля. Пустой alt предотвращает дублирование Google Play для screen reader.
- [x] 7 component tests; lint; tsc и production build. Существующее предупреждение shared chunk >500kB без новых ошибок.
- [x] 12 локальных browser checks прошли, включая загрузку обеих PNG, natural size JPEG, sticky, выравнивание, локаль и mock auth. Desktop/mobile screenshots проверены, alpha в пустом углу логотипа = 0.
- [x] Production deployment и проверки завершены; подробности ниже.
- [ ] Ручная приёмка владельцем.

Google Play остаётся честной заглушкой: listing URL пока не предоставлен. Backend, production auth configuration и Android 1.34/code44 не изменяются. Нет реальных AI-вызовов, аудио или изменения пользовательских данных.

## Production — 17.10.2026, 19:12 МСК

- [x] [PR #123](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/123) merged, runtime SHA `0fa68c1a828e68244f5f15a424ab31a927b5e2b6`. Проверки GitHub отсутствуют; состояние перед merge CLEAN/MERGEABLE.
- [x] Vercel `dpl_CQjoickcnvE7E56Z7Rk4yQaKTLr3`: READY, production/main, metadata SHA совпал. Alias `serbotalk.app` и прежние aliases подтверждены API. [Deployment](https://serbian-speaking-trainer-6i2pc37yi-suezerguts-projects.vercel.app), [Inspector](https://vercel.com/suezerguts-projects/serbian-speaking-trainer/CQjoickcnvE7E56Z7Rk4yQaKTLr3).
- [x] 8 production browser checks RU/EN desktop/mobile/320px/Android-layout прошли на https://serbotalk.app/landing.html.
- [x] Дополнительно 4 проверки основного https://serbotalk.app/ RU/EN × 1440/393px: новая статистика, две кнопки с логотипами, прозрачность canvas alpha=0 в пустом углу; сохранены top/bottom screenshots artifacts/landing-production/. Просмотрен mobile EN bottom и локальные desktop/mobile.
- [x] SHA256 всех 9 production assets (8 исходных JPEG и PNG знака) совпал с локальными файлами.
- [x] HTTP: root/app/privacy/terms/delete-account/api/health — 200, anonymous api/auth/me — ожидаемый 401. Vercel error logs за окно выпуска пусты.
- [ ] Ручная приёмка владельцем.

Последующий commit документации не меняет deployed runtime. Android-сборка и backend не выполнялись.
