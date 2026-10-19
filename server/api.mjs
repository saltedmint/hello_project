// The bundler prepends the same config, recorder, validators and score compilers
// used by the browser. No dependency, framework or alternate timing conversion.
const C=globalThis.HelloQuestionConfig,D=globalThis.HelloQuestionData;
const key=C.questions.map(q=>`${q.id}:${q.version}`).join('|');
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id);
async function body(request){
  const reader=request.body?.getReader();if(!reader)fail(400,'요청 내용이 없습니다.');
  const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1000000){await reader.cancel();fail(413,'기록은 1MB 이하여야 합니다.');}chunks.push(value);}
  const all=new Uint8Array(length);let at=0;for(const chunk of chunks){all.set(chunk,at);at+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(all));}catch{fail(400,'올바른 JSON이 아닙니다.');}
}
function sanitize(record){
  return {publicScoreVersion:1,id:record.id,source:record.source,isDemo:record.source==='synthetic',sound:record.sound,
    answers:record.answers.map(a=>({questionId:a.questionId,questionVersion:a.questionVersion,
      scores:{dots:HelloQuestionDots.compile(a),morse:cleanMorse(a.morse)}}))};
}
function cleanMorse(score){
  // Unsupported characters have no graphic text; even their original glyph is private.
  return {...score,segments:score.segments.map(({char,...segment})=>segment),label:'모스 기록'};
}
async function currentRound(env){
  const row=await env.DB.prepare('SELECT id,title,include_demo AS includeDemo FROM presentations WHERE active=1 ORDER BY created_at DESC LIMIT 1').first();
  return row||{id:env.CURRENT_ROUND_ID||'presentation-2026',title:'Your Type',includeDemo:false};
}
async function owner(request,env){
  if(env.ADMIN_EMAIL&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.ADMIN_EMAIL.toLowerCase())return true;
  // Optional operator automation credential, runtime-only; never sent to a page.
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!env.ADMIN_API_TOKEN||!token)return false;
  const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([digest(token),digest(env.ADMIN_API_TOKEN)]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
function checkOrigin(request){const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)fail(403,'다른 사이트에서의 쓰기는 허용하지 않습니다.');}
function validateRecord(value,{demo=false}={}){
  let record;try{record=D.validate(value);}catch(error){fail(400,error.message);}
  if(!demo&&(record.source!=='participant'||record.isDemo||record.demoBatchId))fail(400,'공개 제출은 실제 체험 기록만 가능합니다.');
  for(const [i,a] of record.answers.entries()){
    const q=C.questions[i];if(a.questionVersion!==q.version||a.question.ko!==q.ko||a.question.en!==q.en)fail(400,'질문 버전이 다릅니다. 새로고침 후 체험해 주세요.');
    if(a.submittedAtMs>1800000)fail(400,'질문별 기록은 30분 이하여야 합니다.');
  }
  return {...record,sound:D.soundFor(record.id)};
}
async function insert(env,roundId,record){
  const publicValue=sanitize(record),payload=JSON.stringify(record),publicPayload=JSON.stringify(publicValue);
  if(new TextEncoder().encode(payload+publicPayload).length>1800000)fail(413,'변환된 기록이 너무 큽니다.');
  await env.DB.prepare('INSERT INTO responses (round_id,session_id,question_key,source,demo_batch_id,payload,public_payload) VALUES (?,?,?,?,?,?,?) ON CONFLICT(round_id,session_id) DO NOTHING')
    .bind(roundId,record.id,key,record.source,record.demoBatchId||null,payload,publicPayload).run();
  const saved=await env.DB.prepare('SELECT payload,created_at FROM responses WHERE round_id=? AND session_id=?').bind(roundId,record.id).first();
  if(saved.payload!==payload)fail(409,'같은 세션 ID에 다른 응답이 이미 있습니다. 원본은 변경하지 않았습니다.');
  return {saved:true,id:record.id,roundId,createdAt:saved.created_at};
}
export async function api(request,env){
  try{
    if(!env.DB)fail(503,'서버 데이터베이스가 연결되지 않았습니다.');
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(!['GET','HEAD'].includes(method))checkOrigin(request);
    if(path.startsWith('/api/admin/')){
      if(!await owner(request,env))fail(403,'발표자 로그인이 필요합니다.');
      const round=(await currentRound(env)).id;
      async function targetRound(value){
        const id=value||round;if(!validId(id))fail(400,'회차 ID가 올바르지 않습니다.');
        if(id!==(env.CURRENT_ROUND_ID||'presentation-2026')&&!await env.DB.prepare('SELECT id FROM presentations WHERE id=?').bind(id).first())fail(400,'존재하지 않는 회차입니다.');
        return id;
      }
      if(path==='/api/admin/records'&&method==='GET'){
        const selected=url.searchParams.get('round')||round,source=url.searchParams.get('source')||'all',search=(url.searchParams.get('search')||'').trim();
        const limit=Number(url.searchParams.get('limit')||20),offset=Number(url.searchParams.get('offset')||0);
        if((selected!=='all'&&!validId(selected))||!['all','participant','synthetic'].includes(source)||search.length>200||!Number.isInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(offset)||offset<0||offset>1000000)fail(400,'목록 조회 조건이 올바르지 않습니다.');
        const where=[],args=[];if(selected!=='all'){where.push('round_id=?');args.push(selected);}if(source!=='all'){where.push('source=?');args.push(source);}
        if(search){where.push("(instr(lower(session_id),lower(?))>0 OR instr(lower(json_extract(payload,'$.answers[0].text')),lower(?))>0 OR instr(lower(json_extract(payload,'$.answers[1].text')),lower(?))>0 OR instr(lower(json_extract(payload,'$.answers[2].text')),lower(?))>0)");args.push(search,search,search,search);}
        const filter=where.length?'WHERE '+where.join(' AND '):'';
        const counts=await env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN source='participant' THEN 1 ELSE 0 END),0) AS actual,COALESCE(SUM(CASE WHEN source='synthetic' THEN 1 ELSE 0 END),0) AS demo FROM responses ${filter}`).bind(...args).first();
        const fields=[0,1,2].map(i=>{const p=`$.answers[${i}]`;return `json_object('questionId',json_extract(payload,'${p}.questionId'),'questionVersion',json_extract(payload,'${p}.questionVersion'),'text',json_extract(payload,'${p}.text'),'firstActivityMs',json_extract(payload,'${p}.firstActivityMs'),'submittedAtMs',json_extract(payload,'${p}.submittedAtMs'),'recordingVersion',json_extract(payload,'${p}.recordingVersion'),'activityCount',COALESCE(json_array_length(json_extract(payload,'${p}.typingActivities')),json_array_length(json_extract(payload,'${p}.characters'))))`;});
        const rows=await env.DB.prepare(`SELECT round_id,session_id,source,demo_batch_id,created_at,json_array(${fields.join(',')}) AS summary FROM responses ${filter} ORDER BY created_at DESC,session_id DESC LIMIT ? OFFSET ?`).bind(...args,limit,offset).all();
        return json({records:rows.results.map(r=>({id:r.session_id,roundId:r.round_id,source:r.source,isDemo:r.source==='synthetic',demoBatchId:r.demo_batch_id,createdAt:r.created_at,answers:JSON.parse(r.summary)})),counts,limit,offset,hasMore:offset+rows.results.length<counts.total});
      }
      if(path==='/api/admin/record'&&method==='GET'){
        const id=url.searchParams.get('id'),selected=url.searchParams.get('round');if(!validId(id)||!validId(selected))fail(400,'회차와 기록 ID를 확인해 주세요.');
        const row=await env.DB.prepare('SELECT payload,created_at FROM responses WHERE round_id=? AND session_id=?').bind(selected,id).first();if(!row)fail(404,'기록이 없거나 이미 삭제됐습니다.');
        return json({roundId:selected,createdAt:row.created_at,record:JSON.parse(row.payload)});
      }
      if(path==='/api/admin/records'&&method==='DELETE'){
        const value=await body(request);if(value.confirm!=='delete-selected'||!Array.isArray(value.records)||!value.records.length||value.records.length>50||value.records.some(r=>!validId(r?.id)||!validId(r?.roundId)))fail(400,'선택한 1~50개 기록의 삭제 확인이 필요합니다.');
        const unique=[...new Map(value.records.map(r=>[JSON.stringify([r.roundId,r.id]),r])).values()];
        const results=await env.DB.batch(unique.map(r=>env.DB.prepare('DELETE FROM responses WHERE round_id=? AND session_id=?').bind(r.roundId,r.id)));
        return json({deleted:results.reduce((n,r)=>n+Number(r.meta?.changes||0),0)});
      }
      if(path==='/api/admin/export'&&method==='GET'){
        const rows=await env.DB.prepare('SELECT round_id,created_at,payload FROM responses ORDER BY created_at,session_id').all();
        return json({schemaVersion:1,kind:'your-type-server-backup',records:rows.results.map(r=>({roundId:r.round_id,createdAt:r.created_at,record:JSON.parse(r.payload)}))});
      }
      if(path==='/api/admin/rounds'&&method==='GET')return json({current:round,rounds:(await env.DB.prepare('SELECT * FROM presentations ORDER BY created_at DESC').all()).results});
      if(path==='/api/admin/rounds'&&method==='POST'){
        const value=await body(request);if(!validId(value.id)||typeof value.title!=='string'||value.title.length<1||value.title.length>100)fail(400,'회차 ID와 제목을 확인해 주세요.');
        await env.DB.batch([env.DB.prepare('UPDATE presentations SET active=0'),env.DB.prepare('INSERT INTO presentations(id,title,active,include_demo) VALUES (?,?,1,?) ON CONFLICT(id) DO UPDATE SET active=1,title=excluded.title,include_demo=excluded.include_demo').bind(value.id,value.title,value.includeDemo===true?1:0)]);
        return json({active:value.id});
      }
      if(path==='/api/admin/demo'&&method==='POST'){
        const value=await body(request),five=value.batchId===HelloQuestionDemo.fiveBatchId;
        if(value.batchId&&![HelloQuestionDemo.batchId,HelloQuestionDemo.fiveBatchId].includes(value.batchId))fail(400,'지원하지 않는 합성 배치입니다.');
        const selected=await targetRound(value.roundId),batch=five?HelloQuestionDemo.buildFive():HelloQuestionDemo.buildBatch();for(const record of batch)await insert(env,selected,record);
        return json({batchId:five?HelloQuestionDemo.fiveBatchId:HelloQuestionDemo.batchId,participants:batch.length,answers:batch.length*3,roundId:selected});
      }
      if(path==='/api/admin/demo'&&method==='DELETE'){
        const value=await body(request);if(![HelloQuestionDemo.batchId,HelloQuestionDemo.fiveBatchId].includes(value.confirm))fail(400,'배치 삭제 확인이 필요합니다.');
        const selected=await targetRound(value.roundId);await env.DB.prepare('DELETE FROM responses WHERE round_id=? AND source=? AND demo_batch_id=?').bind(selected,'synthetic',value.confirm).run();return json({removedBatch:value.confirm,roundId:selected});
      }
      if(path==='/api/admin/response'&&method==='DELETE'){
        const value=await body(request);if(!validId(value.id)||value.confirm!==value.id||!validId(value.roundId))fail(400,'삭제할 회차와 기록 ID를 확인해 주세요.');
        await env.DB.prepare('DELETE FROM responses WHERE round_id=? AND session_id=?').bind(value.roundId,value.id).run();return json({removed:value.id});
      }
      fail(405,'지원하지 않는 관리 요청입니다.');
    }
    if(path==='/api/config'&&method==='GET')return json({schemaVersion:1,round:await currentRound(env),questionKey:key,questions:C.questions,maxLayers:C.maxParticipants,notice:'답변과 입력 시간이 저장되어 작품의 누적 소리와 그래픽에 사용됩니다. 이름·이메일은 수집하지 않습니다. 공개 결과에는 원문 대신 부호와 시각을 제공합니다. 민감한 정보는 입력하지 마세요.'});
    if(path==='/api/responses'&&method==='POST'){
      const value=await body(request);if(value.schemaVersion!==1||!validId(value.roundId))fail(400,'회차 ID 또는 요청 버전이 올바르지 않습니다.');
      // A completed session keeps its frozen round even if the presenter advances.
      if(value.roundId!==(env.CURRENT_ROUND_ID||'presentation-2026')&&!await env.DB.prepare('SELECT id FROM presentations WHERE id=?').bind(value.roundId).first())fail(400,'존재하지 않는 회차입니다.');
      return json(await insert(env,value.roundId,validateRecord(value.record)));
    }
    if(path==='/api/responses'&&method==='GET'){
      const round=url.searchParams.get('round')||(await currentRound(env)).id;if(!validId(round))fail(400,'회차가 올바르지 않습니다.');
      const presentation=await env.DB.prepare('SELECT include_demo FROM presentations WHERE id=?').bind(round).first();
      const includeDemo=url.searchParams.get('demo')==='1'||presentation?.include_demo===1;
      const preferFive=includeDemo&&url.searchParams.get('demo')!=='1'&&!!await env.DB.prepare("SELECT session_id FROM responses WHERE round_id=? AND demo_batch_id='presentation-5-v1' LIMIT 1").bind(round).first();
      const sourceFilter=!includeDemo?"AND source='participant'":preferFive?"AND (source='participant' OR demo_batch_id='presentation-5-v1')":'';
      const rows=await env.DB.prepare(`SELECT public_payload,created_at FROM responses WHERE round_id=? AND question_key=? ${sourceFilter} ORDER BY created_at DESC,session_id DESC LIMIT 20`).bind(round,key).all();
      return json({schemaVersion:1,roundId:round,selection:'latest-20-including-self',records:rows.results.map(r=>({...JSON.parse(r.public_payload),serverCreatedAt:r.created_at}))});
    }
    fail(405,'공개 요청에서는 조회와 새 기록 제출만 가능합니다.');
  }catch(error){return json({error:error.status?error.message:'서버 연결에 실패했습니다. 기록은 기기에 보존하고 재시도해 주세요.'},error.status||503);}
}
export {sanitize,validateRecord,key};
