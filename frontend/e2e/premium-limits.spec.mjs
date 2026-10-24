import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
for (const language of ['ru', 'en']) for (const layout of ['desktop', 'mobile', 'android']) for (const kind of ['admin', 'premium']) {
  if (kind === 'admin' && layout === 'android') continue;
  test(`premium allowance ${language} ${layout} ${kind}`, async ({page}) => {
    const en = language === 'en';
    await page.setViewportSize({width: layout === 'desktop' ? 1366 : 393, height: 844});
    await page.addInitScript(({language,layout,key}) => {
      if (layout === 'android') window.CapacitorCustomPlatform = {name:'android'};
      localStorage.setItem('serbotalk.interface-language', language);
      localStorage.setItem(key, JSON.stringify({access_token:'synthetic-only',refresh_token:'synthetic-only',expires_at:4102444800,token_type:'bearer',user:{id:'limit-user',email:'test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));
    }, {language,layout,key:process.env.LAYOUT_AUTH_STORAGE_KEY ?? 'sb-e2e-auth-auth-token'});
    await page.route('**/api/**', async route => {
      const path=new URL(route.request().url()).pathname;
      let body;
      if(path==='/api/auth/me') body={id:'limit-user',email:'test@example.invalid',role:kind==='admin'?'admin':'user',access_tier:'premium',daily_usage:{used:99,limit:kind==='admin'?null:100,remaining:kind==='admin'?null:1,resets_at:'2026-10-25T00:00:00Z'}};
      else if(path==='/api/auth/me/preferences') body={assistance_enabled:false};
      else if(path==='/api/topics') body=[];
      else if(path==='/api/review-phrases/summary') body={phrase_count:0};
      else if(path==='/api/admin/users') body=[
        {id:'p',email:'premium@example.invalid',role:'user',access_tier:'premium',phrases_today:99,daily_limit:100,registered_at:'2026-10-01',last_active_at:'2026-10-24'},
        {id:'f',email:'free@example.invalid',role:'user',access_tier:'free',phrases_today:3,daily_limit:20,registered_at:'2026-10-01',last_active_at:'2026-10-24'},
        {id:'a',email:'admin@example.invalid',role:'admin',access_tier:'premium',phrases_today:12,daily_limit:null,registered_at:'2026-10-01',last_active_at:'2026-10-24'}];
      else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(process.env.TRAINER_PAGE_PATH ?? '/');
    if(kind==='admin') {
      if(layout==='mobile') await page.getByRole('button',{name:en?'Settings':'Настройки',exact:true}).click();
      await page.getByRole('button',{name:en?'Users':'Пользователи',exact:true}).click();
      const row=page.getByRole('row').filter({hasText:'premium@example.invalid'});
      await expect(row.getByText(en?'Premium user':'Премиум пользователь',{exact:true})).toBeVisible();
      await expect(row.getByText('99 / 100',{exact:true})).toBeVisible();
      await expect(row.getByText(/unlimited|без лимита/)).toHaveCount(0);
      await expect(page.getByText('3 / 20',{exact:true})).toBeVisible();
      await expect(page.getByText(en?'12 · unlimited':'12 · без лимита',{exact:true})).toBeVisible();
    } else {
      await page.getByRole('button',{name:en?'Settings':'Настройки',exact:true}).click();
      await expect(page.getByText(en?'1 of 100 phrases remaining':'1 из 100 фраз осталось',{exact:true})).toBeVisible();
      await expect(page.getByText(/unlimited|без лимита/)).toHaveCount(0);
    }
    await mkdir('../artifacts/premium-limits',{recursive:true});
    await page.screenshot({path:`../artifacts/premium-limits/${language}-${layout}-${kind}.png`});
  });
}
