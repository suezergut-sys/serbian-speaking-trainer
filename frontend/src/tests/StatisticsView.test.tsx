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
  fireEvent.click(screen.getByRole('button',{name:'Фразы'}));
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
  fireEvent.click(screen.getByRole('button',{name:'Фразы'}));
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

