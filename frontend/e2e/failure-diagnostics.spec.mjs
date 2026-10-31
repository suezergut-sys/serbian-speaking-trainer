import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { installSyntheticMicrophone } from './flow.mjs';

for (const language of ['ru', 'en']) for (const layout of ['desktop', 'android']) {
  for (const kind of ['external_model', 'response_parse', 'response_return']) {
    test(`diagnostics ${kind} ${language} ${layout}`, async ({ page }) => {
      await page.setViewportSize({ width: layout === 'desktop' ? 1366 : 393, height: 850 });
      await installSyntheticMicrophone(page);
      await page.addInitScript(({ language, layout, storageKey }) => {
        if (layout === 'android') window.CapacitorCustomPlatform = { name: 'android' };
        localStorage.setItem('serbotalk.interface-language', language);
        localStorage.setItem(storageKey, JSON.stringify({ access_token: 'synthetic', refresh_token: 'synthetic', expires_at: 4102444800,
          token_type: 'bearer', user: { id: 'diagnostic-demo', aud: 'authenticated', role: 'authenticated', email: 'demo@example.invalid', app_metadata: {}, user_metadata: {} } }));
      }, { language, layout, storageKey: process.env.AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token' });
      const versions = { ru: 'Я хочу открыть счёт.', en: 'I want to open an account.', hints_ru: [], hints_en: [] };
      const topic = { id: 'bank', title_ru: 'В банке', title_en: 'At the bank', phrase_count: 1, is_custom: false };
      const attempts = [];
      let diagnosticId;
      await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        let body, status = 200;
        if (path === '/api/auth/me' || path === '/api/auth/me/android-premium') body = { id: 'diagnostic-demo', role: 'user', access_tier: 'premium', daily_usage: { used: 0, limit: 100 } };
        else if (path === '/api/topics') body = [topic];
        else if (path === '/api/auth/me/preferences') body = { assistance_enabled: false };
        else if (path === '/api/review-phrases/summary') body = { phrase_count: 0 };
        else if (path === '/api/sessions/start') body = { session: { id: 's1', requested_length: 10, topic: { ...topic, source: 'preset' } },
          exercise: { id: 'e1', session_id: 's1', source_ru: versions.ru, source_versions: versions, targeted_skills: [] } };
        else if (path === '/api/transcriptions') body = { text: 'Želim da otvorim račun.' };
        else if (path === '/api/attempts') {
          attempts.push(request.postDataJSON());
          diagnosticId = request.headers()['x-request-id'];
          expect(diagnosticId).toMatch(/^[0-9a-f-]{36}$/);
          status = kind === 'response_return' ? 500 : 503;
          body = { detail: { code: kind === 'response_return' ? 'result_return_failed' : 'analysis_unavailable', retryable: true,
            failure: { kind, stage: kind === 'external_model' ? 'provider_request' : kind === 'response_parse' ? 'grounding' : 'serialization',
              reason: kind === 'external_model' ? 'timeout' : kind === 'response_parse' ? 'non_lexical_correction' : 'serialization_failed', diagnostic_id: diagnosticId, retryable: true } } };
        } else throw new Error(`Unexpected path: ${path}`);
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
      await page.getByRole('button', { name: language === 'en' ? 'Answer aloud' : 'Ответить голосом', exact: true }).click();
      await page.getByRole('button', { name: language === 'en' ? 'Finish recording' : 'Завершить запись', exact: true }).click();
      const answer = page.getByRole('textbox', { name: language === 'en' ? 'Your answer' : 'Ваш ответ' });
      await expect(answer).toHaveValue('Želim da otvorim račun.');
      const submit = page.getByRole('button', { name: language === 'en' ? (layout === 'android' ? 'Check' : 'Check answer') : (layout === 'android' ? 'Проверить' : 'Проверить ответ'), exact: true });
      await submit.click();
      await expect(page.getByRole('alert')).toContainText(language === 'en' ? 'Diagnostic ID' : 'Код диагностики');
      await expect(page.getByRole('alert')).toContainText(diagnosticId);
      await expect(answer).toHaveValue('Želim da otvorim račun.');
      await expect(submit).toBeEnabled();
      expect(await page.locator('.exercise-scroll:visible').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await mkdir('../artifacts/failure-diagnostics', { recursive: true });
      await page.screenshot({ path: `../artifacts/failure-diagnostics/${kind}-${language}-${layout}.png` });
      await submit.click();
      await expect.poll(() => attempts.length).toBe(2);
      expect(attempts[1].client_request_id).toBe(attempts[0].client_request_id);
      expect(attempts[1].transcript_sr).toBe(attempts[0].transcript_sr);
    });
  }
}
