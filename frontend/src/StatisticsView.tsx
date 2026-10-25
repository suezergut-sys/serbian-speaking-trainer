import { t, getLocale, topicText } from "./i18n";
import { useEffect, useState } from "react";

import { fetchMonthlyStatistics, fetchPhraseStatistics, fetchPhraseTopics } from "./api/statistics";
import type { MonthlyStatistics, PhraseStatistics, PhraseStatisticsTopic } from "./types/statistics";
import { displaySerbian, type SerbianAlphabet } from "./serbianScript";
import { GoldStar } from "./GoldStar";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type PageSize = "20" | "50";

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
  return new Intl.DateTimeFormat(getLocale(), { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function PhraseList({ alphabet, topicId }: { alphabet: SerbianAlphabet; topicId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>("20");
  const [statistics, setStatistics] = useState<PhraseStatistics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPhraseStatistics(page, pageSize, controller.signal, topicId)
      .then((result) => { if (!controller.signal.aborted) setStatistics(result); })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted || requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize, retry, topicId]);

  function changePage(nextPage: number) {
    setLoading(true); setError(false); setPage(nextPage);
  }

  function changePageSize(nextPageSize: PageSize) {
    setLoading(true); setError(false); setPageSize(nextPageSize); setPage(1);
  }

  if (loading) return <div className="statistics-state panel">{t("Загружаем фразы…")}</div>;
  if (error || !statistics) return <div className="statistics-state panel" role="alert">{t("Не удалось загрузить фразы. ")}<button type="button" onClick={() => { setLoading(true); setError(false); setRetry((value) => value + 1); }}>{t("Повторить загрузку фраз")}</button></div>;

  return <section className="phrase-statistics panel" aria-labelledby="phrases-title">
    <div className="statistics-card__heading">
      <div><p className="kicker">{t("Интервальное повторение")}</p><h2 id="phrases-title">{t("Фразы")}</h2></div>
      <label className="page-size-control">{t("На странице")}<select value={pageSize} onChange={(event) => changePageSize(event.target.value as PageSize)}>
          <option value="20">20</option><option value="50">50</option>
        </select>
      </label>
    </div>
    {statistics.total === 0 ? <p className="empty-phrases">{t("Фразы появятся после первой проверенной попытки.")}</p> : <>
      <div className="phrase-groups">
        {statistics.groups.map((group) => <section className="phrase-group" key={group.topic_id ?? "custom"}>
          <h3>{topicText(group.topic_id, group.topic_title, group.topic_title_en)}</h3>
          <div className="phrase-table-wrap"><table className="phrase-table">
            <thead><tr><th>{t("Фраза на русском")}</th><th>{t("Фраза на сербском")}</th><th>{t("Попытки")}</th><th>{t("Статус")}</th><th>{t("Следующий повтор")}</th></tr></thead>
            <tbody>{group.phrases.map((phrase) => <tr key={phrase.id}>
              <td><span className="phrase-cell-label">{t("Фраза на русском")}</span><span>{t(phrase.source_ru)}</span></td><td lang={alphabet === "cyrillic" ? "sr-Cyrl" : "sr-Latn"}><span className="phrase-cell-label">{t("Фраза на сербском")}</span><span>{displaySerbian(phrase.target_sr, alphabet)}</span></td><td><span className="phrase-cell-label">{t("Попытки")}</span><span>{phrase.attempts}</span></td>
              <td><span className="phrase-cell-label">{t("Статус")}</span><span className={`phrase-status phrase-status--${phrase.status}`}>{t(phrase.status === "mastered" ? "выучена" : "в изучении")}</span></td>
              <td><span className="phrase-cell-label">{t("Следующий повтор")}</span><span>{t(phrase.status === "mastered" ? formatReviewDate(phrase.next_review_at) : "—")}</span></td>
            </tr>)}</tbody>
          </table></div>
        </section>)}
      </div>
      <nav className="phrase-pagination" aria-label={t("Пагинация фраз")}>
        <button type="button" disabled={statistics.page <= 1} onClick={() => changePage(statistics.page - 1)}>{t("Назад")}</button>
        <span>{t("Страница ")}{statistics.page}{t(" из ")}{statistics.total_pages}</span>
        <button type="button" disabled={statistics.page >= statistics.total_pages} onClick={() => changePage(statistics.page + 1)}>{t("Вперёд")}</button>
      </nav>
    </>}
  </section>;
}

function PhrasesPage({ alphabet }: { alphabet: SerbianAlphabet }) {
  const [topics, setTopics] = useState<PhraseStatisticsTopic[]>();
  const [selectedTopic, setSelectedTopic] = useState("");
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchPhraseTopics(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setTopics(result);
      setSelectedTopic(result[0] ? result[0].topic_id ?? "unassigned" : "");
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);

  if (error) return <div className="statistics-state panel" role="alert">{t("Не удалось загрузить темы. ")}<button type="button" onClick={() => { setError(false); setRetry(value => value + 1); }}>{t("Повторить загрузку тем")}</button></div>;
  if (!topics) return <div className="statistics-state panel" role="status">{t("Загружаем темы…")}</div>;
  if (!topics.length) return <div className="statistics-state panel">{t("Фразы появятся после первой проверенной попытки.")}</div>;
  return <>
    <label className="phrase-topic-control panel">{t("Тема")}<select aria-label={t("Тема")} value={selectedTopic} onChange={event => setSelectedTopic(event.target.value)}>
        {topics.map(topic => <option key={topic.topic_id ?? "unassigned"} value={topic.topic_id ?? "unassigned"}>{topicText(topic.topic_id, topic.topic_title, topic.topic_title_en)} · {topic.phrase_count}</option>)}
      </select>
    </label>
    <PhraseList key={selectedTopic} alphabet={alphabet} topicId={selectedTopic} />
  </>;
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

  const weekTitle = `${new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "short" }).format(week[0])} — ${new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "short" }).format(week[6])}`;
  const toolbar = <nav className="activity-toolbar" aria-label={t("Выбор недели")}>
    <button type="button" aria-label={t("Предыдущая неделя")} onClick={() => changeWeek(-1)}>‹</button>
    <strong aria-live="polite">{t("Неделя · ")}{t(weekTitle)}</strong>
    {weekOffset < 0 ? <button type="button" aria-label={t("Следующая неделя")} onClick={() => changeWeek(1)}>›</button> : <span aria-hidden="true" />}
  </nav>;

  if (loading) return <>{toolbar}<div className="statistics-state panel" role="status">{t("Загружаем статистику…")}</div></>;
  if (error || !statistics.length) return <>{toolbar}<div className="statistics-state panel" role="alert">{t("Не удалось загрузить статистику. ")}<button type="button" onClick={() => { setLoading(true); setError(false); setRetry((value) => value + 1); }}>{t("Повторить загрузку статистики")}</button></div></>;
  const byDate = new Map(statistics.flatMap((month) => month.days).map((day) => [day.date, day]));
  const days = week.map((date) => byDate.get(dateKey(date)) ?? { date: dateKey(date), phrase_count: 0, translation_count: 0, correct_translation_count: 0, mastered_phrase_count: 0 });
  const total = days.reduce((sum, day) => sum + day.translation_count, 0);
  const mastered = days.reduce((sum, day) => sum + day.mastered_phrase_count, 0);
  const activeDays = days.filter((day) => day.translation_count > 0).length;
  const maxCount = Math.max(1, ...days.map((day) => day.translation_count), ...days.map((day) => day.mastered_phrase_count));
  return <>
    {toolbar}
    <section className="statistics-summary" aria-label={t("Итоги недели")}><div className="panel"><span>{activeDays}</span><small>{t("Дней")}</small></div><div className="panel"><span>{total}</span><small>{t("Повторений")}</small></div><div className="panel"><span>{mastered}</span><small>{t("Выучено")}</small></div></section>
    <section className="statistics-card panel" aria-labelledby="calendar-title">
      <div className="statistics-card__heading"><div><p className="kicker">{t("Регулярность")}</p><h2 id="calendar-title">{t("Календарь занятий")}</h2></div><span className="calendar-legend"><span><i />{t(" от 1 попытки")}</span><span><i className="is-intensive" />{t(" от 10 попыток")}</span><span><GoldStar />{t(" от 20 попыток")}</span></span></div>
      <div className="practice-calendar">{days.map((day, index) => {
        const dayNumber = Number(day.date.slice(-2));
        const className = ["calendar-day", day.translation_count > 0 && "is-active", day.translation_count >= 10 && "is-intensive"].filter(Boolean).join(" ");
        return <div className={className} key={day.date} aria-label={t(`${weekDays[index]} ${dayNumber}: ${day.translation_count} попыток`)}>
          <small className="calendar-date">{t(weekDays[index])} {dayNumber}</small>
          <strong className="calendar-count">{day.translation_count}</strong>
          {day.translation_count >= 20 && <GoldStar className="calendar-day__star" />}
        </div>;
      })}</div>
    </section>
    <section className="statistics-card panel" aria-labelledby="daily-chart-title">
      <div className="statistics-card__heading"><div><p className="kicker">{t("Объём практики")}</p><h2 id="daily-chart-title">{t("Фразы по дням")}</h2></div><span>{t("Всего: ")}{total}</span></div>
      <div className="chart-legend" aria-label={t("Легенда графика")}><span><i className="correct" />{t("правильно ≥95%")}</span><span><i className="other" />{t("неправильно")}</span><span><i className="mastered" />{t("выучено")}</span></div>
      <div className="daily-chart" role="img" aria-label={t(`График фраз по дням за ${weekTitle}`)}>{days.map((day, index) => { const correct = Math.min(day.correct_translation_count, day.translation_count); const incorrect = Math.max(0, day.translation_count - correct); return <div className="daily-chart__column" key={day.date} title={t(`${day.date}: всего ${day.translation_count}, правильно ${correct}, неправильно ${incorrect}, выучено ${day.mastered_phrase_count}`)}><div className="daily-chart__up"><span className="daily-chart__bar" style={{ height: `${day.translation_count / maxCount * 100}%` }}>{day.translation_count > 0 && <><i className="daily-chart__segment daily-chart__segment--correct" style={{ flexGrow: correct }} /><i className="daily-chart__segment daily-chart__segment--other" style={{ flexGrow: incorrect }} /></>}</span></div><div className="daily-chart__down"><span className="daily-chart__mastered" style={{ height: `${day.mastered_phrase_count / maxCount * 100}%` }} /></div><small>{t(weekDays[index])} {Number(day.date.slice(-2))}</small></div>; })}</div>
    </section>
  </>;
}

export function StatisticsView({ alphabet = "latin", page, onPageChange }: {
  alphabet?: SerbianAlphabet;
  page?: "activity" | "phrases";
  onPageChange?: (page: "activity" | "phrases") => void;
}) {
  const [localPage, setLocalPage] = useState<"activity" | "phrases">("activity");
  const currentPage = page ?? localPage;
  const changePage = (next: "activity" | "phrases") => { setLocalPage(next); onPageChange?.(next); };
  return currentPage === "phrases" ? <main className="statistics-page phrase-statistics-page">
    <header className="phrase-page-heading"><button type="button" onClick={() => changePage("activity")}>{t("← К статистике")}</button><h1>{t("Фразы по темам")}</h1></header>
    <PhrasesPage alphabet={alphabet} />
  </main> : <main className="statistics-page">
    <ActivityTab />
    <button className="statistics-phrases-link" type="button" onClick={() => changePage("phrases")}>{t("Фразы по темам →")}</button>
  </main>;
}
