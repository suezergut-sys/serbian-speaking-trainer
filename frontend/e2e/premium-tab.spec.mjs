import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'android']) for (const tier of ['free', 'premium']) {
  test(`premium tab ${language} ${layout} ${tier}`, async ({ page }) => {
    const ru = language === 'ru';
    await page.setViewportSize({ width: layout === 'desktop' ? 1366 : layout === 'mobile' ? 320 : 393, height: 844 });
    await page.addInitScript(({ language, layout, storageKey }) => {
      if (layout === 'android') window.CapacitorCustomPlatform = { name: 'android' };
      if (layout === 'android') window.open = url => { window.__premiumOpenedUrl = String(url); return null; };
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'synthetic-only', refresh_token: 'synthetic-only', expires_at: 4102444800, token_type: 'bearer', user: { id: 'premium-user', email: 'premium@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }));
    }, { language, layout, storageKey: process.env.LAYOUT_AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
    const topics = [{ id: 'bank', title_ru: 'В банке', description_ru: '', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] }];
    const prepared = { preparation_id: '12345678-1234-1234-1234-123456789012', source_ru: 'Моя личная фраза.', canonical_sr: 'Moja lična fraza.', intended_sr_variants: [], word_hints: [] };
    let saved = false, privateLoads = 0;
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'premium-user', role: 'user', access_tier: tier, email: 'premium@example.invalid', assistance_enabled: false, daily_usage: { used: 0, limit: tier === 'free' ? 20 : 100, remaining: tier === 'free' ? 20 : 100 } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics' && request.method() === 'POST') { body = { ...topics[0], id: 'custom-test', title_ru: request.postDataJSON().title_ru, phrase_count: 0, custom_phrase_count: 0, is_custom: true }; topics.push(body); }
      else if (path === '/api/topics') body = topics;
      else if (path === '/api/review-phrases/summary') body = { phrase_count: saved ? 1 : 0 };
      else if (path === '/api/custom-phrases') { privateLoads++; body = saved ? [{ id: 'phrase-1', ...prepared, topic_id: 'custom-test', status: 'active' }] : []; }
      else if (path === '/api/custom-phrases/phrase-1' && request.method() === 'DELETE') { saved = false; topics[1].phrase_count = 0; topics[1].custom_phrase_count = 0; await route.fulfill({ status: 204 }); return; }
      else if (path === '/api/review-phrases/prepare') body = prepared;
      else if (path === '/api/review-phrases' && request.method() === 'POST') { topics[1].phrase_count = 1; topics[1].custom_phrase_count = 1; saved = true; body = { id: 'phrase-1', ...prepared, topic_id: 'custom-test' }; }
      else if (path === '/api/sessions/start') body = { session: { id: 's1', status: 'active', requested_length: 10, topic: { id: 'bank', title_ru: 'В банке', source: 'preset' } }, exercise: { id: 'e1', source_ru: 'Я хочу открыть счёт.', word_hints: [], targeted_skills: [] } };
      else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    if (layout !== 'desktop') await page.getByRole('button', { name: ru ? 'Темы' : 'Topics', exact: true }).click();
    await expect(page.getByRole('button', { name: /добавить тему|добавить фразу|add topic|add phrase/ })).toHaveCount(0);
    const nav = page.locator(layout === 'desktop' ? '.main-nav' : '.android-header nav');
    await expect(nav.getByRole('button', { name: ru ? 'Премиум' : 'Premium', exact: true })).toBeVisible();
    const buttons = await nav.getByRole('button').allTextContents();
    if (layout === 'desktop') expect(buttons.slice(1,4)).toEqual(ru ? ['Статистика','Премиум','Настройки'] : ['Statistics','Premium','Settings']);
    const premium = nav.getByRole('button', { name: ru ? 'Премиум' : 'Premium', exact: true });
    const crown = premium.locator('svg');
    const inactiveColor = await crown.evaluate(element => getComputedStyle(element).color);
    await premium.click();
    const content = page.locator('.premium-page');
    if (tier === 'premium' || layout !== 'android') await expect(content.getByRole('heading', { name: tier === 'free' ? ru ? 'Премиум' : 'Premium' : ru ? 'ПРЕМИУМ' : 'PREMIUM', exact: true })).toBeVisible();
    const selectedColor = await crown.evaluate(element => getComputedStyle(element).color);
    expect(selectedColor).not.toBe(inactiveColor);
    await expect(crown).toHaveCSS('color', tier === 'premium' ? 'rgb(242, 189, 90)' : layout === 'desktop' ? 'rgb(64, 164, 255)' : 'rgb(102, 186, 255)');
    if (tier === 'free' && layout === 'android') {
      await expect(content.getByText(ru ? '100 повторений в день' : '100 repetitions per day')).toBeVisible();
      await expect(content.getByRole('button', { name: ru ? 'КУПИТЬ НА САЙТЕ' : 'BUY ON WEBSITE', exact: true })).toBeVisible();
      await expect(content.getByRole('button')).toHaveCount(1);
      await expect(content.locator('.premium-offer__hero svg')).toHaveCSS('color', 'rgb(242, 189, 90)');
      const coffee = content.getByRole('img', { name: ru ? 'Две чашки кофе' : 'Two cups of coffee' });
      await expect.poll(() => coffee.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      const offer = content.locator('.premium-offer');
      expect(await offer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await mkdir('../artifacts/android-premium-entry', { recursive: true });
      await page.screenshot({ path: `../artifacts/android-premium-entry/${language}-android.png` });
      await expect(content.locator('.payment-form')).toHaveCount(0);
      await content.getByRole('button', { name: ru ? 'КУПИТЬ НА САЙТЕ' : 'BUY ON WEBSITE', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__premiumOpenedUrl)).toBe('https://serbotalk.app/app?from=android&next=premium');
      expect(privateLoads).toBe(0);
    } else if (tier === 'free') {
      await expect(content.getByRole('button', { name: ru ? 'КУПИТЬ' : 'BUY' })).toBeEnabled();
      await expect(content.getByText(ru ? '100 повторений в день' : '100 repetitions per day')).toBeVisible();
      await expect(content.getByText(ru ? 'До 5 личных тем' : 'Up to 5 personal topics')).toBeVisible();
      await expect(content.getByText(ru ? 'До 30 фраз в каждой теме — 150 своих фраз всего' : 'Up to 30 phrases per topic — 150 custom phrases in total')).toBeVisible();
      const coffee = content.getByRole('img', { name: ru ? 'Две чашки кофе' : 'Two cups of coffee' });
      await expect.poll(() => coffee.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      const offer = content.locator('.premium-offer');
      const buyBox = await content.getByRole('button', { name: ru ? 'КУПИТЬ' : 'BUY' }).boundingBox();
      const offerBox = await offer.boundingBox();
      expect(buyBox.width).toBeLessThan(offerBox.width * .7);
      expect(Math.abs(buyBox.x + buyBox.width / 2 - (offerBox.x + offerBox.width / 2))).toBeLessThan(2);
      await expect(content.locator('.premium-offer__hero svg')).toHaveCSS('color', 'rgb(242, 189, 90)');
      await expect(content.getByText(ru ? 'Однократный платёж 5 евро' : 'One-time payment of 5 euros')).toBeVisible();
      await expect(content.getByRole('heading', { name: ru ? 'Почему платно?' : 'Why is it paid?' })).toBeVisible();
      expect(await offer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(privateLoads).toBe(0);
    } else {
      await content.getByRole('button', { name: ru ? 'Создать тему' : 'Create topic', exact: true }).click();
      await content.getByLabel(ru ? 'Название темы' : 'Topic name').fill('Моя тема');
      await content.getByRole('button', { name: ru ? 'Сохранить тему' : 'Save topic', exact: true }).click();
      await expect(content.getByText(ru ? 'Тема сохранена.' : 'Topic saved.', { exact: true })).toBeVisible();
      await nav.getByRole('button', { name: ru ? layout === 'desktop' ? 'Практика' : 'Темы' : layout === 'desktop' ? 'Practice' : 'Topics', exact: true }).click();
      await expect(page.getByRole('button', { name: /Моя тема/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Моя тема/ })).toHaveCSS('border-color', 'rgb(242, 189, 90)');
      await expect(page.getByRole('button', { name: /Моя тема/ })).toHaveCSS('border-width', '1px');
      await page.reload();
      if (layout === 'mobile') await nav.getByRole('button', { name: ru ? 'Темы' : 'Topics', exact: true }).click();
      await expect(page.getByRole('button', { name: /Моя тема/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Моя тема/ })).toHaveCSS('border-color', 'rgb(242, 189, 90)');
      await expect(page.getByRole('button', { name: /Моя тема/ })).toHaveCSS('border-width', '1px');
      await expect(page.locator('.topic--personal')).toHaveCount(1);
      await mkdir('../artifacts/premium-home', { recursive: true });
      await page.screenshot({ path: `../artifacts/premium-home/${language}-${layout}-home.png` });
      await premium.click();
      await content.getByRole('button', { name: ru ? 'Создать фразу' : 'Create phrase', exact: true }).click();
      await content.getByLabel(ru ? 'Фраза на русском языке' : 'Phrase in Russian').fill(prepared.source_ru);
      await content.getByRole('button', { name: ru ? 'Подготовить перевод' : 'Prepare translation', exact: true }).click();
      await content.getByRole('button', { name: ru ? 'Сохранить фразу' : 'Save phrase', exact: true }).click();
      await expect(content.getByText(ru ? 'Фраза сохранена.' : 'Phrase saved.', { exact: true })).toBeVisible();
      await content.getByRole('button', { name: ru ? 'Закрыть' : 'Close', exact: true }).click();
      const topic = content.getByRole('button', { name: /Моя тема/ });
      await expect(topic).toContainText(ru ? 'Фраз: 1' : 'Phrases: 1');
      await topic.click();
      await expect(content.getByText(prepared.source_ru, { exact: true })).toBeVisible();
      await expect(content.getByText(prepared.canonical_sr, { exact: true })).toHaveCount(0);
      await content.getByRole('button', { name: ru ? 'Удалить фразу' : 'Delete phrase', exact: true }).click();
      await content.getByRole('button', { name: ru ? 'Подтвердить удаление' : 'Confirm deletion', exact: true }).click();
      await expect(topic).toContainText(ru ? 'Фраз: 0' : 'Phrases: 0');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await nav.evaluate(element => element.getBoundingClientRect().right > innerWidth)).toBe(false);
    await mkdir('../artifacts/premium-tab', { recursive: true });
    await page.screenshot({ path: `../artifacts/premium-tab/${language}-${layout}-${tier}.png` });
    await nav.getByRole('button', { name: ru ? 'Настройки' : 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: ru ? 'Настройки' : 'Settings', exact: true })).toBeVisible();
  });
}
