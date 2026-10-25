import {expect,test} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
for(const initial of ['ru','en']) for(const layout of ['desktop','mobile','android']) {
 test(`bilingual topic ${initial} ${layout}`,async({page})=>{
  let language=initial;
  const label=(ru,en)=>language==='ru'?ru:en;
  const title=()=>label('Мои путешествия','My travels');
  await page.setViewportSize({width:layout==='desktop'?1366:layout==='mobile'?320:393,height:844});
  await page.addInitScript(({initial,layout,key})=>{
   if(layout==='android') window.CapacitorCustomPlatform={name:'android'};
   if (!localStorage.getItem('serbotalk.interface-language')) localStorage.setItem('serbotalk.interface-language',initial);
   localStorage.setItem(key,JSON.stringify({access_token:'synthetic-only',refresh_token:'synthetic-only',token_type:'bearer',expires_at:4102444800,user:{id:'titles-user',email:'title@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));
  },{initial,layout,key:process.env.LAYOUT_AUTH_STORAGE_KEY??'sb-e2e-auth-auth-token'});
  const preset={id:'bank',title_ru:'Банк',is_custom:false,description_ru:'',phrase_count:1,likely_intents:[],suggested_vocabulary:[]};
  const topics=[preset,{...preset,id:'custom-legacy',title_ru:'Старая тема',title_en:null,is_custom:true,phrase_count:0,custom_phrase_count:0}];
  let saves=0,hasPhrase=false;
  const prepared={preparation_id:'12345678-1234-1234-1234-123456789012',source_ru:'Моя новая фраза.',canonical_sr:'Moja nova fraza.',intended_sr_variants:['Moja nova fraza.'],word_hints:[]};
  await page.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),path=url.pathname;let body;
   if(path==='/api/auth/me') body={id:'titles-user',email:'title@example.invalid',role:'user',access_tier:'premium',daily_usage:{used:0,limit:100,remaining:100,resets_at:'2026-10-26T00:00:00Z'}};
   else if(path==='/api/auth/me/preferences') body={assistance_enabled:false};
   else if(path==='/api/topics'&&request.method()==='POST') {
    expect(request.postDataJSON().title_ru).toBe(initial==='ru'?'Мои путешествия':'My travels');
    expect(request.headers()['x-interface-language']).toBe(initial);
    if(++saves===1) {await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:{code:'topic_translation_unavailable'}})});return;}
    body={...preset,id:'custom-new',title_ru:'Мои путешествия',title_en:'My travels',is_custom:true,phrase_count:0,custom_phrase_count:0};topics.push(body);
   } else if(path==='/api/topics') body=topics;
   else if(path==='/api/review-phrases/summary') body={phrase_count:hasPhrase?1:0};
   else if(path==='/api/custom-phrases') body=hasPhrase?[{id:'p1',...prepared,topic_id:'custom-new',topic_title:'Мои путешествия',status:'active'}]:[];
   else if(path==='/api/review-phrases/prepare') body=prepared;
   else if(path==='/api/review-phrases'&&request.method()==='POST') {hasPhrase=true;topics[2].phrase_count=1;topics[2].custom_phrase_count=1;body={id:'p1',...prepared,topic_id:'custom-new'};}
   else if(path==='/api/sessions/start') {const topic=topics.find(t=>t.id===request.postDataJSON().topic_id)??preset;body={session:{id:'s1',status:'active',requested_length:10,topic:{...topic,source:topic.is_custom?'custom':'preset'}},exercise:{id:'e1',source_ru:'Моя новая фраза.',topic_id:topic.id,topic_title_ru:topic.title_ru,word_hints:[],targeted_skills:[]}};}
   else if(path==='/api/statistics/monthly') body={month:url.searchParams.get('month'),active_days:0,total_phrases:0,total_translations:0,correct_translations:0,mastered_phrases:0,days:[]};
   else if(path==='/api/statistics/phrase-topics') body=[{topic_id:'custom-new',topic_title:'Мои путешествия',topic_title_en:'My travels',phrase_count:1}];
   else if(path==='/api/statistics/phrases') body={total:1,page:1,page_size:'20',total_pages:1,groups:[{topic_id:'custom-new',topic_title:'Мои путешествия',topic_title_en:'My travels',phrases:[{id:'p1',source_ru:prepared.source_ru,target_sr:prepared.canonical_sr,attempts:1,status:'learning',next_review_at:null}]}]};
   else throw new Error(`Unexpected API ${path}`);
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(process.env.TRAINER_PAGE_PATH??'/');
  const nav=page.locator(layout==='desktop'?'.main-nav':'.android-header nav');
  await nav.getByRole('button',{name:label('Премиум','Premium'),exact:true}).click();
  const premium=page.locator('.premium-page');
  await premium.getByRole('button',{name:label('Создать тему','Create topic'),exact:true}).click();
  await premium.getByLabel(label('Название темы','Topic name')).fill(title());
  await premium.getByRole('button',{name:label('Сохранить тему','Save topic'),exact:true}).click();
  await expect(premium.getByRole('alert')).toBeVisible();
  await expect(premium.getByRole('textbox')).toHaveValue(title());
  await premium.getByRole('button',{name:label('Сохранить тему','Save topic'),exact:true}).click();
  await expect(premium.getByText(label('Тема сохранена.','Topic saved.'),{exact:true})).toBeVisible();
  await premium.getByRole('button',{name:label('Закрыть','Close'),exact:true}).click();
  await premium.getByRole('button',{name:label('Создать фразу','Create phrase'),exact:true}).click();
  const select=premium.getByRole('combobox');
  await expect(select).toContainText(title());await select.selectOption('custom-new');
  await premium.getByRole('textbox').fill(prepared.source_ru);
  await premium.getByRole('button',{name:label('Подготовить перевод','Prepare translation'),exact:true}).click();
  await premium.getByRole('button',{name:label('Сохранить фразу','Save phrase'),exact:true}).click();
  await expect(premium.getByText(label('Фраза сохранена.','Phrase saved.'),{exact:true})).toBeVisible();
  await premium.getByRole('button',{name:label('Закрыть','Close'),exact:true}).click();
  await nav.getByRole('button',{name:label('Настройки','Settings'),exact:true}).click();
  await page.getByRole('radio',{name:initial==='ru'?'English':'Русский',exact:true}).check();language=initial==='ru'?'en':'ru';
  const home=()=>nav.getByRole('button',{name:layout==='desktop'?label('Практика','Practice'):label('Темы','Topics'),exact:true}).click();
  await home();
  const grid=page.locator(layout==='desktop'?'.desktop-topic-grid':'.android-topic-list');
  await expect(grid.getByRole('button',{name:new RegExp(title())})).toBeVisible();
  await expect(grid.getByRole('button',{name:/Старая тема/})).toBeVisible();
  await page.reload();if(layout==='mobile')await home();
  await expect(grid.getByRole('button',{name:new RegExp(title())})).toBeVisible();
  await grid.getByRole('button',{name:new RegExp(title())}).click();
  await expect(page.locator('.exercise-topic')).toHaveText(title());
  await nav.getByRole('button',{name:label('Статистика','Statistics'),exact:true}).click();
  await page.getByRole('button',{name:label('Фразы по темам →','Phrases by topic →'),exact:true}).click();
  await expect(page.getByRole('heading',{name:title(),exact:true})).toBeVisible();
  await nav.getByRole('button',{name:label('Премиум','Premium'),exact:true}).click();
  await expect(premium.getByRole('button',{name:new RegExp(title())})).toBeVisible();
  await mkdir('../artifacts/bilingual-topics',{recursive:true});await page.screenshot({path:`../artifacts/bilingual-topics/${initial}-${layout}.png`});
  expect(saves).toBe(2);
 });
}
