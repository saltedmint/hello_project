// Two isolated Chromium storage contexts against a real HTTP(S) API.
// Input events are synthetic DOM events; this is not a hardware/IME test.
import {spawn} from 'node:child_process';
import {mkdir,readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function input(){
  console.log('Ready for verification JSON on stdin (input is hidden).');
  return new Promise((resolve,reject)=>{let value='';if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.on('data',function consume(chunk){value+=chunk;if(value.includes('\n')||value.includes('\r')){process.stdin.off('data',consume);if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();try{resolve(JSON.parse(value));}catch(error){reject(error);}}});process.stdin.resume();});
}
const options=await input(),base=options.url.replace(/\/$/,''),token=options.token;
const request=async(p,method='GET',data)=>{
 const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const value=await r.json();if(!r.ok)throw Error(`${p}: ${r.status} ${value.error}`);return value;
};
const qaRound='qa-'+Date.now(),current=await request('/api/config');
if(token)await request('/api/admin/rounds','POST',{id:qaRound,title:'QA · 합성 자동 검증 · 관객 기록 아님',includeDemo:false});
const runRoot=path.resolve('.deploy/browser-profiles');await mkdir(runRoot,{recursive:true});const profile=await mkdtemp(path.join(runRoot,'qa-'));
const chrome=spawn(process.env.HELLO_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0','--autoplay-policy=no-user-gesture-required','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws,nextId=0;const pending=new Map(),createdIds=[];let success=false;
try{
 let port,endpoint;for(let i=0;i<100;i++){try{[port,endpoint]=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');break;}catch{await delay(100);}}
 if(!port)throw Error('Chrome debugger unavailable');ws=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=event=>{const value=JSON.parse(event.data);if(value.id&&pending.has(value.id)){const {resolve,reject,timer}=pending.get(value.id);pending.delete(value.id);clearTimeout(timer);value.error?reject(Error(value.error.message)):resolve(value.result);}};
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},100000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const evaluate=async(sessionId,expression)=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const pages=[];
 for(let i=0;i<2;i++){
   const {browserContextId}=await command('Target.createBrowserContext'),{targetId}=await command('Target.createTarget',{url:'about:blank',browserContextId});
   const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
   if(i===1)await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
   await command('Page.navigate',{url:base+'/'},sessionId);
   for(let n=0;n<200;n++){if(await evaluate(sessionId,`!!globalThis.HelloTypeExperience`))break;await delay(50);}
   const script=`(async()=>{
     const T=HelloTypeExperience,$=id=>document.getElementById(id),delay=ms=>new Promise(r=>setTimeout(r,ms));
     const assert=(x,m)=>{if(!x)throw Error(m);};const wait=async f=>{for(let i=0;i<3000;i++){if(f())return;await delay(10);}throw Error('UI timeout '+T.diagnostics().state+' '+$('yt-feedback').textContent);};
     assert(YOUR_TYPE_PUBLIC&&T.diagnostics().state==='main','public main');await HelloTypeOnline.initialize();
     assert(getComputedStyle($('yt-seed')).display==='none'||getComputedStyle($('yt-seed').parentElement).display==='none','admin hidden');
     $('yt-touch-start').click();
     for(let q=0;q<3;q++){
       await wait(()=>T.diagnostics().state==='Q'+(q+1)&&!T.diagnostics().locked);const area=$('yt-answer');
       const rect=area.getBoundingClientRect(),button=$('yt-next').getBoundingClientRect();assert(rect.left>=0&&rect.right<=innerWidth+1&&button.top>=0&&button.bottom<=visualViewport.height+1,'mobile input/button fits viewport');
       await delay(80);for(const char of ['a b','ok','hi'][q]){area.dispatchEvent(new KeyboardEvent('keydown',{key:char,code:char===' '?'Space':'Key'+char.toUpperCase(),bubbles:true}));area.value+=char;area.dispatchEvent(new InputEvent('input',{inputType:'insertText',bubbles:true}));area.dispatchEvent(new KeyboardEvent('keyup',{key:char,bubbles:true}));await delay(30);}
       $('yt-next').click();
     }
     await wait(()=>T.diagnostics().state==='playing');const own=T.getSession().record,plan=T.getSequence();
     assert(plan.segments.length===9&&plan.snapshot.filter(r=>r.id===own.id).length===1,'9 stages and own once');
     assert(HelloTypeOnline.pending()===0,'server receipt clears outbox');assert(T.sound.ambientStarts===1,'persistent ambience');
     assert(own.answers[0].typingActivities.length===3,'space included');
     const round=HelloTypeOnline.getRound().id;
     const retry=await fetch('/api/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schemaVersion:1,roundId:round,record:own})});assert(retry.ok,'retry accepted');
     const view=await (await fetch('/api/responses?round='+round)).json();assert(view.records.filter(r=>r.id===own.id).length===1,'retry no duplicate');
     const denied=await fetch('/api/admin/export');assert(denied.status===403,'no anonymous export');
     return {id:own.id,round,snapshot:plan.snapshot.map(r=>r.id),activities:own.answers.map(a=>a.typingActivities.length),records:view.records.map(r=>r.id),ambient:T.sound.ambientStarts};
   })()`;
   const result=await evaluate(sessionId,script);createdIds.push(result.id);pages.push(sessionId);console.log(`PASS isolated browser ${i+1}: ${i?'390px mobile':'desktop'}, anonymous submit/retry, 9 stages, own once, audio, ${result.records.length} stored records`);
   if(i===1&&!result.snapshot.includes(createdIds[0]))throw Error('Second browser did not include first browser response');
 }
 await command('Page.reload',{},pages[0]);await delay(600);
 const after=await evaluate(pages[0],`(async()=>{const r=await fetch('/api/responses');return (await r.json()).records.map(r=>r.id);})()`);
 if(!createdIds.every(id=>after.includes(id)))throw Error('Refresh lost stored responses');console.log('PASS cross-browser query and page-refresh persistence; both responses present');
 const denied=await fetch(base+'/api/admin/export',{headers:{'oai-authenticated-user-email':'hanminteak@gmail.com'}});if(denied.status!==403)throw Error('Spoofed identity header accepted');console.log('PASS public identity spoof rejected at hosting boundary');
 // A fetch failure exercises the actual browser outbox and local-only fallback.
 const offline=await evaluate(pages[1],`(async()=>{const actual=fetch,own=HelloTypeExperience.getSession().record;own.id='offline-'+crypto.randomUUID();globalThis.fetch=()=>Promise.reject(Error('synthetic offline'));const result=await HelloTypeOnline.prepare(own,HelloTypeOnline.getRound().id);globalThis.fetch=actual;return {pending:HelloTypeOnline.pending(),local:result.length,status:HelloTypeOnline.getStatus()};})()`);
 if(offline.pending!==1||offline.local!==0)throw Error('Offline outbox not preserved');console.log('PASS simulated network failure keeps local response and returns own-only fallback');
 await evaluate(pages[1],`HelloTypeOnline.retry()`);console.log('PASS retry sends preserved browser outbox');
 const rows=await request('/api/responses?round='+(token?qaRound:current.round.id));for(const row of rows.records)if(row.id.startsWith('offline-'))createdIds.push(row.id);
 success=true;
}finally{
 if(ws?.readyState===1)ws.close();chrome.kill();await delay(500);
 // Delete only this explicitly-created QA batch, using server authorization.
 if(token){for(const id of createdIds)await request('/api/admin/response','DELETE',{roundId:qaRound,id,confirm:id});await request('/api/admin/rounds','POST',{id:current.round.id,title:current.round.title,includeDemo:!!current.round.includeDemo});}
 if(path.resolve(profile).startsWith(runRoot+path.sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
if(success)console.log(token?'PASS verification complete; QA responses removed and audience round restored':'PASS local verification complete; preview responses retained in the local test database');
