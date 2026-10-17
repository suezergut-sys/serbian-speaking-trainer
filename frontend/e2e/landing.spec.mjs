import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { installSyntheticMicrophone } from './flow.mjs';

// Explicit asset regeneration only. Normal QA never writes public assets.
if (process.env.UPDATE_LANDING_SCREENSHOTS === '1') {
  for (const language of ['ru', 'en']) test(`capture mobile web demo ${language}`, async ({ page }) => {
    const en = language === 'en';
    await page.setViewportSize({ width: 393, height: 852 });
    await installSyntheticMicrophone(page);
    await page.addInitScript(lang => {
      localStorage.setItem('serbotalk.interface-language', lang);
      localStorage.setItem('sb-e2e-auth-auth-token', JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'demo', aud: 'authenticated', role: 'authenticated', email: 'demo@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, language);
    const catalog = JSON.parse(await readFile(new URL('../src/locales/phrases.en.json', import.meta.url), 'utf8'));
    const phrase = catalog.find(item => item.id.startsWith('cafe-'));
    const titles = [['job-interview', 'Собеседование'], ['bank', 'В банке'], ['vacation', 'В отпуске'], ['cafe', 'В кафе'], ['work', 'На работе'], ['doctor', 'У врача'], ['rent', 'Аренда'], ['transport', 'Транспорт']];
    const daily_usage = { used: 0, limit: 10, remaining: 10, resets_at: '2026-10-16T00:00:00Z' };
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'demo', display_name: 'Demo', role: 'user', access_tier: 'free', daily_usage };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = titles.map(([id, title_ru]) => ({ id, title_ru, description_ru: '', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] }));
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', status: 'active', level: 'A2', requested_length: 10, completed_count: 0, topic: { id: 'cafe', title_ru: 'В кафе', source: 'preset' } }, exercise: { id: 'e1', session_id: 's1', source_ru: phrase.source_ru, targeted_skills: [], expected_level: 'A2', difficulty: 1, word_hints: [] } };
      else if (path === '/api/transcriptions') body = { text: phrase.canonical_sr };
      else if (path === '/api/sessions/s1/next-exercise') body = { id: 'e2', session_id: 's1', source_ru: phrase.source_ru, targeted_skills: [], expected_level: 'A2', difficulty: 1, word_hints: [] };
      else if (path === '/api/attempts') body = { id: 'a1', exercise_id: 'e1', transcript_sr: phrase.canonical_sr, overall_score: 1, base_score: 1, hint_penalty: 0, daily_usage, analysis: { verdict: 'correct', semantic_score: 1, grammar_score: 1, lexical_score: 1, naturalness_score: 1, pronunciation_score: null, fluency_score: 1, corrected_sr: phrase.canonical_sr, short_feedback_ru: en ? 'Correct translation.' : 'Верный перевод.', detailed_feedback_ru: en ? 'The phrase conveys the meaning and sounds natural.' : 'Фраза передаёт смысл и звучит естественно.', accepted_alternatives: [], issues: [], demonstrated_skills: [] } };
      else throw new Error(`Unexpected demo API: ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/');
    await page.getByRole('button', { name: en ? 'Topics' : 'Темы', exact: true }).click();
    await expect(page.locator('.android-topic-list')).toBeVisible();
    await mkdir('public/landing/screens', { recursive: true });
    await page.screenshot({ path: `public/landing/screens/${language}-topics.png` });
    await page.getByRole('button', { name: en ? /At a café/ : /В кафе/ }).first().click();
    await expect(page.locator('.interactive-phrase').filter({ visible: true })).toBeVisible();
    await page.screenshot({ path: `public/landing/screens/${language}-practice.png` });
    await page.getByRole('button', { name: en ? 'Answer aloud' : 'Ответить голосом', exact: true }).click();
    await page.getByRole('button', { name: en ? 'Finish recording' : 'Завершить запись', exact: true }).click();
    await expect(page.getByLabel(en ? 'Your answer' : 'Ваш ответ', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: en ? 'Check answer' : 'Проверить ответ', exact: true }).click();
    await expect(page.locator('.feedback').filter({ visible: true })).toBeVisible();
    await page.screenshot({ path: `public/landing/screens/${language}-feedback.png` });
  });
}

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'narrow', 'android']) {
  test(`landing ${language} ${layout}`, async ({ page }) => {
    await page.setViewportSize({ width: layout === 'desktop' ? 1440 : layout === 'narrow' ? 320 : 393, height: 900 });
    await page.addInitScript(({ language, layout }) => { if (!localStorage.getItem('serbotalk.interface-language')) localStorage.setItem('serbotalk.interface-language', language); if (layout === 'android') window.CapacitorCustomPlatform = { name: 'android' }; }, { language, layout });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', () => { throw new Error('Landing must not call the API'); });
    await page.goto('/landing.html');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(language === 'en' ? 'Now speak them.' : 'Пора заговорить.');
    for (const img of await page.locator('.landing-phone img, .landing-calendar img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.landing-calendar img')).toHaveAttribute('src', `/landing/screens/${language}-calendar.png`);
    await expect(page.locator('.landing-ribbon, .landing-screenshot-note')).toHaveCount(0);
    await expect(page.locator('.landing-header')).toBeInViewport();
    expect(Math.abs((await page.locator('.landing-header').boundingBox()).y)).toBeLessThan(1);
    await page.getByRole('link', { name: language === 'ru' ? 'Заглянуть внутрь' : 'Take a look inside', exact: true }).click();
    const header = await page.locator('.landing-header').boundingBox();
    const howHeading = await page.locator('#how .landing-section-heading').boundingBox();
    expect(howHeading.y).toBeGreaterThanOrEqual(header.y + header.height);
    if (layout === 'desktop') {
      for (const width of [800, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const boxes = await page.locator('.landing-steps .landing-phone').evaluateAll(elements => elements.map(el => { const rect = el.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; }));
        expect(Math.max(...boxes.map(box => box.top)) - Math.min(...boxes.map(box => box.top))).toBeLessThan(1);
        expect(Math.max(...boxes.map(box => box.bottom)) - Math.min(...boxes.map(box => box.bottom))).toBeLessThan(1);
      }
      // Text growth must expand the shared rows instead of shifting one phone.
      await page.locator('.landing-steps article > p').first().evaluate(el => { el.textContent = `${el.textContent} `.repeat(5); });
      const tops = await page.locator('.landing-steps .landing-phone').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
      await page.reload();
    }
    await mkdir('../artifacts/landing', { recursive: true });
    await page.screenshot({ path: `../artifacts/landing/${language}-${layout}.png`, fullPage: true });
    await page.getByRole('button', { name: language === 'ru' ? 'EN' : 'RU', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(language === 'ru' ? 'Now speak them.' : 'Пора заговорить.');
    await expect(page.locator('.landing-calendar img')).toHaveAttribute('src', `/landing/screens/${language === 'ru' ? 'en' : 'ru'}-calendar.png`);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', language === 'ru' ? 'en' : 'ru');
    expect(errors).toEqual([]);
  });
}
