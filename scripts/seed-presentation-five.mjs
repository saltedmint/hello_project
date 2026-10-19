// Explicit, idempotent seed of the CURRENT presentation; never runs at startup.
import assert from 'node:assert/strict';
console.log('Ready for five-person seed JSON on stdin (input is hidden).');
const options=await new Promise((resolve,reject)=>{let text='';if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.on('data',function read(chunk){text+=chunk;if(/[\r\n]/.test(text)){process.stdin.off('data',read);if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();try{resolve(JSON.parse(text));}catch(error){reject(error);}}});process.stdin.resume();});
const base=options.url.replace(/\/$/,''),token=options.token;assert(token);
async function call(path,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(data?{body:JSON.stringify(data)}:{})});const value=await r.json();assert(r.ok,value.error||'Server request failed');return value;}
const config=await call('/api/config'),before=await call('/api/admin/export');
for(let i=0;i<2;i++){const result=await call('/api/admin/demo','POST',{batchId:'presentation-5-v1'});assert.equal(result.participants,5);assert.equal(result.answers,15);}
const after=await call('/api/admin/export');
const actualBefore=before.records.filter(x=>x.record.source==='participant');
for(const row of actualBefore)assert(after.records.some(r=>r.roundId===row.roundId&&r.record.id===row.record.id&&JSON.stringify(r)===JSON.stringify(row)),'Existing actual record changed');
const batch=after.records.filter(x=>x.roundId===config.round.id&&x.record.demoBatchId==='presentation-5-v1');
assert.equal(batch.length,5);assert.equal(batch.reduce((n,r)=>n+r.record.answers.length,0),15);assert(batch.every(r=>r.record.isDemo&&r.record.source==='synthetic'));
await call('/api/admin/rounds','POST',{id:config.round.id,title:config.round.title,includeDemo:true});
const view=await call('/api/responses?round='+encodeURIComponent(config.round.id));
assert.equal(view.records.filter(r=>r.id.startsWith('presentation-5-v1-')&&r.isDemo).length,5);
assert((await call('/api/config')).round.includeDemo);
console.log(`PASS current round ${config.round.id}: 5 synthetic participants / 15 answers; repeat seed has no duplicates; ${actualBefore.length} existing actual sessions unchanged; default demo playback enabled`);
