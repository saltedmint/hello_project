// Authorized UI QA via a runtime-only CDP request header. No token is embedded
// in page JavaScript or the published assets. Only an isolated QA round mutates.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
console.log('Ready for admin UI verification JSON on stdin (input is hidden).');
const options=await new Promise((resolve,reject)=>{let text='';if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.on('data',function consume(chunk){text+=chunk;if(/[\r\n]/.test(text)){process.stdin.off('data',consume);if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();try{resolve(JSON.parse(text));}catch(error){reject(error);}}});process.stdin.resume();});
const base=options.url.replace(/\/$/,''),token=options.token,qa='qa-admin-ui-v1';assert(token);
async function api(p,method='GET',data){const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(data?{body:JSON.stringify(data)}:{})});const value=await r.json();assert(r.ok,value.error);return value;}
const before=await api('/api/admin/export'),config=await api('/api/config'),rounds=await api('/api/admin/rounds');
if(!rounds.rounds.some(r=>r.id===qa)){
  await api('/api/admin/rounds','POST',{id:qa,title:'QA · 관리자 UI 합성 검증 · 관객 기록 아님'});
  await api('/api/admin/rounds','POST',{id:config.round.id,title:config.round.title,includeDemo:!!config.round.includeDemo});
}
assert.equal((await api('/api/admin/records?round='+qa)).counts.total,0,'QA round must be empty before test');
const root=path.resolve('.deploy/admin-profiles');await mkdir(root,{recursive:true});const profile=await mkdtemp(path.join(root,'qa-'));
const bundle=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
const ids=Array.from({length:7},(_,i)=>'qa-admin-person-'+i);let ws,chrome,command,next=0,accept=false,dialogs=0;const pending=new Map();
try{
  const template=HelloQuestionDemo.buildBatch()[0];
  for(const id of ids){const r=structuredClone(template);r.id=id;r.source='participant';delete r.isDemo;delete r.demoBatchId;r.sound=HelloQuestionData.soundFor(id);await api('/api/responses','POST',{schemaVersion:1,roundId:qa,record:r});}
  await api('/api/admin/demo','POST',{roundId:qa,batchId:'presentation-10-v1'});
  chrome=spawn(process.env.HELLO_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
  let port,endpoint;for(let i=0;i<100;i++){try{[port,endpoint]=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');break;}catch{await delay(100);}}assert(port);
  ws=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  ws.onmessage=async event=>{const r=JSON.parse(event.data);if(r.id&&pending.has(r.id)){const p=pending.get(r.id);pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}else if(r.method==='Fetch.requestPaused'){
    const headers=Object.entries({...r.params.request.headers,Authorization:'Bearer '+token}).map(([name,value])=>({name,value}));await command('Fetch.continueRequest',{requestId:r.params.requestId,headers},r.sessionId);
  }else if(r.method==='Page.javascriptDialogOpening'){dialogs++;await command('Page.handleJavaScriptDialog',{accept},r.sessionId);}};
  const evaluate=async(s,expression)=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},s);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  async function page(authorized){const {browserContextId}=await command('Target.createBrowserContext'),{targetId}=await command('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});await command('Page.enable',{},sessionId);await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);if(authorized)await command('Fetch.enable',{patterns:[{urlPattern:base+'/api/admin/*',requestStage:'Request'}]},sessionId);await command('Page.navigate',{url:base+'/admin'},sessionId);return sessionId;}
  async function wait(s,expression){for(let i=0;i<600;i++){if(await evaluate(s,expression))return;await delay(30);}throw Error('UI timeout '+expression);}
  const anonymous=await page(false);await wait(anonymous,`document.querySelector('#status')?.textContent.includes('로그인해')`);assert(await evaluate(anonymous,`document.querySelector('#tools').hidden&&!document.querySelector('#login-panel').hidden`));console.log('PASS anonymous admin page exposes login only');
  const s=await page(true);await wait(s,`!document.querySelector('#tools')?.hidden&&document.querySelector('#record-list')?.getAttribute('aria-busy')==='false'`);
  await evaluate(s,`document.querySelector('#round-filter').value='${qa}';document.querySelector('#round-filter').dispatchEvent(new Event('change'));`);
  const count=n=>`document.querySelector('#counts').textContent.startsWith('검색 결과 ${n}개')&&document.querySelector('#record-list').getAttribute('aria-busy')==='false'`;
  await wait(s,count(17));
  await evaluate(s,`document.querySelector('#add-demo').click()`);await wait(s,count(22));await wait(s,`!document.querySelector('#add-demo').disabled`);await evaluate(s,`document.querySelector('#add-demo').click()`);await wait(s,`document.querySelector('#status').textContent.includes('중복 추가하지')&&!document.querySelector('#add-demo').disabled`);assert.equal((await api('/api/admin/records?round='+qa)).counts.total,22);console.log('PASS UI adds five-person batch to inactive round without duplicates');
  await evaluate(s,`document.querySelector('#next-page').click()`);await wait(s,`document.querySelector('#records').children.length===2&&!document.querySelector('#previous').disabled`);await evaluate(s,`document.querySelector('#previous').click()`);await wait(s,`document.querySelector('#records').children.length===20`);console.log('PASS 22 records paginate through list UI');
  await evaluate(s,`document.querySelector('#source-filter').value='participant';document.querySelector('#source-filter').dispatchEvent(new Event('change'));`);await wait(s,count(7));
  await evaluate(s,`document.querySelector('#search').value='파란';document.querySelector('#filters').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));`);await wait(s,count(7));assert(await evaluate(s,`[...document.querySelectorAll('.answer-preview')].some(n=>n.textContent.includes('파란'))`));console.log('PASS actual/demo filters and Korean answer search');
  await evaluate(s,`document.querySelector('#records tr button').click()`);await wait(s,`document.querySelector('#record-dialog').open`);assert(await evaluate(s,`document.querySelectorAll('.detail-answer').length===3&&document.querySelector('.metrics').textContent.includes('첫 입력 전')`));await evaluate(s,`document.querySelector('.detail-answer details').open=true`);await wait(s,`!!document.querySelector('.detail-answer pre')`);console.log('PASS private three-answer detail and lazily opened input/edit logs');
  // A canceled confirmation must leave the exact record untouched.
  await evaluate(s,`document.querySelector('#delete-detail').click()`);await delay(100);assert(await evaluate(s,`document.querySelector('#record-dialog').open`));assert.equal((await api('/api/admin/records?round='+qa+'&source=participant')).counts.total,7);accept=true;
  await evaluate(s,`document.querySelector('#delete-detail').click()`);await wait(s,count(6));await wait(s,`!document.querySelector('#record-dialog').open`);assert(dialogs>=2);console.log('PASS cancel leaves data intact; confirmed detail delete updates list');
  await evaluate(s,`document.querySelector('#select-page').click();document.querySelector('#delete-selected').click()`);await wait(s,count(0));assert.equal((await api('/api/admin/records?round='+qa+'&source=participant')).counts.total,0);console.log('PASS checkbox selection deletes only selected QA responses');
  await evaluate(s,`document.querySelector('#search').value='';document.querySelector('#source-filter').value='all';document.querySelector('#source-filter').dispatchEvent(new Event('change'));`);await wait(s,count(15));
  await evaluate(s,`document.querySelector('#remove-demo').click()`);await wait(s,count(10));assert.equal((await api('/api/admin/records?round='+qa+'&source=synthetic')).counts.total,10);console.log('PASS batch-only removal preserves the other demo batch');
  const image=await command('Page.captureScreenshot',{format:'png'},s);await writeFile('.deploy/admin-desktop.png',Buffer.from(image.data,'base64'));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},s);await delay(100);assert(await evaluate(s,`document.documentElement.scrollWidth<=innerWidth+1`));const mobile=await command('Page.captureScreenshot',{format:'png'},s);await writeFile('.deploy/admin-mobile.png',Buffer.from(mobile.data,'base64'));console.log('PASS 390px responsive admin layout; table scroll stays inside its region');
  const after=await api('/api/admin/export');for(const row of before.records)assert.deepEqual(after.records.find(r=>r.roundId===row.roundId&&r.record.id===row.record.id),row);assert.equal((await api('/api/config')).round.id,config.round.id);console.log('PASS existing audience records and active presentation unchanged');
}finally{
  if(ws?.readyState===1)ws.close();chrome?.kill();await delay(400);
  for(const batchId of ['presentation-5-v1','presentation-10-v1'])await api('/api/admin/demo','DELETE',{roundId:qa,confirm:batchId});
  await api('/api/admin/records','DELETE',{records:ids.map(id=>({roundId:qa,id})),confirm:'delete-selected'});
  if(path.resolve(profile).startsWith(root+path.sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
console.log('PASS administrator UI verification complete; only QA records were removed');
