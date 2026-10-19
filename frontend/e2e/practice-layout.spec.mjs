import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { installSyntheticMicrophone } from './flow.mjs';
for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'narrow', 'short', 'android']) {
  test(`stable exercise layout and dismissible hints ${language} ${layout}`, async ({ page }) => {
    const en = language === 'en';
    await page.setViewportSize(layout === 'desktop' ? { width: 1366, height: 900 } : layout === 'narrow' ? { width: 320, height: 568 } : layout === 'short' ? { width: 393, height: 480 } : { width: 393, height: 851 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await installSyntheticMicrophone(page);
    await page.addInitScript(storageKey => { window.__practiceStorageKey = storageKey; }, process.env.PRACTICE_AUTH_STORAGE_KEY);
    await page.addInitScript(lang => {
      localStorage.setItem('serbotalk.interface-language', lang);
      localStorage.setItem(window.__practiceStorageKey || 'sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, language);
    const topic = { id: 'bank', title_ru: 'В банке', description_ru: 'Счёт и платежи', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] };
    const verdict = layout === 'desktop' ? 'needs_work' : layout === 'mobile' ? 'mostly_correct' : 'correct';
    const daily_usage = { used: 0, limit: 10, remaining: 10, resets_at: '2026-10-15T00:00:00Z' };
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body, status = 200;
      if (path === '/api/auth/me') body = { id: 'user-1', role: 'user', access_tier: 'free', email: 'learner@example.invalid', daily_usage };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [topic];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 1 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', topic: { ...topic, id: 'review-phrases', title_ru: 'Фразы для повторения', source: 'preset' }, status: 'active', requested_length: 10, completed_count: 0 }, exercise: { id: 'e1', session_id: 's1', source_ru: 'Я хочу открыть новый текущий счёт.', word_hints: [{ word_ru: 'хочу', translation_sr: 'želim' }], targeted_skills: [], expected_level: 'A2', difficulty: 1 } };
      else if (path.endsWith('/next-exercise')) { status = 409; body = { detail: { code: 'review_queue_empty', message: 'No active review phrases' } }; }
      else if (path.endsWith('/word-hints')) body = { word_ru: route.request().postDataJSON().word, translation_sr: 'želim', learning_status: 'learning', correct_streak: 0 };
      else if (path === '/api/transcriptions') body = { text: 'Želim da otvorim račun.' };
      else if (path === '/api/attempts') body = { id: 'a1', exercise_id: 'e1', transcript_sr: 'Želim da otvorim račun.', overall_score: verdict === 'needs_work' ? .62 : verdict === 'mostly_correct' ? .91 : 1, base_score: 1, hint_penalty: 0, daily_usage, analysis: { verdict, corrected_sr: 'Želim da otvorim račun.', short_feedback_ru: verdict === 'needs_work' ? (en ? 'Try again.' : 'Попробуйте ещё раз.') : verdict === 'mostly_correct' ? (en ? 'Almost correct.' : 'Почти верно.') : (en ? 'Correct.' : 'Верно.'), detailed_feedback_ru: en ? 'Correct.' : 'Верно.', issues: [], demonstrated_skills: [] } };
      else throw new Error(`Unexpected path: ${path}`);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/');
    const stage = page.locator('.exercise-layout:visible');
    const phrase = stage.locator('.interactive-phrase');
    const theme = stage.locator('.exercise-topic');
    const mic = page.getByRole('button', { name: en ? 'Answer aloud' : 'Ответить голосом', exact: true });
    await expect(phrase).toBeVisible();
    await expect(theme).toHaveText(en ? 'Review phrases' : 'Фразы для повторения');
    await expect(stage.locator('.voice-prompt, .mobile-topic-switch')).toHaveCount(0);
    await mkdir('../artifacts/practice-layout', { recursive: true });
    await page.screenshot({ path: `../artifacts/practice-layout/${language}-${layout}-initial.png` });
    const initial = { phrase: await phrase.boundingBox(), theme: await theme.boundingBox(), mic: await mic.boundingBox() };
    const word = phrase.getByRole('button', { name: en ? 'want' : 'хочу', exact: true });
    await word.click();
    await expect(page.locator('.word-tooltip')).toBeVisible();
    await theme.click();
    await expect(page.locator('.word-tooltip')).toHaveCount(0);
    await word.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.word-tooltip')).toHaveCount(0);
    await word.click();
    await word.click();
    await expect(page.locator('.word-tooltip')).toHaveCount(0);
    await mic.click();
    const finish = page.getByRole('button', { name: en ? 'Finish recording' : 'Завершить запись', exact: true });
    expect(Math.abs((await finish.boundingBox()).y - initial.mic.y)).toBeLessThan(1);
    await finish.click();
    const answer = page.getByLabel(en ? 'Your answer' : 'Ваш ответ', { exact: true });
    await expect(answer).toHaveValue('Želim da otvorim račun.');
    const check = page.getByRole('button', { name: en ? (layout === 'android' ? 'Check' : 'Check answer') : (layout === 'android' ? 'Проверить' : 'Проверить ответ'), exact: true });
    const retry = page.getByRole('button', { name: en ? 'Record again' : 'Записать заново', exact: true });
    for (const control of [check, retry]) expect(Math.abs((await control.boundingBox()).y - initial.mic.y)).toBeLessThan(1);
    expect(Math.abs((await phrase.boundingBox()).y - initial.phrase.y)).toBeLessThan(1);
    expect(Math.abs((await theme.boundingBox()).y - initial.theme.y)).toBeLessThan(1);
    const sourceX = await phrase.evaluate(el => { const range = document.createRange(); range.selectNodeContents(el.querySelector('button') || el.firstChild); return range.getBoundingClientRect().x; });
    const answerX = await answer.evaluate(el => el.getBoundingClientRect().x + parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).borderLeftWidth));
    expect(Math.abs(answerX - sourceX)).toBeLessThan(1);
    expect(await answer.evaluate(el => getComputedStyle(el).textAlign)).toBe('left');
    await page.screenshot({ path: `../artifacts/practice-layout/${language}-${layout}-transcript.png` });
    await word.click();
    await answer.click();
    await expect(page.locator('.word-tooltip')).toHaveCount(0);
    await retry.click();
    await page.getByRole('button', { name: en ? 'Finish recording' : 'Завершить запись', exact: true }).click();
    await expect(answer).toHaveValue('Želim da otvorim račun.');
    expect(Math.abs((await retry.boundingBox()).y - initial.mic.y)).toBeLessThan(1);
    await check.click();
    await expect(stage.locator('.feedback')).toBeVisible();
    await expect(phrase).toHaveCount(0);
    expect(Math.abs((await theme.boundingBox()).y - initial.theme.y)).toBeLessThan(1);
    await expect(stage.locator('.result-phrase')).toHaveCount(2);
    for (const row of await stage.locator('.result-phrase__text').all()) {
      expect(Math.abs((await row.boundingBox()).x - sourceX)).toBeLessThan(1);
      await expect(row).toHaveCSS('text-align', 'left');
    }
    const score = stage.locator('.feedback__score');
    if (verdict === 'correct') await expect(score).toHaveCount(0);
    else {
    const scoreBox = await score.boundingBox();
    for (const line of await score.locator('span, strong').all()) {
      const box = await line.boundingBox();
      expect(Math.abs(box.x + box.width / 2 - scoreBox.x - scoreBox.width / 2)).toBeLessThan(1);
    }
    const percent = await score.locator('span').boundingBox();
    expect((await score.locator('strong').boundingBox()).y).toBeGreaterThanOrEqual(percent.y + percent.height);
    }
    await mkdir('../artifacts/practice-layout', { recursive: true });
    await page.screenshot({ path: `../artifacts/practice-layout/${language}-${layout}-result.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await stage.locator('.exercise-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(stage.locator('.exercise-controls button')).toBeInViewport();
    await stage.locator('.exercise-controls button').click();
    await expect(page.locator('.review-congratulations:visible')).toBeVisible();
    await page.locator('.review-home:visible').click();
    const icon = page.locator(layout === 'desktop' ? '.review-topic svg' : '.android-topic-list > button:first-child svg');
    const bounds = await icon.evaluate(el => { const b = el.getBBox(); return { width: b.width, height: b.height }; });
    expect(bounds.width / bounds.height).toBeGreaterThan(.9);
    expect(bounds.width / bounds.height).toBeLessThan(1.1);
    await icon.screenshot({ path: `../artifacts/practice-layout/${language}-${layout}-review-icon.png` });
  });
}
