import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'android']) {
  test(`administrator custom content ${language} ${layout}`, async ({ page }) => {
    await page.setViewportSize({ width: layout === 'desktop' ? 1366 : 390, height: 844 });
    await page.addInitScript(({ language, layout, storageKey }) => {
      if (layout === 'android') window.CapacitorCustomPlatform = { name: 'android' };
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'e2e-only', refresh_token: 'e2e-only', expires_at: 4102444800, token_type: 'bearer', user: { id: 'custom-admin', email: 'admin@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }));
    }, { language, layout, storageKey: process.env.LAYOUT_AUTH_STORAGE_KEY ?? "sb-e2e-auth-auth-token" });
    const topics = [{ id: 'bank', title_ru: 'В банке', description_ru: '', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] }];
    const prepared = { preparation_id: '12345678-1234-1234-1234-123456789012', source_ru: 'Я скоро вернусь.', canonical_sr: 'Uskoro se vraćam.', intended_sr_variants: ['Uskoro se vraćam.'], word_hints: [] };
    let saved = false;
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'custom-admin', role: 'admin', access_tier: 'free', email: 'admin@example.invalid', assistance_enabled: false, daily_usage: { used: 0, limit: null, remaining: null } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics' && request.method() === 'POST') {
        body = { ...topics[0], id: 'custom-test', title_ru: request.postDataJSON().title_ru, phrase_count: 0, is_custom: true };
        topics.push(body);
      } else if (path === '/api/topics') body = topics;
      else if (path === '/api/review-phrases/summary') body = { phrase_count: saved ? 1 : 0 };
      else if (path === '/api/custom-phrases') body = saved ? [{ id: 'phrase-1', ...prepared, topic_id: 'custom-test', topic_title: 'Моя тема', status: 'active' }] : [];
      else if (path === '/api/custom-phrases/phrase-1' && request.method() === 'DELETE') { saved = false; topics[1].phrase_count = 0; topics[1].custom_phrase_count = 0; await route.fulfill({ status: 204 }); return; }
      else if (path === '/api/topics/custom-test' && request.method() === 'DELETE') { topics.splice(1, 1); saved = false; await route.fulfill({ status: 204 }); return; }
      else if (path === '/api/review-phrases/prepare') body = prepared;
      else if (path === '/api/review-phrases' && request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ preparation_id: prepared.preparation_id, topic_id: 'custom-test' });
        topics[1].phrase_count = 1; topics[1].custom_phrase_count = 1; saved = true; body = { id: 'phrase-1', ...prepared, topic_id: 'custom-test', status: 'active' };
      } else if (path === '/api/sessions/start') body = { session: { id: 's1', status: 'active', requested_length: 10, topic: { id: 'bank', title_ru: 'В банке', source: 'preset' } }, exercise: { id: 'e1', source_ru: 'Я хочу открыть счёт.', word_hints: [], targeted_skills: [] } };
      else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    if (layout === 'mobile') await page.getByRole('button', { name: language === 'ru' ? 'Темы' : 'Topics', exact: true }).click();
    const addTopic = page.getByRole('button', { name: language === 'ru' ? '+ добавить тему' : '+ add topic', exact: true });
    await expect(addTopic).toBeEnabled();
    await addTopic.click();
    await page.getByLabel(language === 'ru' ? 'Название темы' : 'Topic name').fill('Моя тема');
    await page.getByRole('button', { name: language === 'ru' ? 'Сохранить тему' : 'Save topic', exact: true }).click();
    await expect(page.getByText(language === 'ru' ? 'Тема сохранена.' : 'Topic saved.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: language === 'ru' ? 'Закрыть' : 'Close', exact: true }).click();
    await page.getByRole('button', { name: language === 'ru' ? '+ добавить фразу' : '+ add phrase', exact: true }).click();
    await page.getByLabel(language === 'ru' ? 'Фраза на русском языке' : 'Phrase in Russian').fill(prepared.source_ru);
    await page.getByRole('button', { name: language === 'ru' ? 'Подготовить перевод' : 'Prepare translation', exact: true }).click();
    await expect(page.getByText(prepared.canonical_sr, { exact: true })).toBeVisible();
    await page.getByRole('combobox').selectOption('custom-test');
    const form = page.locator('.custom-content-form');
    for (const control of await form.locator('input, select, button').all()) {
      await expect(control).toHaveCSS('color', 'rgb(234, 242, 255)');
      expect(await control.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    }
    expect(await form.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await mkdir('../artifacts/custom-content', { recursive: true });
    await page.screenshot({ path: `../artifacts/custom-content/${language}-${layout}.png` });
    await page.getByRole('button', { name: language === 'ru' ? 'Сохранить фразу' : 'Save phrase', exact: true }).click();
    await expect(page.getByText(language === 'ru' ? 'Фраза сохранена.' : 'Phrase saved.', { exact: true })).toBeVisible();
    expect(saved).toBe(true);
    await expect(page.getByRole('button', { name: /Моя тема/ })).toContainText('1');
    await page.getByRole('button', { name: language === 'ru' ? 'Удалить свои фразы или темы' : 'Delete your phrases or topics', exact: true }).click();
    await expect(page.locator('.custom-content-manager').getByText(prepared.source_ru, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: language === 'ru' ? 'Удалить фразу' : 'Delete phrase', exact: true }).click();
    await page.getByRole('button', { name: language === 'ru' ? 'Отмена' : 'Cancel', exact: true }).click();
    expect(saved).toBe(true);
    await page.getByRole('button', { name: language === 'ru' ? 'Удалить фразу' : 'Delete phrase', exact: true }).click();
    await page.getByRole('button', { name: language === 'ru' ? 'Подтвердить удаление' : 'Confirm deletion', exact: true }).click();
    await expect(page.getByText(language === 'ru' ? 'Фраза удалена.' : 'Phrase deleted.', { exact: true })).toBeVisible();
    expect(saved).toBe(false);
    await page.getByRole('button', { name: language === 'ru' ? 'Удалить тему' : 'Delete topic', exact: true }).click();
    await expect(page.getByText(language === 'ru' ? 'Удалить тему и все её фразы?' : 'Delete the topic and all its phrases?', { exact: true })).toBeVisible();
    await page.locator('.custom-content-confirmation').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../artifacts/custom-content/${language}-${layout}-delete.png` });
    await page.getByRole('button', { name: language === 'ru' ? 'Подтвердить удаление' : 'Confirm deletion', exact: true }).click();
    await expect(page.getByText(language === 'ru' ? 'Тема и все её фразы удалены.' : 'The topic and all its phrases have been deleted.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Моя тема/ })).toHaveCount(0);
  });
}
