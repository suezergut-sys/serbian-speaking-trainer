import { _android, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loginTestlab, installSyntheticMicrophone } from './flow.mjs';
import { createRadioGuard, requireApkVersion, restoreMicrophonePermission } from './android-resilience-utils.mjs';
import { installAndroidFixtureTransport } from './android-fixture-transport.mjs';
import { resetAndroidFixtureSession } from './android-fixture-session.mjs';
const pkg='com.serbiantalk.trainer.testlab';
const inputMode=process.env.TESTLAB_ANDROID_INPUT ?? 'native';
if(!['native','webview'].includes(inputMode))throw Error('Input mode must be native or webview');
const offlineHoldSeconds=Number(process.env.TESTLAB_OFFLINE_HOLD_SECONDS ?? 120);
if(!Number.isInteger(offlineHoldSeconds)||offlineHoldSeconds<30||offlineHoldSeconds>300||offlineHoldSeconds%30)throw Error('Offline hold must be 30..300 seconds in 30-second steps');
const device=(await _android.devices({omitDriverInstall:process.env.TESTLAB_ANDROID_OMIT_DRIVER_INSTALL==='1'})).find(d=>d.serial()===(process.env.TESTLAB_ANDROID_SERIAL ?? 'emulator-5554'));
if(!device) throw Error('Expected Android test device unavailable');
device.setDefaultTimeout(30000);
let page, stage='launch', radios, originalPermission, transport;
const releases=[];
const report={variant:'lab',syntheticAudio:true,inputMode};
const attempts=[]; let wifi, data;
try {
  report.apkVersion=requireApkVersion((await device.shell(`dumpsys package ${pkg}`)).toString(),process.env.TESTLAB_ANDROID_VERSION ?? '1.17');
  wifi=(await device.shell('settings get global wifi_on')).toString().trim();
  data=(await device.shell('settings get global mobile_data')).toString().trim();
  console.log('Android: launching lab');
  await device.shell(`am force-stop ${pkg}`);await device.shell(`monkey -p ${pkg} 1`);
  const webView=await device.webView({pkg},{timeout:30000});
  page=await webView.page();
  page.setDefaultTimeout(30_000);page.setDefaultNavigationTimeout(30_000);
  transport=await installAndroidFixtureTransport(page);
  await resetAndroidFixtureSession(page,webView);
  report.fixtureTransport=transport.hostProxy?'host-proxy':'direct';
  if(!transport.hostProxy)radios=createRadioGuard(command=>device.shell(command),wifi,data);
  console.log('Android: lab WebView attached');
  await installSyntheticMicrophone(page);
  stage='fixture login';
  await loginTestlab(page,null);
  await page.evaluate(async()=>{
    window.__nativeCycles={inactive:0,active:0};
    await window.Capacitor.Plugins.App.addListener('appStateChange',({isActive})=>{
      window.__nativeCycles[isActive?'active':'inactive']++;
    });
  });
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/attempts') attempts.push(r.postDataJSON());});
  stage='start topic';
  await page.getByRole('button',{name:/Собеседование/}).first().click();
  stage='initial synthetic recording';
  await record();
  const answer=page.getByLabel('Ваш ответ');const draft='Sačuvaj moj odgovor.';
  await answer.fill(draft);await closeKeyboard();
  const phrase=page.locator('.android-training-page .interactive-phrase');const originalPhrase=await phrase.getAttribute('aria-label');
  stage='offline';
  if(transport.hostProxy)transport.setOffline(true);else await radios.disable();
  const offline=await page.evaluate(async()=>{try{return (await fetch('http://10.0.2.2:8765/api/health',{signal:AbortSignal.timeout(3000)})).ok;}catch{return false;}});
  if(offline) throw Error('Radio disable did not disconnect backend');
  await tap(page.getByRole('button',{name:'Проверить',exact:true}));
  await expect(page.getByRole('alert')).toBeVisible({timeout:40000});
  await expect(answer).toHaveValue(draft);await expect(phrase).toHaveAttribute('aria-label',originalPhrase);
  await expect(page.getByRole('button',{name:'Проверить',exact:true})).toBeEnabled();
  // Direct mode checks actual radios; host-proxy mode injects a fixture transport outage.
  await device.shell('input keyevent KEYCODE_HOME');
  for(let elapsed=0;elapsed<offlineHoldSeconds;elapsed+=30){await new Promise(resolve=>setTimeout(resolve,30000));console.log(`Android: ${transport.hostProxy?'fixture transport':'radios'} remain offline ${elapsed+30}s`);}
  await device.shell(`monkey -p ${pkg} 1`);await expect(answer).toHaveValue(draft);
  if(transport.hostProxy)transport.setOffline(false);else await radios.restore();
  await expect.poll(()=>page.evaluate(async()=>{try{return (await fetch('http://10.0.2.2:8765/api/health',{signal:AbortSignal.timeout(3000)})).ok;}catch{return false;}}),{timeout:30000}).toBe(true);
  await tap(page.getByRole('button',{name:'Проверить',exact:true}));
  await expect(page.locator('.android-training-page .feedback')).toBeVisible();
  if(attempts.length!==2 || attempts[0].client_request_id!==attempts[1].client_request_id || attempts[0].transcript_sr!==attempts[1].transcript_sr) throw Error('Retry request identity changed');
  report.deviceNetworkRetry={radioDisabled:!transport.hostProxy,simulatedTransportFailure:transport.hostProxy,offlineHoldSeconds,draftPreserved:true,sameAttemptRequest:true};
  console.log(`Android: ${transport.hostProxy?'fixture transport outage':'device offline'}/retry passed`);
  await tap(page.getByRole('button',{name:'Следующая',exact:true}));
  await expect(phrase).not.toHaveAttribute('aria-label',originalPhrase);
  stage='keyboard and swipe';
  await record();await tap(answer);await answer.fill('Tekst sa tastaturom.');
  if(inputMode==='native')await expect.poll(imeVisible,{timeout:15000}).toBe(true);
  const viewportWithKeyboard=await page.evaluate(()=>window.visualViewport.height);
  await closeKeyboard();
  await expect.poll(()=>page.evaluate(()=>window.visualViewport.height),{timeout:10000}).toBeGreaterThanOrEqual(viewportWithKeyboard);
  await tap(page.getByRole('button',{name:'Настройки',exact:true}));
  await expect(page.getByRole('heading',{name:'Настройки',exact:true})).toBeInViewport();
  if(inputMode==='native')await device.input.press('Back');
  else await tap(page.getByRole('button',{name:'Тренировка',exact:true}));
  await expect(page.getByRole('button',{name:'Тренировка',exact:true})).toHaveAttribute('aria-current','page');
  await tap(page.getByRole('button',{name:'Статистика',exact:true}));
  await expect(page.getByRole('button',{name:'Статистика',exact:true})).toHaveAttribute('aria-current','page');
  if(inputMode==='native')await device.input.press('Back');
  else await tap(page.getByRole('button',{name:'Тренировка',exact:true}));
  await expect(page.getByRole('button',{name:'Тренировка',exact:true})).toHaveAttribute('aria-current','page');
  await tap(page.getByRole('button',{name:'Темы',exact:true}));
  await expect(page.getByRole('button',{name:'Темы',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.locator('.android-topics-page')).toBeInViewport();
  await tap(page.getByRole('button',{name:'Тренировка',exact:true}));
  await expect(answer).toHaveValue('Tekst sa tastaturom.');
  // Native swipe right from practice to topics (same pager direction as the home destination).
  if(inputMode==='native'){
    const {bounds}=await device.info({clazz:'android.webkit.WebView',pkg});
    await device.input.swipe({x:bounds.x+Math.round(bounds.width*.2),y:bounds.y+Math.round(bounds.height*.35)},[{x:bounds.x+Math.round(bounds.width*.85),y:bounds.y+Math.round(bounds.height*.35)}],30);
  }else await page.getByRole('button',{name:'Темы',exact:true}).click();
  await expect(page.getByRole('button',{name:'Темы',exact:true})).toHaveAttribute('aria-current','page');
  await tap(page.getByRole('button',{name:'Тренировка',exact:true}));await expect(answer).toHaveValue('Tekst sa tastaturom.');
  report.keyboardAndNavigation={draftPreserved:true,realSwipe:inputMode==='native',nativeImeBack:inputMode==='native',settingsStatsBack:inputMode==='native',homeOpensTopics:true,submitReachable:true};
  console.log('Android: keyboard/pager passed');
  stage='background during microphone connection';
  await page.evaluate(()=>{
    window.__originalFixtureMicrophone=navigator.mediaDevices.getUserMedia;
    window.__lateTrackStops=0;
    navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{
      window.__releaseFixtureMicrophone=()=>resolve({getTracks:()=>[{stop(){window.__lateTrackStops++;}}]});
    });
  });
  await page.getByRole('button',{name:'Ответить голосом',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.__releaseFixtureMicrophone))).toBe(true);
  await backgroundResume();
  await page.evaluate(()=>window.__releaseFixtureMicrophone());
  await expect.poll(()=>page.evaluate(()=>window.__lateTrackStops)).toBe(1);
  await expect(answer).toHaveValue('Tekst sa tastaturom.');
  await expect(page.getByRole('button',{name:'Завершить запись',exact:true})).toHaveCount(0);
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=window.__originalFixtureMicrophone;});
  report.connecting={nativeHomeResume:true,lateTrackReleased:true,draftPreserved:true};
  stage='background during transcription';
  let releaseTranscript;let transcriptEntered=false;
  const transcriptGate=new Promise(resolve=>{releaseTranscript=resolve;});
  releases.push(()=>releaseTranscript());
  await page.route('**/api/transcriptions',async route=>{
    transcriptEntered=true;await transcriptGate;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({transcript_sr:'Kasni odgovor.',timings:{}})}).catch(()=>{});
  });
  await page.getByRole('button',{name:'Ответить голосом',exact:true}).click();
  await page.getByRole('button',{name:'Завершить запись',exact:true}).click();
  await expect.poll(()=>transcriptEntered).toBe(true);
  await backgroundResume();releaseTranscript();
  await page.unrouteAll({behavior:'wait'});
  transport=await installAndroidFixtureTransport(page);
  await expect(answer).toHaveValue('Tekst sa tastaturom.');
  await expect(page.getByRole('button',{name:'Ответить голосом',exact:true})).toBeEnabled();
  report.transcription={nativeHomeResume:true,lateResponseIgnored:true,draftPreserved:true};
  console.log('Android: connecting/STT interruptions passed');
  stage='oversize synthetic upload';
  await page.evaluate(()=>{
    const Original=window.MediaRecorder;
    window.__beforeOversizeRecorder=Original;
    window.MediaRecorder=class extends Original {
      stop(){this.state='inactive';this.dispatchEvent(new BlobEvent('dataavailable',{data:new Blob([new Uint8Array(1000001)],{type:'audio/webm'})}));this.dispatchEvent(new Event('stop'));}
    };
  });
  let transcriptionStatus;
  page.on('response',r=>{if(new URL(r.url()).pathname==='/api/transcriptions') transcriptionStatus=r.status();});
  await page.getByRole('button',{name:'Ответить голосом',exact:true}).click();await page.getByRole('button',{name:'Завершить запись',exact:true}).click();
  await expect.poll(()=>transcriptionStatus).toBe(413);
  await expect(answer).toHaveValue('Tekst sa tastaturom.');
  await expect(page.getByRole('button',{name:'Проверить',exact:true})).toBeEnabled();
  report.sizeLimit={syntheticBytes:1000001,status:413,draftPreserved:true};
  await page.evaluate(()=>{window.MediaRecorder=window.__beforeOversizeRecorder;});
  console.log('Android: oversized recording recovery passed');
  stage='background during grading';
  let releaseGrade;let gradeEntered=false;let gradeResponse;
  const gradeGate=new Promise(resolve=>{releaseGrade=resolve;});releases.push(()=>releaseGrade());
  const beforeGrade=attempts.length;
  await page.route('**/api/attempts',async route=>{
    try{
      // Android WebView cannot use route.fetch's browser-cookie management.
      // Forward only this local fixture request in memory through Node fetch.
      const request=route.request(),url=new URL(request.url());
      if(url.hostname!=='10.0.2.2'||url.port!=='8765')throw Error('Expected local fixture API');
      url.hostname='127.0.0.1';
      const response=await fetch(url,{method:request.method(),headers:request.headers(),body:request.postData(),signal:AbortSignal.timeout(30000)});
      const body=await response.text();gradeResponse=JSON.parse(body);gradeEntered=true;await gradeGate;
      await route.fulfill({status:response.status,contentType:'application/json',body}).catch(()=>{});
    }catch{await route.abort().catch(()=>{});}
  });
  await tap(page.getByRole('button',{name:'Проверить',exact:true}));
  await expect.poll(()=>gradeEntered,{timeout:30000}).toBe(true);
  await backgroundResume();await expect(answer).toHaveValue('Tekst sa tastaturom.');
  await expect(answer).not.toBeEditable();releaseGrade();
  await expect(page.locator('.android-training-page .feedback')).toBeVisible();
  await page.unrouteAll({behavior:'wait'});
  transport=await installAndroidFixtureTransport(page);
  if(attempts.length!==beforeGrade+1)throw Error('Grading duplicated during resume');
  report.grading={nativeHomeResume:true,pendingRequestRetained:true,singleSubmission:true};
  console.log('Android: grading background/resume passed');
  stage='word-level highlight in both alphabets';
  await tap(page.getByRole('button',{name:'Следующая',exact:true}));await record();
  const incorrect='Malo ćemo kasniti zbog jutreneg prevoza.';
  await answer.fill(incorrect);await closeKeyboard();
  // A render-only structured fixture, not an AI-quality or persisted-attempt check.
  await page.route('**/api/attempts',async route=>{
    const fixture={...gradeResponse,exercise_id:route.request().postDataJSON().exercise_id,transcript_sr:incorrect,overall_score:.88,base_score:.88,
      analysis:{...gradeResponse.analysis,verdict:'needs_work',corrected_sr:'Malo ćemo kasniti zbog jutarnjeg prevoza.',issues:[{type:'grammar',skill_key:'present_tense',severity:.5,confidence:1,evidence:'jutreneg prevoza',correction:'jutarnjeg prevoza'}]}};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)});
  });
  await tap(page.getByRole('button',{name:'Проверить',exact:true}));
  const marks=page.locator('.android-training-page .result-phrases mark');
  await expect(marks).toHaveCount(1);await expect(marks).toHaveText('jutreneg');
  await tap(page.getByRole('button',{name:'Настройки',exact:true}));
  await page.getByRole('radio',{name:/Кириллица/}).check();
  await tap(page.getByRole('button',{name:'Тренировка',exact:true}));
  await expect(marks).toHaveCount(1);await expect(marks).toHaveText('јутренег');
  await page.unrouteAll({behavior:'wait'});
  transport=await installAndroidFixtureTransport(page);
  report.wordHighlight={latin:true,cyrillic:true,unchangedNeighborExcluded:true,structuredRenderingFixture:true};
  console.log('Android: exact word highlight passed in both alphabets');
  stage='auth refresh on expiration';
  // Sign an expired LOCAL fixture JWT in the runner. No production credential is read or used.
  const fixtureEnv=Object.fromEntries(readFileSync(new URL('../../.env.testlab',import.meta.url),'utf8').split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
  const currentToken=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));return JSON.parse(localStorage.getItem(key)).access_token;});
  const [header,payload]=currentToken.split('.');
  const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
  if(claims.iss!=='http://127.0.0.1:8766/auth/v1')throw Error('Only local auth fixtures are allowed');
  claims.exp=Math.floor(Date.now()/1000)-120;
  const signedBody=header+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
  const expiredToken=signedBody+'.'+createHmac('sha256',fixtureEnv.TESTLAB_SIGNING_SECRET).update(signedBody).digest('base64url');
  const rejection=await page.evaluate(async token=>(await fetch('http://10.0.2.2:8765/api/topics',{headers:{Authorization:'Bearer '+token}})).status,expiredToken);
  if(rejection!==401)throw Error('Expired signed JWT was accepted');
  await page.evaluate(token=>{const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));const s=JSON.parse(localStorage.getItem(key));s.access_token=token;s.expires_at=Math.floor(Date.now()/1000)-120;localStorage.setItem(key,JSON.stringify(s));},expiredToken);
  await device.shell('am force-stop '+pkg);await device.shell(`monkey -p ${pkg} 1`);
  page=await (await device.webView({pkg},{timeout:30000})).page();
  // A new WebView attachment observes refresh response; validate refreshed metadata instead of exporting any token.
  transport=await installAndroidFixtureTransport(page);
  if(transport.hostProxy)await page.reload();
  await expect(page.getByRole('button',{name:/Собеседование/}).first()).toBeVisible({timeout:30000});
  await expect.poll(()=>page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));return Boolean(key&&JSON.parse(localStorage.getItem(key)).expires_at>Date.now()/1000+60);})).toBe(true);
  report.authRefresh={signedExpiredFixtureRejected:401,newValidSession:true,productionOAuthTested:false};
  stage='OS microphone permission denial';
  const permission=(await device.shell(`dumpsys package ${pkg}`)).toString().match(/android\.permission\.RECORD_AUDIO: granted=(true|false), flags=\[([^\]]*)\]/);
  if(!permission)throw Error('Microphone permission state unavailable');
  originalPermission={granted:permission[1]==='true',userSet:permission[2].includes('USER_SET'),userFixed:permission[2].includes('USER_FIXED')};
  await device.shell(`pm revoke ${pkg} android.permission.RECORD_AUDIO`);
  await device.shell(`pm set-permission-flags ${pkg} android.permission.RECORD_AUDIO user-set user-fixed`);
  await device.shell(`am force-stop ${pkg}`);
  await expect.poll(async()=>(await device.shell(`pidof ${pkg}`)).toString().trim()).toBe('');
  await device.shell(`monkey -p ${pkg} 1`);
  page=await (await device.webView({pkg},{timeout:30000})).page();
  transport=await installAndroidFixtureTransport(page);
  if(transport.hostProxy)await page.reload();
  await expect(page.getByRole('button',{name:/Собеседование/}).first()).toBeVisible({timeout:30000});
  const denied=(await device.shell(`dumpsys package ${pkg}`)).toString();
  if(!/android\.permission\.RECORD_AUDIO: granted=false, flags=\[[^\]]*USER_FIXED/.test(denied))throw Error('OS permission denial was not applied');
  const nativeMicrophone=await page.evaluate(()=>navigator.mediaDevices.getUserMedia.toString().includes('[native code]'));
  if(!nativeMicrophone)throw Error('Permission test must use native media API');
  await page.evaluate(()=>{
    const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=constraints=>native(constraints).then(stream=>{
      stream.getTracks().forEach(track=>track.stop());throw Error('Unexpected microphone permission grant');
    },error=>{window.__permissionErrorName=error.name;throw error;});
  });
  await page.getByRole('button',{name:/Собеседование/}).first().click();
  await page.getByRole('button',{name:'Ответить голосом',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible({timeout:40000});
  await expect.poll(()=>page.evaluate(()=>window.__permissionErrorName)).toBe('NotAllowedError');
  await expect(page.getByRole('button',{name:'Завершить запись',exact:true})).toHaveCount(0);
  await tap(page.getByRole('button',{name:'Ввести ответ вручную',exact:true}));
  await page.getByLabel('Ваш ответ').fill('Ručni odgovor.');await closeKeyboard();
  await expect(page.getByRole('button',{name:'Проверить',exact:true})).toBeEnabled();
  report.microphoneDenied={osPermissionRevoked:true,nativeMediaApi:true,manualInputAvailable:true};
  if(inputMode==='native'){
    stage='Back from practice to topics and exit';
    await device.input.press('Back');
    await expect(page.getByRole('button',{name:'Темы',exact:true})).toHaveAttribute('aria-current','page');
    await device.input.press('Back');
    await expect.poll(async()=>{
      const state=(await device.shell('dumpsys activity activities')).toString();
      return state.split('\n').filter(line=>/topResumedActivity|mResumedActivity/.test(line)).some(line=>line.includes(pkg+'/'));
    }).toBe(false);
    report.nativeExit={practiceToTopics:true,topicsToExit:true};
  }
  console.log(JSON.stringify(report));
}catch(error){
 if(stage==='fixture login'&&page)console.log(JSON.stringify(await page.evaluate(async()=>({
   stage:'fixture login',path:location.pathname,emailForm:Boolean(document.querySelector('input[type="email"]')),
   online:navigator.onLine,hostHealth:await fetch('http://10.0.2.2:8765/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.status).catch(()=>0),
   authHealth:await fetch('http://10.0.2.2:8766/auth/v1/settings',{signal:AbortSignal.timeout(3000)}).then(r=>r.status).catch(()=>0),
 })).catch(()=>({stage:'fixture login',webViewUnavailable:true}))));
 throw Error(`Android resilience failed at ${stage}: ${error instanceof Error?error.message.split('\n')[0]:'unknown'}`);
}
finally{
 releases.forEach(release=>release());
 let permissionCleanupFailed=false;
 if(originalPermission){
  try{
   await restoreMicrophonePermission(command=>device.shell(command),pkg,originalPermission);
   const restored=(await device.shell(`dumpsys package ${pkg}`)).toString().match(/android\.permission\.RECORD_AUDIO: granted=(true|false), flags=\[([^\]]*)\]/);
   if(!restored||(restored[1]==='true')!==originalPermission.granted||restored[2].includes('USER_SET')!==originalPermission.userSet||restored[2].includes('USER_FIXED')!==originalPermission.userFixed)throw Error('Permission state differs');
  }catch{permissionCleanupFailed=true;}
 }
 let networkCleanupFailed=false;
 try{
  await radios?.restore();
  if(radios&&((await device.shell('settings get global wifi_on')).toString().trim()!==wifi||(await device.shell('settings get global mobile_data')).toString().trim()!==data))throw Error('Radio state differs');
 }catch{networkCleanupFailed=true;}
 await device.shell('am force-stop com.microsoft.playwright.androiddriver').catch(()=>{});await device.close();
 if(networkCleanupFailed)throw Error('Android radios could not be restored; check device network state');
 if(permissionCleanupFailed)throw Error('Android microphone permission could not be restored; check device permission state');
}
async function record(){await page.getByRole('button',{name:'Ответить голосом',exact:true}).click();await page.getByRole('button',{name:'Завершить запись',exact:true}).click();await expect(page.getByLabel('Ваш ответ')).toBeVisible();}
async function imeVisible(){const state=(await device.shell('dumpsys input_method')).toString();return /mInputShown=true|mIsInputViewShown=true/.test(state);}
async function closeKeyboard(){
 if(inputMode==='native'&&await imeVisible()){
  await device.input.press('Back');
  await expect(page.getByRole('button',{name:'Тренировка',exact:true})).toHaveAttribute('aria-current','page');
 }
 else await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
}
async function backgroundResume(){
 const before=await page.evaluate(()=>({...window.__nativeCycles}));
 await device.shell('input keyevent KEYCODE_HOME');
 await expect.poll(()=>page.evaluate(()=>window.__nativeCycles.inactive),{timeout:15000}).toBeGreaterThan(before.inactive);
 await device.shell(`monkey -p ${pkg} 1`);
 await expect.poll(()=>page.evaluate(()=>window.__nativeCycles.active),{timeout:15000}).toBeGreaterThan(before.active);
}
async function tap(locator){
 await expect(locator).toBeEnabled();await locator.scrollIntoViewIfNeeded();
 const point=await locator.evaluate(e=>{const r=e.getBoundingClientRect(),v=window.visualViewport;const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);if(!hit||!(hit===e||e.contains(hit)))throw Error('Target covered');if(x<v.offsetLeft||y<v.offsetTop||x>=v.offsetLeft+v.width||y>=v.offsetTop+v.height)throw Error('Target outside viewport');return{x:x-v.offsetLeft,y:y-v.offsetTop,w:v.width,h:v.height};});
 if(inputMode==='webview'){await page.mouse.click(point.x,point.y);return;}
 const {bounds}=await device.info({clazz:'android.webkit.WebView',pkg});await device.input.tap({x:Math.round(bounds.x+point.x*bounds.width/point.w),y:Math.round(bounds.y+point.y*bounds.height/point.h)});
}
