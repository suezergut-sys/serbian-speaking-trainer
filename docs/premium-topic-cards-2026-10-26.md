# Личные темы и карточки Premium — 26.10.2026

Владелец поручил доработать расположение личных тем, сделать Premium компактнее, затем опубликовать изменения и собрать новый APK. Публикация/merge разрешены; номер Android-релиза согласуется отдельно после проверки накопленного набора.

- [x] PR #159 с системным исправлением замечаний вне учебных навыков слит: `4fb4cf6b000d3d275fc02bb5f93c2bb553c8dd0d`. Будет опубликован вместе с текущей доработкой; пока production не менялся.
- [x] Личные темы Premium/admin отделены от основных линией, идут после них в двухколоночной сетке. Общая сортировка использует отображаемое название и текущую locale RU/EN, не изменяет исходный массив и не сортирует основные темы. Повторение сохраняет первое место. Новая подпись разделителя локализована RU/EN.
- [x] Premium: компактные карточки создания, две колонки тем/фраз, короткие кнопки удаления; формы, подтверждение, loading/disabled/error и фильтрация фраз сохранены. Тёмные стили используют общие CSS-переменные. Сортировка также применяется к выбору темы для фразы.
- [x] 411 backend/scripts passed, 9 skipped; 329 frontend tests, 5 Node guards, ESLint, TypeScript и production build. После согласования версии повторены 7 целевых App/metadata tests. AI в тестах mocked. Последний browser-прогон: 18/18 Premium/grouping tests RU/EN desktop/mobile320/Android393; ещё 18/18 result-navigation и 8/8 settings прошли в предыдущем прогоне. Проверены сортировка, две колонки, отсутствие горизонтального overflow, фильтрация, удаление, формы и disabled; исходные отказы новых tests были исправлениями mock URL/начального запроса сессии, а не ослаблением assertions.
- [x] [PR #160](https://github.com/suezergut-sys/serbian-speaking-trainer/pull/160) merged, runtime `4adbe2f49248090a326de74c69e81d46f2bf6970`, включает #159.
- [x] Production backend/frontend Ready, aliases/SHA/HTTP/runtime подтверждены; 26 production browser scenarios прошли, обычный OAuth-вход владельца, темы и Premium RU/EN и v.1.40 проверены вручную. [Полный выпуск](android-1.40-release.md).
- [x] Владелец отдельно подтвердил 1.40 / code50, имя `SerboTalk-andorid16-1.40.apk`.
- [x] Production cloud APK 1.40/code50, metadata/API/assets/signature/Downloads/GitHub digest/обратная загрузка; [отдельный выпуск](android-1.40-release.md).
- [ ] Физическая Android-приёмка. Browser Android-layout её не заменяет; Google Play/AAB не запрашивались.

В будущий APK включается весь main после 1.39: двуязычные названия личных тем, карточки настроек, обновлённое предложение Premium, исправление анализа личных фраз, новая группировка тем и компактный активный Premium. Уже включённые email OTP, ShareApp, личный каталог и награды сохраняются. Исходные runtime/APK SHA и последующие documentation-only commits будут отмечены отдельно.
