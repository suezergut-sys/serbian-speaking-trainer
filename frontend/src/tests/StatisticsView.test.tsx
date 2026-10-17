import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StatisticsView } from '../StatisticsView';
import { setLanguage } from '../i18n';
import { fetchMonthlyStatistics, fetchPhraseStatistics, fetchPhraseTopics } from '../api/statistics';
import type { PhraseStatistics } from '../types/statistics';

vi.mock('../api/statistics', () => ({fetchMonthlyStatistics:vi.fn(),fetchPhraseStatistics:vi.fn(),fetchPhraseTopics:vi.fn()}));
const phrases = (title:string):PhraseStatistics => ({total:1,page:1,page_size:'20',total_pages:1,groups:[{topic_id:'topic',topic_title:title,phrases:[{id:'phrase',source_ru:'Фраза',target_sr:'Čaj i kafa.',attempts:1,status:'learning',difficulty:null,next_review_at:null}]}]});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchMonthlyStatistics).mockImplementation(async month => ({month,active_days:0,total_phrases:0,total_translations:0,correct_translations:0,mastered_phrases:0,days:[]}));
  vi.mocked(fetchPhraseTopics).mockResolvedValue([{ topic_id: "topic", topic_title: "Актуальная тема", phrase_count: 1 }]);
  vi.mocked(fetchPhraseStatistics).mockResolvedValue(phrases('Актуальная тема'));
});
afterEach(() => { cleanup(); setLanguage('ru'); });

it.each(['ru', 'en'] as const)('defaults to twenty phrases and resets pagination when changing size (%s)', async language => {
  setLanguage(language);
  vi.mocked(fetchPhraseStatistics).mockImplementation(async (page, pageSize) => ({
    ...phrases('Topic'), page, page_size: pageSize, total: 45, total_pages: pageSize === '50' ? 1 : 3,
  }));
  render(<StatisticsView page="phrases" />);
  const label = language === 'en' ? 'Per page' : 'На странице';
  expect(await screen.findByRole('combobox', { name: label })).toHaveValue('20');
  const options = screen.getByRole('combobox', { name: label }).querySelectorAll('option');
  expect(Array.from(options, option => option.value)).toEqual(['20', '50']);
  expect(fetchPhraseStatistics).toHaveBeenLastCalledWith(1, '20', expect.any(AbortSignal), 'topic');
  fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Next' : 'Вперёд' }));
  await waitFor(() => expect(fetchPhraseStatistics).toHaveBeenLastCalledWith(2, '20', expect.any(AbortSignal), 'topic'));
  fireEvent.change(await screen.findByRole('combobox', { name: label }), { target: { value: '50' } });
  await waitFor(() => expect(fetchPhraseStatistics).toHaveBeenLastCalledWith(1, '50', expect.any(AbortSignal), 'topic'));
  expect(await screen.findByRole('combobox', { name: label })).toHaveValue('50');
});

it('offers bounded pages and retries failed phrase loading without changing the selection', async () => {
  vi.mocked(fetchPhraseStatistics).mockRejectedValueOnce(new Error('offline'));
  render(<StatisticsView page="phrases"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Повторить загрузку фраз'}));
  await screen.findByRole('heading',{name:'Актуальная тема'});
  expect(screen.queryByRole('option',{name:'Все'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'На странице' }),{target:{value:'50'}});
  await waitFor(() => expect(fetchPhraseStatistics).toHaveBeenLastCalledWith(1,'50',expect.any(AbortSignal),'topic'));
});

it('ignores a retired request even when its mock transport resolves after abort', async () => {
  let retire!:(value:PhraseStatistics)=>void;
  vi.mocked(fetchPhraseStatistics).mockImplementationOnce(() => new Promise(resolve => {retire=resolve;}));
  render(<StrictMode><StatisticsView page="phrases"/></StrictMode>);
  await screen.findByRole('heading',{name:'Актуальная тема'});
  await act(async () => retire(phrases('Устаревшая тема')));
  expect(screen.queryByText('Устаревшая тема')).not.toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Актуальная тема'})).toBeInTheDocument();
});

it('retries monthly statistics after a network failure', async () => {
  vi.mocked(fetchMonthlyStatistics).mockRejectedValueOnce(new Error('offline'));
  render(<StatisticsView/>);
  fireEvent.click(await screen.findByRole('button',{name:'Повторить загрузку статистики'}));
  await screen.findByLabelText('Итоги недели');
  expect(fetchMonthlyStatistics).toHaveBeenCalledTimes(2 * new Set(vi.mocked(fetchMonthlyStatistics).mock.calls.map(([month]) => month)).size);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('navigates past weeks across a year boundary and hides forward navigation at the current week', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 0, 5, 12));
  try {
    render(<StatisticsView />);
    await screen.findByLabelText('Итоги недели');
    expect(screen.getByRole('navigation', { name: 'Выбор недели' })).toHaveTextContent('Неделя · 5 янв. — 11 янв.');
    expect(screen.queryByRole('button', { name: 'Следующая неделя' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущая неделя' }));
    await screen.findByLabelText('Итоги недели');
    expect(screen.getByRole('navigation', { name: 'Выбор недели' })).toHaveTextContent('29 дек. — 4 янв.');
    expect(fetchMonthlyStatistics).toHaveBeenCalledWith('2025-12', expect.any(AbortSignal));
    expect(fetchMonthlyStatistics).toHaveBeenCalledWith('2026-01', expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }));
    await screen.findByLabelText('Итоги недели');
    expect(screen.queryByRole('button', { name: 'Следующая неделя' })).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it('reuses monthly data within a month and ignores late data after navigating again', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 2, 9, 12));
  let finishOld!: (value: Awaited<ReturnType<typeof fetchMonthlyStatistics>>) => void;
  const month = (count: number) => ({ month: '2026-02', active_days: 1, total_phrases: count, total_translations: count, correct_translations: count, mastered_phrases: 0, days: [{date:'2026-02-16',phrase_count:count,translation_count:count,correct_translation_count:count,mastered_phrase_count:0}] });
  let februaryRequests = 0;
  const defaultFetch = vi.mocked(fetchMonthlyStatistics).getMockImplementation()!;
  vi.mocked(fetchMonthlyStatistics).mockImplementation((key, signal) => {
    if (key !== '2026-02') return defaultFetch(key, signal);
    februaryRequests++;
    return februaryRequests === 1 ? new Promise(resolve => {finishOld=resolve;}) : Promise.resolve(month(9));
  });
  try {
    render(<StatisticsView />);
    await screen.findByLabelText('Итоги недели');
    fireEvent.click(screen.getByRole('button', {name:'Предыдущая неделя'}));
    expect(fetchMonthlyStatistics).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', {name:'Предыдущая неделя'}));
    await waitFor(() => expect(februaryRequests).toBe(1));
    fireEvent.click(screen.getByRole('button', {name:'Предыдущая неделя'}));
    expect(await screen.findByLabelText('Итоги недели')).toHaveTextContent('9Повторений');
    await act(async () => finishOld(month(88)));
    expect(screen.getByLabelText('Итоги недели')).toHaveTextContent('9Повторений');
  } finally { vi.useRealTimers(); }
});


it('starts at the week selector and shows days, attempts and mastered totals as three cards', async () => {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  vi.mocked(fetchMonthlyStatistics).mockImplementation(async month => ({month,active_days:1,total_phrases:2,total_translations:8,correct_translations:7,mastered_phrases:3,days:key.startsWith(month) ? [{date:key,phrase_count:2,translation_count:8,correct_translation_count:7,mastered_phrase_count:3}] : []}));
  const { container } = render(<StatisticsView />);
  const summary = await screen.findByLabelText('Итоги недели');
  expect(summary.children).toHaveLength(3);
  expect(summary.children[0]).toHaveTextContent('1Дней');
  expect(summary.children[1]).toHaveTextContent('8Повторений');
  expect(summary.children[2]).toHaveTextContent('3Выучено');
  expect(container.querySelector('main')?.firstElementChild).toHaveAttribute('aria-label', 'Выбор недели');
  expect(screen.queryByRole('heading', { name: 'Статистика' })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Разделы статистики' })).not.toBeInTheDocument();
});


it('loads phrases only on their separate page, filters by topic and returns to activity', async () => {
  vi.mocked(fetchPhraseTopics).mockResolvedValue([
    { topic_id: 'topic', topic_title: 'Первая тема', phrase_count: 1 },
    { topic_id: null, topic_title: 'Свои фразы', phrase_count: 1 },
  ]);
  render(<StatisticsView />);
  await screen.findByLabelText('Итоги недели');
  expect(fetchPhraseStatistics).not.toHaveBeenCalled();
  expect(fetchPhraseTopics).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Фразы по темам →' }));
  await screen.findByRole('combobox', { name: 'Тема' });
  await screen.findByRole('heading', { name: 'Актуальная тема' });
  expect(screen.queryByLabelText('Итоги недели')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Тема' }), { target: { value: 'unassigned' } });
  await waitFor(() => expect(fetchPhraseStatistics).toHaveBeenLastCalledWith(1, '20', expect.any(AbortSignal), 'unassigned'));
  fireEvent.click(screen.getByRole('button', { name: '← К статистике' }));
  await screen.findByLabelText('Итоги недели');
  expect(screen.queryByRole('combobox', { name: 'Тема' })).not.toBeInTheDocument();
});

it('shows dated calendar cells with large attempt counts including zero and intensive days', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7, 12));
  vi.mocked(fetchMonthlyStatistics).mockResolvedValue({ month: '2026-10', active_days: 1,
    total_phrases: 12, total_translations: 12, correct_translations: 9, mastered_phrases: 2,
    days: [{ date: '2026-10-05', phrase_count: 12, translation_count: 12, correct_translation_count: 9, mastered_phrase_count: 2 }] });
  try {
    const { container } = render(<StatisticsView />);
    const active = await screen.findByLabelText('Пн 5: 12 попыток');
    expect(active.querySelector('.calendar-date')).toHaveTextContent('Пн 5');
    expect(active.querySelector('.calendar-count')).toHaveTextContent('12');
    expect(active).toHaveClass('is-intensive');
    expect(screen.getByLabelText('Вт 6: 0 попыток').querySelector('.calendar-count')).toHaveTextContent('0');
    expect(container.querySelectorAll('.calendar-day')).toHaveLength(7);
    expect(screen.getByText('от 1 попытки')).toBeInTheDocument();
    expect(screen.getByText('от 10 попыток')).toBeInTheDocument();
    expect(screen.queryByText('от 1 перевода')).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it('adds a gold star from exactly twenty attempts while preserving the intensive border', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7, 12));
  vi.mocked(fetchMonthlyStatistics).mockResolvedValue({ month: '2026-10', active_days: 3,
    total_phrases: 60, total_translations: 60, correct_translations: 0, mastered_phrases: 0,
    days: [19, 20, 21].map((count, index) => ({ date: `2026-10-0${5 + index}`, phrase_count: 1, translation_count: count, correct_translation_count: 0, mastered_phrase_count: 0 })) });
  try {
    render(<StatisticsView />);
    const below = await screen.findByLabelText('Пн 5: 19 попыток');
    const threshold = screen.getByLabelText('Вт 6: 20 попыток');
    const above = screen.getByLabelText('Ср 7: 21 попыток');
    expect(below.querySelector('.calendar-day__star')).not.toBeInTheDocument();
    expect(threshold.querySelector('.calendar-day__star')).toBeInTheDocument();
    expect(above.querySelector('.calendar-day__star')).toBeInTheDocument();
    expect(threshold).toHaveClass('is-intensive');
    expect(screen.getByText('от 20 попыток')).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});


it('retries topic loading and handles an account with no phrases', async () => {
  vi.mocked(fetchPhraseTopics).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  render(<StatisticsView page="phrases" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Повторить загрузку тем' }));
  await screen.findByText('Фразы появятся после первой проверенной попытки.');
  expect(fetchPhraseStatistics).not.toHaveBeenCalled();
});

it('ignores a late phrase result from a previously selected topic', async () => {
  vi.mocked(fetchPhraseTopics).mockResolvedValue([
    { topic_id: 'first', topic_title: 'Первая', phrase_count: 1 },
    { topic_id: 'second', topic_title: 'Вторая', phrase_count: 1 },
  ]);
  let finish!: (value: PhraseStatistics) => void;
  vi.mocked(fetchPhraseStatistics).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue(phrases('Новая тема'));
  render(<StatisticsView page="phrases" />);
  const select = await screen.findByRole('combobox', { name: 'Тема' });
  await waitFor(() => expect(fetchPhraseStatistics).toHaveBeenCalledWith(1, '20', expect.any(AbortSignal), 'first'));
  const retiredSignal = vi.mocked(fetchPhraseStatistics).mock.calls[0][2]!;
  fireEvent.change(select, { target: { value: 'second' } });
  await screen.findByRole('heading', { name: 'Новая тема' });
  expect(retiredSignal.aborted).toBe(true);
  await act(async () => finish(phrases('Старая тема')));
  expect(screen.queryByRole('heading', { name: 'Старая тема' })).not.toBeInTheDocument();
});
