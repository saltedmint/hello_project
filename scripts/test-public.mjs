import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {openDatabase} from './local-d1.mjs';
const code=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');
const worker=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const {DB,sqlite}=openDatabase(),env={DB,ADMIN_EMAIL:'presenter@example.test'},url='https://your-type.example';
let passed=0;function check(name,fn){fn();passed++;console.log('PASS',name);}
async function call(path,method='GET',data,admin=false){const response=await worker.default.fetch(new Request(url+path,{method,headers:{'Content-Type':'application/json',...(admin?{'oai-authenticated-user-email':env.ADMIN_EMAIL}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);return {status:response.status,data:await response.json()};}
const demos=HelloQuestionDemo.buildBatch(),copy=value=>JSON.parse(JSON.stringify(value));
function person(id){const r=copy(demos[0]);r.id=id;r.source='participant';delete r.isDemo;delete r.demoBatchId;r.sound=HelloQuestionData.soundFor(id);return r;}
const one=person('server-test-a'),two=person('server-test-b'),item=record=>({schemaVersion:1,roundId:'presentation-2026',record});
check('worker bundle omits secrets and private local asset',()=>assert(!code.includes('hanminteak@gmail.com')&&!code.includes('greeting-repeated (1).wav')&&!code.includes('source_repository_credential')));
let result=await call('/api/config');check('anonymous round/question config',()=>assert(result.status===200&&result.data.questions.length===3));
for(const record of [one,two]){result=await call('/api/responses','POST',item(record));check('durable insertion '+record.id,()=>assert(result.status===200&&result.data.saved&&result.data.createdAt));}
await call('/api/responses','POST',item(one));check('idempotent retry',()=>assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM responses').get().n,2));
result=await call('/api/responses');check('independent records query without answer text/raw edits',()=>{assert.equal(result.data.records.length,2);const raw=JSON.stringify(result.data);for(const key of ['"text":','"characters":','"question":','"payload":','"char":'])assert(!raw.includes(key));});
check('server preserves first silence and exact activity intervals',()=>assert.deepEqual(result.data.records.find(r=>r.id===one.id).answers[0].scores.dots.events.map(e=>e.atMs),one.answers[0].typingActivities.map(e=>e.atMs)));
const changed=person(one.id);changed.answers=copy(demos[1].answers);result=await call('/api/responses','POST',item(changed));check('collision cannot overwrite earlier answer',()=>assert.equal(result.status,409));
const invalid=person('invalid');invalid.answers[0].events[1].atMs=-1;result=await call('/api/responses','POST',item(invalid));check('server rejects invalid timing',()=>assert.equal(result.status,400));
const version=person('wrong-version');version.answers[0].questionVersion=2;result=await call('/api/responses','POST',item(version));check('server rejects mismatched question version',()=>assert.equal(result.status,400));
result=await call('/api/responses','POST',item(demos[0]));check('public cannot submit demo markers',()=>assert.equal(result.status,400));
for(const path of ['export','rounds','demo','response']){result=await call('/api/admin/'+path,path==='export'?'GET':'DELETE',path==='export'?undefined:{});check('anonymous admin rejected '+path,()=>assert.equal(result.status,403));}
for(const method of ['PUT','DELETE']){result=await call('/api/responses',method,{});check('anonymous cannot '+method,()=>assert.equal(result.status,405));}
result=await worker.default.fetch(new Request(url+'/api/responses',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}),env);check('cross-origin writes rejected',()=>assert.equal(result.status,403));
result=await call('/api/admin/demo','POST',{},true);check('explicit seed 10 people 30 answers',()=>assert.equal(result.data.answers,30));await call('/api/admin/demo','POST',{},true);check('seed idempotent with real responses intact',()=>assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM responses').get().n,12));
result=await call('/api/responses?demo=1');check('demo flags retained',()=>assert.equal(result.data.records.filter(r=>r.isDemo).length,10));
result=await call('/api/responses');check('demo excluded by default',()=>assert.equal(result.data.records.length,2));
await call('/api/admin/demo','DELETE',{confirm:'presentation-10-v1'},true);check('demo removal preserves real participants',()=>assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM responses').get().n,2));
result=await call('/api/admin/export','GET',undefined,true);check('authorized full export retains raw records',()=>assert.equal(result.data.records[0].record.answers[0].text,one.answers[0].text));
await call('/api/admin/rounds','POST',{id:'second-round',title:'Second',includeDemo:true},true);result=await call('/api/config');check('new round selected',()=>assert.equal(result.data.round.id,'second-round'));
result=await call('/api/responses?round=second-round');check('round query isolated',()=>assert.equal(result.data.records.length,0));
for(let i=0;i<23;i++)await call('/api/responses','POST',{schemaVersion:1,roundId:'second-round',record:person('layer-'+i)});
result=await call('/api/responses?round=second-round');check('20 playback layers, all 23 remain stored',()=>{assert.equal(result.data.records.length,20);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM responses WHERE round_id=?').get('second-round').n,23);});
console.log(`${passed} public/server checks passed`);sqlite.close();
