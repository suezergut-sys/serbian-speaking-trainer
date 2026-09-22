import { useEffect, useMemo, useState } from "react";

import { fetchMonthlyStatistics, fetchPhraseStatistics } from "./api/statistics";
import type { MonthlyStatistics, PhraseStatistics } from "./types/statistics";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type StatisticsTab = "activity" | "phrases";
type PageSize = "10" | "50" | "all";

function monthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function moveMonth(value: Date, direction: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + direction, 1);
}

function formatReviewDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function PhrasesTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>("10");
  const [statistics, setStatistics] = useState<PhraseStatistics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPhraseStatistics(page, pageSize, controller.signal)
      .then(setStatistics)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize]);

  function changePage(nextPage: number) {
    setLoading(true); setError(false); setPage(nextPage);
  }

  function changePageSize(nextPageSize: PageSize) {
    setLoading(true); setError(false); setPageSize(nextPageSize); setPage(1);
  }

  if (loading) return <div className="statistics-state panel">Загружаем фразы…</div>;
  if (error || !statistics) return <div className="statistics-state panel" role="alert">Не удалось загрузить фразы.</div>;

  return <section className="phrase-statistics panel" aria-labelledby="phrases-title">
    <div className="statistics-card__heading">
      <div><p className="kicker">Интервальное повторение</p><h2 id="phrases-title">Фразы</h2></div>
      <label className="page-size-control">На странице
        <select value={pageSize} onChange={(event) => changePageSize(event.target.value as PageSize)}>
          <option value="10">10</option><option value="50">50</option><option value="all">Все</option>
        </select>
      </label>
    </div>
    {statistics.total === 0 ? <p className="empty-phrases">Фразы появятся после первой проверенной попытки.</p> : <>
      <div className="phrase-groups">
        {statistics.groups.map((group) => <section className="phrase-group" key={group.topic_id ?? "custom"}>
          <h3>{group.topic_title}</h3>
          <div className="phrase-table-wrap"><table className="phrase-table">
            <thead><tr><th>Фраза на русском</th><th>Фраза на сербском</th><th>Попытки</th><th>Статус</th><th>Следующий повтор</th></tr></thead>
            <tbody>{group.phrases.map((phrase) => <tr key={phrase.id}>
              <td>{phrase.source_ru}</td><td lang="sr-Latn">{phrase.target_sr}</td><td>{phrase.attempts}</td>
              <td><span className={`phrase-status phrase-status--${phrase.status}`}>{phrase.status === "mastered" ? "выучена" : "в изучении"}</span></td>
              <td>{phrase.status === "mastered" ? formatReviewDate(phrase.next_review_at) : "—"}</td>
            </tr>)}</tbody>
          </table></div>
        </section>)}
      </div>
      {pageSize !== "all" && <nav className="phrase-pagination" aria-label="Пагинация фраз">
        <button type="button" disabled={statistics.page <= 1} onClick={() => changePage(statistics.page - 1)}>Назад</button>
        <span>Страница {statistics.page} из {statistics.total_pages}</span>
        <button type="button" disabled={statistics.page >= statistics.total_pages} onClick={() => changePage(statistics.page + 1)}>Вперёд</button>
      </nav>}
    </>}
  </section>;
}

function ActivityTab() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [statistics, setStatistics] = useState<MonthlyStatistics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const selectedMonthKey = monthKey(selectedMonth);

  useEffect(() => {
    const controller = new AbortController();
    fetchMonthlyStatistics(selectedMonthKey, controller.signal)
      .then(setStatistics)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedMonthKey]);

  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(selectedMonth),
    [selectedMonth],
  );
  const leadingDays = (new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1).getDay() + 6) % 7;
  const maxCount = Math.max(1, ...(statistics?.days.map((day) => day.translation_count) ?? [0]));
  function changeMonth(direction: number) {
    setLoading(true); setError(false); setStatistics(undefined); setSelectedMonth((month) => moveMonth(month, direction));
  }

  if (loading) return <div className="statistics-state panel">Загружаем статистику…</div>;
  if (error || !statistics) return <div className="statistics-state panel" role="alert">Не удалось загрузить статистику.</div>;
  return <>
    <div className="activity-toolbar"><div className="month-switcher" aria-label="Выбор месяца"><button type="button" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}>‹</button><strong>{monthTitle}</strong><button type="button" aria-label="Следующий месяц" onClick={() => changeMonth(1)}>›</button></div></div>
    <section className="statistics-summary" aria-label="Итоги месяца"><div className="panel"><span>{statistics.active_days}</span><small>активных дней</small></div><div className="panel"><span>{statistics.total_phrases}</span><small>фраз за месяц</small></div></section>
    <section className="statistics-card panel" aria-labelledby="calendar-title">
      <div className="statistics-card__heading"><div><p className="kicker">Регулярность</p><h2 id="calendar-title">Календарь занятий</h2></div><span className="calendar-legend"><span><i /> от 1 перевода</span><span><i className="is-intensive" /> от 10 попыток</span></span></div>
      <div className="practice-calendar">{weekDays.map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}{Array.from({ length: leadingDays }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}{statistics.days.map((day) => { const dayNumber = Number(day.date.slice(-2)); const className = ["calendar-day", day.translation_count > 0 && "is-active", day.translation_count >= 10 && "is-intensive"].filter(Boolean).join(" "); return <div className={className} key={day.date} aria-label={`${dayNumber}: ${day.translation_count} переводов`}><span>{dayNumber}</span>{day.translation_count > 0 && <small>{day.translation_count}</small>}</div>; })}</div>
    </section>
    <section className="statistics-card panel" aria-labelledby="daily-chart-title">
      <div className="statistics-card__heading"><div><p className="kicker">Объём практики</p><h2 id="daily-chart-title">Переводы по дням</h2></div><span>Всего: {statistics.total_translations}</span></div>
      <div className="chart-legend" aria-label="Легенда графика"><span><i className="mastered" />выучено</span><span><i className="correct" />правильно ≥95%</span><span><i className="other" />остальные попытки</span></div>
      <div className="daily-chart" role="img" aria-label={`График переводов по дням за ${monthTitle}`}>{statistics.days.map((day) => { const dayNumber = Number(day.date.slice(-2)); const height = day.translation_count ? Math.max(8, (day.translation_count / maxCount) * 100) : 2; const mastered = Math.min(day.mastered_phrase_count, day.correct_translation_count); const correctOnly = Math.max(0, day.correct_translation_count - mastered); const other = Math.max(0, day.translation_count - day.correct_translation_count); const denominator = Math.max(1, day.translation_count); return <div className="daily-chart__column" key={day.date} title={`${dayNumber}: всего ${day.translation_count}, правильно ${day.correct_translation_count}, выучено ${day.mastered_phrase_count}`}><span className={day.translation_count ? "daily-chart__bar is-active" : "daily-chart__bar"} style={{ height: `${height}%` }}>{day.translation_count > 0 && <><b>{day.translation_count}</b><i className="daily-chart__segment daily-chart__segment--other" style={{ flexGrow: other / denominator }} /><i className="daily-chart__segment daily-chart__segment--correct" style={{ flexGrow: correctOnly / denominator }} /><i className="daily-chart__segment daily-chart__segment--mastered" style={{ flexGrow: mastered / denominator }} /></>}</span><small>{dayNumber}</small></div>; })}</div>
    </section>
  </>;
}

export function StatisticsView() {
  const [tab, setTab] = useState<StatisticsTab>("activity");
  return <main className="statistics-page">
    <header className="statistics-header"><div><p className="kicker">Ваш прогресс</p><h1>Статистика</h1><span>Активность по дням и состояние фраз в интервальном повторении.</span></div></header>
    <nav className="statistics-tabs" aria-label="Разделы статистики"><button className={tab === "activity" ? "is-active" : ""} type="button" onClick={() => setTab("activity")}>Активность</button><button className={tab === "phrases" ? "is-active" : ""} type="button" onClick={() => setTab("phrases")}>Фразы</button></nav>
    {tab === "activity" ? <ActivityTab /> : <PhrasesTab />}
  </main>;
}
