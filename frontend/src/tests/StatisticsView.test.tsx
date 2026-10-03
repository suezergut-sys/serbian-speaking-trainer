import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StatisticsView } from '../StatisticsView';
import { fetchMonthlyStatistics, fetchPhraseStatistics } from '../api/statistics';
import type { PhraseStatistics } from '../types/statistics';

vi.mock('../api/statistics', () => ({fetchMonthlyStatistics:vi.fn(),fetchPhraseStatistics:vi.fn()}));
const phrases = (title:string):PhraseStatistics => ({total:1,page:1,page_size:'10',total_pages:1,groups:[{topic_id:'topic',topic_title:title,phrases:[{id:'phrase',source_ru:'Фраза',target_sr:'Čaj i kafa.',attempts:1,status:'learning',difficulty:null,next_review_at:null}]}]});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchMonthlyStatistics).mockImplementation(async month => ({month,active_days:0,total_phrases:0,total_translations:0,correct_translations:0,mastered_phrases:0,days:[]}));
  vi.mocked(fetchPhraseStatistics).mockResolvedValue(phrases('Актуальная тема'));
});
afterEach(cleanup);

it('offers bounded pages and retries failed phrase loading without changing the selection', async () => {
  vi.mocked(fetchPhraseStatistics).mockRejectedValueOnce(new Error('offline'));
  render(<StatisticsView/>);
  fireEvent.click(await screen.findByRole('button',{name:'Повторить загрузку фраз'}));
  await screen.findByRole('heading',{name:'Актуальная тема'});
  expect(screen.queryByRole('option',{name:'Все'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'50'}});
  await waitFor(() => expect(fetchPhraseStatistics).toHaveBeenLastCalledWith(1,'50',expect.any(AbortSignal)));
});

it('ignores a retired request even when its mock transport resolves after abort', async () => {
  let retire!:(value:PhraseStatistics)=>void;
  vi.mocked(fetchPhraseStatistics).mockImplementationOnce(() => new Promise(resolve => {retire=resolve;}));
  render(<StrictMode><StatisticsView/></StrictMode>);
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
