# 15.10.2026 — цвета легенды календаря занятий

Причина: квадратики легенды имели отдельную яркую заливку `#31c987`, тогда как календарные дни использовали полупрозрачный зелёный градиент. Различались также рамка и свечение.

В `frontend/src/styles.css` легенда и активные дни используют общие CSS-правила градиента, рамки и тени. Для интенсивных дней и соответствующего квадратика применяется общее правило золотой рамки и свечения. Пороги 1/10/20 попыток, пустые дни, золотая звезда и тексты ru/en сохранены.

Проверки:

- `pnpm exec vitest run src/tests/StatisticsView.test.tsx --maxWorkers=1`: 11 passed.
- `pnpm exec vitest run --maxWorkers=1`: 211 passed / 21 files (полный текущий UI-набор, включая существующий локальный лендинг).
- `pnpm exec playwright test calendar-legend.spec.mjs`: 6 passed, ru/en × desktop/mobile/Capacitor Android-layout. Проверены вычисленные браузером background/border/box-shadow легенды и дней с 1/10 попытками, цвет звезды для 20 попыток, день без занятий и отсутствие горизонтального overflow. Только mock API, без OpenAI.
- `pnpm lint`: passed.
- `pnpm build`: typecheck и production build passed.

Реализация локальная. Публикация web и ручная приёмка остаются открытыми. Android sync/build не выполнялись; версия 1.32/code42 и package version сохранены, изменение внесено в Android backlog. Уже установленный APK получит исправление при следующем отдельно запрошенном выпуске.
