# P1: физическая проверка Android 1.17

**Состояние на 01.10.2026: владелец остановил проверки на телефоне; автоматического продолжения нет.** APK не пересобирался, версия не менялась. Последняя доступная контрольная сборка и AVD-проверки описаны в [релизном журнале 1.17](android-1.17-release.md).

## Устройство и подтверждённый доступ

- Xiaomi, модель `2510ERA8BG`; Android 16 / API 36; WebView `153.0.8010.36`.
- ADB показал статус `device`; команды чтения работают. Серийный номер не записывается.
- Уже установленное production-приложение 1.17/code 27 открывает Topics с авторизованной production-сессией; активного voice-запроса нет. Разрешение микрофона выдано, WebView debugging socket доступен. Это не проверка установки или обновления production APK и не Google OAuth flow.
- Lab APK 1.17 успешно установлен через `install -r` после того, как владелец разрешил USB-установку. Для этой проверки APK не собирался заново.

## Подтверждённая часть fixture-практики

- [x] На телефоне через opt-in Playwright `Node page.route` helper прошли fixture auth/login/topics/first phrase и synthetic record → transcript. Это подтверждает только путь до transcript; grade/next и завершённая практика не достигнуты.
- [x] Проверки host helper: fixture transport 5, lab WebView reset 3, resilience guards 5 — всего 13 passed. Это проверки оснастки, не ручные сценарии телефона.
- [ ] Два новых metric guards не запускались; reviewer final recheck ещё ожидается. Harness-изменения не опубликованы и остаются экспериментальными.

Маршрут helper ограничен запросами fixture HTTP `10.0.2.2:8765/8766` → PC loopback `127.0.0.1`. Это не системный proxy и не меняет Wi-Fi телефона. Synthetic transcript не является проверкой настоящего STT; успешный fixture route не является доказательством реального offline или radio interruption.

## Нерешённые сбои тестовой оснастки

1. Xiaomi запрещает `pm clear` с `SecurityException: CLEAR_APP_USER_DATA`. Ранний runner игнорировал результат очистки, сохранял JWT и ждал экран входа. В work-in-progress исправлении `pm clear` удалён из трёх runners; вместо него предложена lab-only очистка WebView `localStorage`/`sessionStorage` после проверки ожидаемого package и localhost HTTP/HTTPS origin с переходом на тот же `/testlab`. Три unit checks прошли, но изменение не финализировано и не опубликовано.
2. Playwright Android driver auto-install через `shell cmd package` не выполнялся, после чего runner мог бесконечно ждать socket. Два прямых `adb install -r -t` официальных cached driver APK закончились `INSTALL_FAILED_USER_RESTRICTED`/canceled. При возобновлении нужно сначала штатно предустановить оба driver APK на устройстве и проверить установку; затем задать `TESTLAB_ANDROID_OMIT_DRIVER_INSTALL=1`, чтобы runner пропустил автоматическую переустановку. Эта последовательность ещё не проверялась. Системный proxy не использовался; необходимость дополнительных разрешений для native input не проверена.

## Остановлено или не проверено

- [ ] Завершить practice: получить и проверить оценку, перейти к следующей фразе и проверить восстановление после ошибки.
- [ ] Выполнить три sample-замера и записать условия/SHA; свежих метрик сейчас нет.
- [ ] Проверить на телефоне системный IME/Back, home/draft, lifecycle/background/resume и разрешения.
- [ ] Выполнить реальный STT и отдельно Google OAuth; synthetic recording/transcript их не заменяет.
- [ ] Проверить настоящее отключение сети/radio отдельно от fixture proxy.

Обычный AVD Android 1.17 ранее прошёл resilience/lifecycle suite, включая fixture grade/next, Back, Home/resume и offline cases; эти результаты не закрывают перечисленные физические проверки. В сообщениях и логах не сохранять пользовательское аудио, текст ответа, токены, серийный номер или персональные данные.
