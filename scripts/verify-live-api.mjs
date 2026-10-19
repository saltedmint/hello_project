// Real HTTPS API checks in an explicitly-labelled QA round. Credentials are
// accepted through hidden stdin only, never command arguments or source files.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
console.log('Ready for live API verification JSON on stdin (input is hidden).');
const options=await new Promise((resolve,reject)=>{let text='';if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.on('data',function read(chunk){text+=chunk;if(/[\r\n]/.test(text)){process.stdin.off('data',read);if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();try{resolve(JSON.parse(text));}catch(error){reject(error);}}});process.stdin.resume();});
const base=options.url.replace(/\/$/,''),token=options.token;
assert(token,'A server-only admin token is required for isolated QA management');
const source=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const call=async(path,method='GET',data,admin=false)=>{
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});
 return {status:response.status,value:await response.json()};
};
let checks=0;const check=(name,test)=>{test();checks++;console.log('PASS '+name);};
const previous=(await call('/api/config')).value.round,roundId='qa-api-'+Date.now(),id='qa-participant-'+Date.now();
const created=await call('/api/admin/rounds','POST',{id:roundId,title:'QA · 합성 서버 검증 · 관객 기록 아님'},true);assert.equal(created.status,200);
try{
 const record=HelloQuestionDemo.buildBatch()[0];record.id=id;record.source='participant';delete record.isDemo;delete record.demoBatchId;record.sound=HelloQuestionData.soundFor(id);
 const item={schemaVersion:1,roundId,record};
 let r=await call('/api/responses','POST',item);check('real server saves one session / three answers with server time',()=>{assert.equal(r.status,200);assert(r.value.createdAt);});
 r=await call('/api/responses','POST',item);check('real server idempotent retry succeeds',()=>assert.equal(r.status,200));
 const broken=structuredClone(item);broken.record.answers[0].events[1].atMs=-1;r=await call('/api/responses','POST',broken);check('real server rejects invalid event time',()=>assert.equal(r.status,400));
 const replacement=structuredClone(item);replacement.record.answers=HelloQuestionDemo.buildBatch()[1].answers;r=await call('/api/responses','POST',replacement);check('real server prevents overwrite of same session',()=>assert.equal(r.status,409));
 r=await call('/api/admin/demo','POST',{},true);check('real server seed reports ten people / thirty answers',()=>{assert.equal(r.status,200);assert.equal(r.value.answers,30);});
 await call('/api/admin/demo','POST',{},true);
 r=await call('/api/responses?round='+roundId+'&demo=1');check('seed replay has ten demos and preserves one participant',()=>{assert.equal(r.value.records.length,11);assert.equal(r.value.records.filter(x=>x.isDemo).length,10);assert(r.value.records.some(x=>x.id===id));});
 const view=JSON.stringify(r.value);check('public query excludes original text and raw edit/key logs',()=>{for(const key of ['"text":','"characters":','"payload":','"key":','"char":'])assert(!view.includes(key));});
 r=await call('/api/admin/export','GET',undefined,true);const qa=r.value.records.filter(x=>x.roundId===roundId);
 check('authorized export keeps 11 sessions / 33 full answers and versions',()=>{assert.equal(qa.length,11);assert.equal(qa.reduce((n,x)=>n+x.record.answers.length,0),33);assert(qa.every(x=>x.createdAt&&x.record.schemaVersion===2));});
 const original=qa.find(x=>x.record.id===id).record;
 check('stored raw activities and submission times match exactly',()=>assert.deepEqual(original.answers,record.answers));
 r=await call('/api/admin/export');check('anonymous export forbidden',()=>assert.equal(r.status,403));
 r=await call('/api/responses','DELETE',{});check('anonymous deletion forbidden',()=>assert.equal(r.status,405));
 r=await call('/api/admin/demo','DELETE',{confirm:'presentation-10-v1'},true);assert.equal(r.status,200);
 r=await call('/api/responses?round='+roundId+'&demo=1');check('batch-only deletion leaves participant intact',()=>{assert.equal(r.value.records.length,1);assert.equal(r.value.records[0].id,id);});
 console.log(`${checks} live HTTPS/D1 API checks passed`);
}finally{
 await call('/api/admin/demo','DELETE',{confirm:'presentation-10-v1'},true);
 await call('/api/admin/response','DELETE',{id,roundId,confirm:id},true);
 await call('/api/admin/rounds','POST',{id:previous.id,title:previous.title,includeDemo:!!previous.includeDemo},true);
 console.log('QA-only responses cleaned; previous audience round restored');
}
