/* Anonymous submission, persistent outbox, and public scores. No audio or clock
   ownership here. Server arrival times never become typing timestamps. */
(() => {
  'use strict';
  const enabled=globalThis.YOUR_TYPE_PUBLIC===true,queueKey='your-type.outbox.v1',roundKey='your-type.round.v1';
  let round={id:'presentation-2026',title:'Your Type'},initializing=null,status='',memory=[],durable=true;
  try{const cached=JSON.parse(localStorage.getItem(roundKey));if(cached&&/^[A-Za-z0-9._:-]{1,128}$/.test(cached.id))round=cached;}catch{}
  async function request(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1800);
    try{const response=await fetch(path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers},cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.error||`서버 오류 ${response.status}`);return value;}finally{clearTimeout(timer);}
  }
  function read(){try{const values=JSON.parse(localStorage.getItem(queueKey)||'[]');if(!Array.isArray(values))throw Error();return [...values,...memory.filter(m=>!values.some(v=>v.roundId===m.roundId&&v.record.id===m.record.id))];}catch{return memory.slice();}}
  function write(values){memory=values.slice();try{localStorage.setItem(queueKey,JSON.stringify(values));durable=true;return true;}catch{durable=false;return false;}}
  function display(text){status=text;const node=document.getElementById('yt-online-status');if(node)node.textContent=text;const retry=document.getElementById('yt-send-retry');if(retry)retry.hidden=!read().length;}
  function initialize(refresh=false){
    if(!enabled)return Promise.resolve();
    if(refresh)initializing=null;
    return initializing ||= request('/api/config').then(config=>{if(!config.round?.id)throw Error('서버 설정을 확인하지 못했습니다.');round=config.round;try{localStorage.setItem(roundKey,JSON.stringify(round));}catch{}display(read().length?'미전송 기록이 기기에 있습니다. 다시 보내기를 눌러 주세요.':'서버 연결됨 · 답변은 완료 후 저장합니다.');}).catch(()=>display('서버 연결을 확인하지 못했습니다. 개인 체험은 계속할 수 있습니다.'));
  }
  function enqueue(record,roundId){const values=read();if(!values.some(v=>v.roundId===roundId&&v.record.id===record.id))values.push({schemaVersion:1,roundId,record});if(!write(values))display('기기 저장 공간이 부족합니다. 현재 답변은 메모리에만 보존됩니다. 창을 닫지 마세요.');else display('완료한 답변을 서버로 보내는 중입니다.');}
  async function send(item){
    const result=await request('/api/responses',{method:'POST',body:JSON.stringify(item)});if(result.saved!==true||result.id!==item.record.id)throw Error('서버 저장 확인이 없습니다.');
    write(read().filter(v=>!(v.roundId===item.roundId&&v.record.id===item.record.id)));return result;
  }
  async function prepare(record,roundId){
    enqueue(record,roundId);let saved=false;
    try{await send({schemaVersion:1,roundId,record});saved=true;}catch{display('서버 저장 실패 · 답변을 기기에 보존했습니다. 메인에서 다시 보낼 수 있습니다.');}
    try{
      const data=await request('/api/responses?round='+encodeURIComponent(roundId));
      const records=validateScores(data.records).filter(r=>r.id!==record.id).slice(0,19);
      const demos=records.filter(r=>r.isDemo).length;
      display((saved?'서버 저장 완료. ':'미전송 기록 보존 중. ')+(records.length?`다른 기록 ${records.length}개와 함께 재생합니다.${demos?` 이 중 ${demos}개는 발표용 합성 데이터입니다.`:''}`:'함께 재생할 다른 기록이 없어 내 답변으로 진행합니다.'));
      return records;
    }catch{display((saved?'서버 저장 완료. ':durable?'미전송 기록 보존 중. ':'기기 저장 공간 부족 · 답변은 현재 메모리에만 있습니다. 창을 닫지 마세요. ')+'누적 조회에 실패해 내 답변으로 결과를 재생합니다.');return [];}
  }
  async function retry(){if(!enabled)return;let failed=0;for(const item of read()){try{await send(item);}catch{failed++;}}display(failed?'전송에 실패한 기록을 기기에 보존했습니다. 다시 시도해 주세요.':'서버 저장 완료 · 미전송 기록이 없습니다.');}
  function validateScores(records){
    if(!Array.isArray(records)||records.length>20)throw Error('누적 기록 형식 오류');
    for(const r of records){
      if(r.publicScoreVersion!==1||typeof r.id!=='string'||!['participant','synthetic'].includes(r.source)||!r.sound||!Number.isFinite(r.sound.midi)||!Number.isFinite(r.sound.pan)||Math.abs(r.sound.pan)>.3||!Array.isArray(r.answers)||r.answers.length!==3)throw Error('누적 기록 형식 오류');
      for(const [i,a] of r.answers.entries()){
        if(a.questionId!==HelloQuestionConfig.questions[i].id||a.questionVersion!==HelloQuestionConfig.questions[i].version)throw Error('누적 질문 버전 오류');
        for(const expression of ['dots','morse']){
          const score=a.scores?.[expression];if(!score||!Array.isArray(score.events)||score.events.length>10000||!Number.isFinite(score.durationMs)||score.durationMs<0||score.durationMs>7200000)throw Error('누적 시각 오류');
          let before=0;for(const e of score.events){if(!Number.isFinite(e.atMs)||e.atMs<before||!Number.isFinite(e.durationMs)||e.durationMs<=0||e.atMs+e.durationMs>score.durationMs+1)throw Error('누적 이벤트 오류');before=e.atMs;}
          if(expression==='morse'&&(!Array.isArray(score.segments)||score.segments.length>50000))throw Error('누적 모스 오류');
        }
      }
    }
    return records;
  }
  globalThis.HelloTypeOnline={enabled,initialize,prepare,retry,validateScores,getRound:()=>({...round}),getStatus:()=>status,pending:()=>read().length};
})();
