import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'narrow', 'android']) {
  test(`account settings ${language} ${layout}`, async ({ page }) => {
    const en = language === 'en';
    await page.setViewportSize({ width: layout === 'desktop' ? 1366 : layout === 'narrow' ? 320 : 393, height: 900 });
    if (layout === 'android') await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
    await page.addInitScript(({ language, storageKey }) => {
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'e2e-local-only', refresh_token: 'e2e-local-only', token_type: 'bearer', expires_at: 4102444800, user: { id: 'settings-user', aud: 'authenticated', role: 'authenticated', email: 'learner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }));
    }, { language, storageKey: process.env.SETTINGS_AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
    let debugChanges = 0;
    let selectedModel = null;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body, status = 200;
      if (path === '/api/auth/me') body = { id: 'settings-user', email: 'maxim.sumin.long.address@example.invalid', display_name: 'Maksim Sumin', role: 'admin', can_debug_models: true, access_tier: 'free', daily_usage: { used: 4, limit: null, remaining: null, resets_at: '2026-10-16T00:00:00Z' } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [];
      else if (path === '/api/custom-phrases') body = [];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/admin/model-debug/transcription') {
        if (route.request().method() === 'PATCH') selectedModel = route.request().postDataJSON().model;
        body = { selected_model: selectedModel, effective_model: selectedModel ?? 'env-default', default_model: 'env-default', options: ['env-default', 'env-alternative'] };
      }
      else if (path === '/api/admin/model-debug') {
        if (route.request().method() === 'PATCH') {
          if (++debugChanges === 1) { status = 503; body = {}; }
          else body = { enabled: false };
        } else body = { enabled: true };
      } else throw new Error(`Unexpected API: ${path}`);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.TESTLAB_BASE_URL ? new URL(process.env.TESTLAB_BASE_URL).pathname : '/');
    await page.getByRole('button', { name: en ? 'Settings' : 'Настройки', exact: true }).click();
    const settings = page.locator('.settings-page');
    const languages = settings.locator('.language-settings');
    await expect(languages.locator('.settings-icon--ru svg')).toBeVisible();
    await expect(languages.locator('.settings-icon--en svg')).toBeVisible();
    const choices = languages.locator('.settings-choice');
    const firstChoice = await choices.nth(0).boundingBox();
    const secondChoice = await choices.nth(1).boundingBox();
    expect(Math.abs(firstChoice.y - secondChoice.y)).toBeLessThan(2);
    expect(secondChoice.x).toBeGreaterThan(firstChoice.x);
    // Hidden native radios retain keyboard selection and the selected card ring.
    await languages.getByRole('radio', { name: en ? 'English' : 'Русский', exact: true }).focus();
    await page.keyboard.press(en ? 'ArrowLeft' : 'ArrowRight');
    await expect(settings.getByRole('heading', { name: en ? 'Настройки' : 'Settings', exact: true })).toBeVisible();
    await page.keyboard.press(en ? 'ArrowRight' : 'ArrowLeft');
    await expect(settings.getByRole('heading', { name: en ? 'Settings' : 'Настройки', exact: true })).toBeVisible();
    const alphabet = settings.getByRole('radio', { name: en ? /Cyrillic/ : /Кириллица/ });
    await alphabet.locator('..').click();
    await expect(alphabet).toBeChecked();
    await expect(settings.locator('.settings-icon--bell svg')).toBeVisible();
    await expect(settings.locator('.settings-icon--celebrate svg')).toBeVisible();
    const sounds = settings.getByRole('switch', { name: en ? 'Success sounds' : 'Звуки успеха' });
    const soundsBefore = await sounds.isChecked();
    await sounds.click();
    expect(await sounds.isChecked()).toBe(!soundsBefore);
    await sounds.click();
    const logo = settings.locator('.settings-icon--openai img');
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    for (const card of await settings.locator('.settings-card').all()) {
      expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    const actionBoxes = await settings.locator('.share-app-settings__actions > *').evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
    expect(Math.abs(actionBoxes[0].y - actionBoxes[1].y)).toBeLessThan(2);
    if (layout === 'desktop') expect(Math.abs(actionBoxes[1].y - actionBoxes[2].y)).toBeLessThan(2);
    else expect(actionBoxes[2].y).toBeGreaterThan(actionBoxes[1].y);
    await mkdir('../artifacts/settings-cards', { recursive: true });
    await settings.screenshot({ path: `../artifacts/settings-cards/${language}-${layout}.png` });
    const account = page.getByRole('region', { name: en ? 'Account' : 'Аккаунт', exact: true });
    await expect(account.getByText('Maksim Sumin')).toBeVisible();
    await expect(account.getByText('maxim.sumin.long.address@example.invalid')).toBeVisible();
    await expect(account.getByText(en ? '4 phrases · unlimited' : '4 фраз · без лимита')).toBeVisible();
    const experiment = page.getByRole('region', { name: en ? 'Experiment: speech recognition' : 'Эксперимент: распознавание речи' });
    const modelSelect = experiment.getByRole('combobox', { name: en ? 'Transcription model' : 'Модель распознавания' });
    await expect(modelSelect).toBeEnabled();
    await modelSelect.selectOption('env-alternative');
    await expect(modelSelect).toHaveValue('env-alternative');
    await expect(modelSelect).toBeEnabled();
    await expect(modelSelect).toHaveCSS('color', 'rgb(234, 242, 255)');
    expect(await experiment.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await mkdir('../artifacts/transcription-models', { recursive: true });
    await experiment.screenshot({ path: `../artifacts/transcription-models/${language}-${layout}.png` });
    await modelSelect.selectOption('');
    await expect(modelSelect).toHaveValue('');
    await expect(modelSelect).toBeEnabled();
    await expect(account.getByRole('link')).toHaveCount(0);
    const deletion = page.getByRole('region', { name: en ? 'Account deletion' : 'Удаление аккаунта', exact: true });
    await expect(deletion.getByRole('link')).toHaveAttribute('href', '/delete-account');
    expect(await account.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const name = account.getByText('Maksim Sumin');
    expect(await name.evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(44);
    const signOut = account.getByRole('button', { name: en ? 'Sign out' : 'Выйти' });
    await expect(signOut).toHaveCSS('color', 'rgb(234, 242, 255)');
    if (layout !== 'desktop') {
      const profileBox = await account.locator('.profile').boundingBox();
      expect((await signOut.boundingBox()).y).toBeGreaterThanOrEqual(profileBox.y + profileBox.height);
    }
    await expect(page.getByText(/По умолчанию выключено|Off by default|Через 7 дней|After 7 days|Ключи доступа не сохраняются|Access keys are not stored/)).toHaveCount(0);
    const debug = page.getByRole('region', { name: en ? 'Debug mode' : 'Режим отладки', exact: true });
    const toggle = debug.getByRole('switch');
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeEnabled();
    await expect(debug.getByText(en ? /last 20 audio recordings/ : /последние 20 аудиозаписей/)).toBeVisible();
    await mkdir('../artifacts/settings-account', { recursive: true });
    await account.screenshot({ path: `../artifacts/settings-account/${language}-${layout}-account.png` });
    await deletion.screenshot({ path: `../artifacts/settings-account/${language}-${layout}-deletion.png` });
    await debug.screenshot({ path: `../artifacts/settings-account/${language}-${layout}-debug.png` });
    await toggle.click();
    await expect(debug.getByRole('alert')).toBeVisible();
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  });
}
