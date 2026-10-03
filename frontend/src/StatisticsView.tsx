import { useEffect, useState } from "react";

import { fetchMonthlyStatistics, fetchPhraseStatistics } from "./api/statistics";
import type { MonthlyStatistics, PhraseStatistics } from "./types/statistics";
import { displaySerbian, type SerbianAlphabet } from "./serbianScript";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type PageSize = "10" | "50";

function monthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(value: Date): string {
  return `${monthKey(value)}-${String(value.getDate()).padStart(2, "0")}`;
}

function currentWeek(): Date[] {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
}

function formatReviewDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function PhrasesTab({ alphabet }: { alphabet: SerbianAlphabet }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>("10");
  const [statistics, setStatistics] = useState<PhraseStatistics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPhraseStatistics(page, pageSize, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setStatistics(result); })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted || requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize, retry]);

  function changePage(nextPage: number) {
    setLoading(true); setError(false); setPage(nextPage);
  }

  function changePageSize(nextPageSize: PageSize) {
    setLoading(true); setError(false); setPageSize(nextPageSize); setPage(1);
  }

  if (loading) return <div className="statistics-state panel">Загружаем фразы…</div>;
  if (error || !statistics) return <div className="statistics-state panel" role="alert">Не удалось загрузить фразы. <button type="button" onClick={() => { setLoading(true); setError(false); setRetry((value) => value + 1); }}>Повторить загрузку фраз</button></div>;

  return <section className="phrase-statistics panel" aria-labelledby="phrases-title">
    <div className="statistics-card__heading">
      <div><p className="kicker">Интервальное повторение</p><h2 id="phrases-title">Фразы</h2></div>
      <label className="page-size-control">На странице
        <select value={pageSize} onChange={(event) => changePageSize(event.target.value as PageSize)}>
          <option value="10">10</option><option value="50">50</option>
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
              <td>{phrase.source_ru}</td><td lang={alphabet === "cyrillic" ? "sr-Cyrl" : "sr-Latn"}>{displaySerbian(phrase.target_sr, alphabet)}</td><td>{phrase.attempts}</td>
              <td><span className={`phrase-status phrase-status--${phrase.status}`}>{phrase.status === "mastered" ? "выучена" : "в изучении"}</span></td>
              <td>{phrase.status === "mastered" ? formatReviewDate(phrase.next_review_at) : "—"}</td>
            </tr>)}</tbody>
          </table></div>
        </section>)}
      </div>
      <nav className="phrase-pagination" aria-label="Пагинация фраз">
        <button type="button" disabled={statistics.page <= 1} onClick={() => changePage(statistics.page - 1)}>Назад</button>
        <span>Страница {statistics.page} из {statistics.total_pages}</span>
        <button type="button" disabled={statistics.page >= statistics.total_pages} onClick={() => changePage(statistics.page + 1)}>Вперёд</button>
      </nav>
    </>}
  </section>;
}

function ActivityTab() {
  const [thisWeek] = useState(currentWeek);
  const [weekOffset, setWeekOffset] = useState(0);
  const week = thisWeek.map((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + weekOffset * 7));
  const [statistics, setStatistics] = useState<MonthlyStatistics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const months = [...new Set(week.map(monthKey))];
  const monthKeys = months.join(",");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(monthKeys.split(",").map((month) => fetchMonthlyStatistics(month, controller.signal)))
      .then((result) => { if (!controller.signal.aborted) setStatistics(result); })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted || requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [monthKeys, retry]);

  function changeWeek(direction: number) {
    const nextOffset = Math.min(0, weekOffset + direction);
    const nextMonths = [...new Set(thisWeek.map((date) => monthKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + nextOffset * 7))))].join(",");
    if (nextMonths !== monthKeys) { setLoading(true); setError(false); }
    setWeekOffset(nextOffset);
  }

  const weekTitle = `${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(week[0])} — ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(week[6])}`;
  const toolbar = <nav className="activity-toolbar" aria-label="Выбор недели">
    <button type="button" aria-label="Предыдущая неделя" onClick={() => changeWeek(-1)}>‹</button>
    <strong aria-live="polite">Неделя · {weekTitle}</strong>
    {weekOffset < 0 ? <button type="button" aria-label="Следующая неделя" onClick={() => changeWeek(1)}>›</button> : <span aria-hidden="true" />}
  </nav>;

  if (loading) return <>{toolbar}<div className="statistics-state panel" role="status">Загружаем статистику…</div></>;
  if (error || !statistics.length) return <>{toolbar}<div className="statistics-state panel" role="alert">Не удалось загрузить статистику. <button type="button" onClick={() => { setLoading(true); setError(false); setRetry((value) => value + 1); }}>Повторить загрузку статистики</button></div></>;
  const byDate = new Map(statistics.flatMap((month) => month.days).map((day) => [day.date, day]));
  const days = week.map((date) => byDate.get(dateKey(date)) ?? { date: dateKey(date), phrase_count: 0, translation_count: 0, correct_translation_count: 0, mastered_phrase_count: 0 });
  const total = days.reduce((sum, day) => sum + day.translation_count, 0);
  const mastered = days.reduce((sum, day) => sum + day.mastered_phrase_count, 0);
  const activeDays = days.filter((day) => day.translation_count > 0).length;
  const maxCount = Math.max(1, ...days.map((day) => day.translation_count), ...days.map((day) => day.mastered_phrase_count));
  return <>
    {toolbar}
    <section className="statistics-summary" aria-label="Итоги недели"><div className="panel"><span>{activeDays}</span><small>Дней</small></div><div className="panel"><span>{total}</span><small>Повторений</small></div><div className="panel"><span>{mastered}</span><small>Выучено</small></div></section>
    <section className="statistics-card panel" aria-labelledby="calendar-title">
      <div className="statistics-card__heading"><div><p className="kicker">Регулярность</p><h2 id="calendar-title">Календарь занятий</h2></div><span className="calendar-legend"><span><i /> от 1 перевода</span><span><i className="is-intensive" /> от 10 попыток</span></span></div>
      <div className="practice-calendar">{weekDays.map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}{days.map((day) => { const dayNumber = Number(day.date.slice(-2)); const className = ["calendar-day", day.translation_count > 0 && "is-active", day.translation_count >= 10 && "is-intensive"].filter(Boolean).join(" "); return <div className={className} key={day.date} aria-label={`${dayNumber}: ${day.translation_count} фраз`}><span>{dayNumber}</span>{day.translation_count > 0 && <small>{day.translation_count}</small>}</div>; })}</div>
    </section>
    <section className="statistics-card panel" aria-labelledby="daily-chart-title">
      <div className="statistics-card__heading"><div><p className="kicker">Объём практики</p><h2 id="daily-chart-title">Фразы по дням</h2></div><span>Всего: {total}</span></div>
      <div className="chart-legend" aria-label="Легенда графика"><span><i className="correct" />правильно ≥95%</span><span><i className="other" />неправильно</span><span><i className="mastered" />выучено</span></div>
      <div className="daily-chart" role="img" aria-label={`График фраз по дням за ${weekTitle}`}>{days.map((day, index) => { const correct = Math.min(day.correct_translation_count, day.translation_count); const incorrect = Math.max(0, day.translation_count - correct); return <div className="daily-chart__column" key={day.date} title={`${day.date}: всего ${day.translation_count}, правильно ${correct}, неправильно ${incorrect}, выучено ${day.mastered_phrase_count}`}><div className="daily-chart__up"><span className="daily-chart__bar" style={{ height: `${day.translation_count / maxCount * 100}%` }}>{day.translation_count > 0 && <><i className="daily-chart__segment daily-chart__segment--correct" style={{ flexGrow: correct }} /><i className="daily-chart__segment daily-chart__segment--other" style={{ flexGrow: incorrect }} /></>}</span></div><div className="daily-chart__down"><span className="daily-chart__mastered" style={{ height: `${day.mastered_phrase_count / maxCount * 100}%` }} /></div><small>{weekDays[index]} {Number(day.date.slice(-2))}</small></div>; })}</div>
    </section>
  </>;
}

export function StatisticsView({ alphabet = "latin" }: { alphabet?: SerbianAlphabet }) {
  return <main className="statistics-page">
    <ActivityTab />
    <PhrasesTab alphabet={alphabet} />
  </main>;
}
