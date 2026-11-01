import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile']) {
  test(`manual payment ${language} ${layout}`, async ({ page }) => {
    const ru = language === 'ru';
    await page.setViewportSize({ width: layout === 'desktop' ? 1366 : layout === 'mobile' ? 320 : 393, height: 844 });
    await page.addInitScript(({ language, layout, storageKey }) => {
      if (layout === 'android') window.CapacitorCustomPlatform = { name: 'android' };
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(storageKey, JSON.stringify({ access_token: 'synthetic-only', refresh_token: 'synthetic-only', expires_at: 4102444800, token_type: 'bearer', user: { id: 'payment-user', email: 'payment@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }));
    }, { language, layout, storageKey: process.env.AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
    let payment, reports = 0, creates = 0;
    const options = { activation: { ru: 'Тестовые условия активации', en: 'Test activation terms' }, countries: { russia: ['sbp'], serbia: ['paypal'], other: ['paypal'] }, methods: { sbp: { available: true }, alta: { available: true, currencies: ['EUR', 'RSD'] }, paypal: { available: true } } };
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let body;
      if (path === '/api/auth/me') body = { id: 'payment-user', role: 'user', access_tier: payment?.status === 'awaiting_review' ? 'premium' : 'free', email: 'payment@example.invalid', assistance_enabled: false, daily_usage: { used: 0, limit: payment?.status === 'awaiting_review' ? 100 : 20, remaining: payment?.status === 'awaiting_review' ? 100 : 20 } };
      else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
      else if (path === '/api/topics') body = [{ id: 'bank', title_ru: 'В банке', description_ru: '', phrase_count: 20, is_custom: false, likely_intents: [], suggested_vocabulary: [] }];
      else if (path === '/api/custom-phrases') body = [];
      else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
      else if (path === '/api/sessions/start') body = { session: { id: 's1', status: 'active', requested_length: 10, topic: { id: 'bank', title_ru: 'В банке', source: 'preset' } }, exercise: { id: 'e1', source_ru: 'Я хочу открыть счёт.', word_hints: [], targeted_skills: [] } };
      else if (path === '/api/payments/options') body = options;
      else if (path === '/api/payments' && request.method() === 'GET') body = payment ? [payment] : [];
      else if (path === '/api/payments') {
        creates++;
        const { country, method, currency } = request.postDataJSON();
        payment = { id: `7K4M9${creates + 1}`, user_id: 'payment-user', country, method, status: 'awaiting_payment', activation: options.activation,
          details: { amount: method === 'sbp' ? '500.00' : method === 'alta' && currency === 'RSD' ? '600.00' : '5.00', currency: method === 'sbp' ? 'RUB' : currency ?? 'EUR', recipient: 'Synthetic Recipient',
            phone: method === 'sbp' ? '+70000000000' : null, bank: method === 'sbp' ? 'Synthetic Bank' : null, account: method === 'alta' ? `000-test-${currency}-account` : null, bank_details: method === 'alta' ? 'Synthetic bank details' : null,
            paypal: method === 'paypal' ? 'synthetic@example.invalid' : null, instructions: { ru: 'Тестовая инструкция', en: 'Test instruction' } } };
        body = payment;
      } else if (path.endsWith('/cancel')) { payment.status = 'cancelled'; body = payment; }
      else if (path.endsWith('/report')) { reports++; payment = { ...payment, ...request.postDataJSON(), status: 'awaiting_review', provisional_granted_at: '2026-10-26T12:00:00Z' }; body = payment; }
      else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    const nav = page.locator(layout === 'desktop' ? '.main-nav' : '.android-header nav');
    await nav.getByRole('button', { name: ru ? 'Премиум' : 'Premium', exact: true }).click();
    await page.getByRole('button', { name: ru ? 'КУПИТЬ' : 'BUY' }).click();
    const form = page.locator('.payment-form');
    const select = form.getByLabel(ru ? 'Из какой страны вы платите?' : 'Which country are you paying from?');
    await expect(select).toBeEnabled();
    await expect(select).toHaveValue('');
    await select.focus();
    await select.press('ArrowDown');
    await select.press('Enter');
    await expect(select).toHaveValue('russia');
    await expect(form.getByRole('button', { name: /СБП|SBP/ })).toBeVisible();
    await expect(form.getByRole('button', { name: /PayPal/ })).toHaveCount(0);
    await form.getByRole('button', { name: /СБП|SBP/ }).click();
    await expect(form.getByText('500.00 RUB', { exact: true })).toBeVisible();
    await expect(form.getByText('7K4M92', { exact: true })).toBeVisible();
    await form.getByText('7K4M92', { exact: true }).scrollIntoViewIfNeeded();
    await mkdir('../artifacts/short-payment-codes', { recursive: true });
    await page.screenshot({ path: `../artifacts/short-payment-codes/${language}-${layout}.png`, fullPage: true });
    await expect(form.getByText('+70000000000')).toBeVisible();
    await form.getByRole('button', { name: ru ? 'Копировать: Телефон получателя' : 'Copy: Recipient phone number' }).click();
    // Browser clipboard may require user permission: manual fallback must remain readable.
    await expect(form.locator('.payment-value').filter({ hasText: '+70000000000' }).getByRole('status')).not.toBeEmpty();
    await select.selectOption('serbia');
    await expect(form.getByText('+70000000000')).toHaveCount(0);
    await expect(form.getByRole('button', { name: /ALTA Banka|СБП|SBP/ })).toHaveCount(0);
    await form.getByRole('button', { name: /PayPal/ }).click();
    await select.selectOption('other');
    await expect(form.getByRole('button', { name: /ALTA Banka|СБП|SBP/ })).toHaveCount(0);
    await form.getByRole('button', { name: /PayPal/ }).click();
    await expect(form.getByText('synthetic@example.invalid')).toBeVisible();
    await expect(form.getByRole('link', { name: ru ? 'Перейти в PayPal' : 'Open PayPal' })).toHaveAttribute('href', 'https://www.paypal.com/');
    for (const image of await form.locator('.payment-logo img').all()) {
      expect(await image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      const bounds = await image.boundingBox();
      expect(bounds.height).toBeLessThanOrEqual(40);
    }
    await form.locator('input[type="datetime-local"]').fill('2026-10-25T12:34');
    await form.getByRole('spinbutton').fill('5.00');
    const inputStyle = await form.getByRole('spinbutton').evaluate(el => ({ color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
    expect(inputStyle.color).toBe('rgb(234, 242, 255)');
    expect(inputStyle.bg).not.toBe('rgb(255, 255, 255)');
    expect(await form.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await mkdir('../artifacts/manual-payments', { recursive: true });
    await page.screenshot({ path: `../artifacts/manual-payments/${language}-${layout}.png`, fullPage: true });
    await form.locator('.payment-methods').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../artifacts/manual-payments/${language}-${layout}-methods.png`, fullPage: true });
    await form.getByRole('button', { name: ru ? 'Я оплатил' : 'I have paid', exact: true }).click();
    await expect(page.getByText(/Администратор проверит|The administrator will verify/)).toBeVisible();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole('button', { name: ru ? 'Создать тему' : 'Create topic', exact: true })).toBeVisible();
    expect(reports).toBe(1);
    await page.screenshot({ path: `../artifacts/manual-payments/${language}-${layout}-granted.png`, fullPage: true });
    await page.reload();
    await nav.getByRole('button', { name: ru ? 'Премиум' : 'Premium', exact: true }).click();
    await expect(page.getByRole('button', { name: ru ? 'Создать тему' : 'Create topic', exact: true })).toBeVisible();
    expect(creates).toBe(3);
  });
}
