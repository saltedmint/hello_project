(() => {
  'use strict';
  const C=HelloQuestionConfig,M=HelloQuestionMorse,I=HelloQuestionInput;
  const clone=value=>JSON.parse(JSON.stringify(value)),fail=message=>{throw Error(`질문 기록: ${message}`);};
  const finite=value=>Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const MIDI=[60,62,64,67,69,72,74,76,79,81];
  function soundFor(id){const hash=Array.from(id).reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);return {midi:MIDI[hash%MIDI.length],pan:((hash>>>8)%601-300)/1000};}
  function validateAnswer(value,questionId) {
    if(!value||value.questionId!==questionId||!Number.isInteger(value.questionVersion)||value.questionVersion<1||!['dom-composition-v1','dom-typing-v2','dom-activity-v3'].includes(value.recordingVersion))fail('질문 ID·버전·입력 기록 버전을 확인해 주세요.');
    if(!value.question||!['ko','en'].every(k=>typeof value.question[k]==='string'&&value.question[k].length>0&&value.question[k].length<=500))fail('질문 원문이 없습니다.');
    if(typeof value.text!=='string'||!value.text.trim()||Array.from(value.text).length>C.maxCharacters||!finite(value.submittedAtMs))fail('답변 또는 제출 시각이 올바르지 않습니다.');
    if(!Array.isArray(value.events)||value.events.length>10000||!Array.isArray(value.characters)||!Array.isArray(value.focusLoss))fail('입력 로그가 올바르지 않습니다.');
    let previous=0,characters=[],text='',first=null,last=null,openFocus=null;const focusLoss=[];
    const grouped=value.recordingVersion==='dom-activity-v3';
    const types=['beforeinput','input','compositionstart','compositionupdate','compositionend','commit','activity','blocked','focusout','focusin','keydown','keyup',...(grouped?['compositionfinalize']:[])];
    for(const event of value.events){
      if(!event||!types.includes(event.type)||!finite(event.atMs)||event.atMs<previous||event.atMs>value.submittedAtMs)fail('이벤트 시각 순서 또는 종류가 올바르지 않습니다.');
      previous=event.atMs;
      for(const field of ['dataLength','valueLength'])if(event[field]!==undefined&&(!Number.isSafeInteger(event[field])||event[field]<0))fail('일괄 입력 길이가 올바르지 않습니다.');
      if(event.type==='keydown'&&(typeof event.key!=='string'||event.key.length>100||typeof event.code!=='string'||event.code.length>100||typeof event.eligible!=='boolean'||typeof event.repeat!=='boolean'))fail('키 입력 로그 형식이 올바르지 않습니다.');
      for(const field of ['value','data','added','removed','kind','inputType','reason'])if(event[field]!==undefined&&event[field]!==null&&(typeof event[field]!=='string'||Array.from(event[field]).length>500))fail('이벤트 내용이 올바르지 않습니다.');
      if(event.type==='activity'){first??=event.atMs;last=event.atMs;}
      if(event.type==='commit'){
        if(typeof event.value!=='string'||Array.from(event.value).length>C.maxCharacters)fail('수정 이벤트가 올바르지 않습니다.');
        if(event.selection){const {start,end}=event.selection;if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>characters.length)fail('수정 선택 영역이 올바르지 않습니다.');}
        const edit=I.editCharacters(characters,event.value,event.atMs,event.selection);
        if((!grouped&&edit.added.length>1)||edit.added.join('')!==event.added||edit.removed.join('')!==event.removed)fail('여러 글자 입력 또는 수정 로그가 일치하지 않습니다.');
        characters=edit.characters;text=event.value;
      }
      if(event.type==='focusout'){if(openFocus)fail('포커스 이탈 로그가 겹칩니다.');openFocus={fromMs:event.atMs,reason:event.reason};}
      if(event.type==='focusin'){if(!openFocus)fail('포커스 복귀가 일치하지 않습니다.');focusLoss.push({...openFocus,toMs:event.atMs});openFocus=null;}
    }
    if(openFocus||!equal(focusLoss,value.focusLoss)||text!==value.text||!equal(characters,value.characters)||first!==value.firstActivityMs||last!==value.lastTextInputMs||first===null||last===null)fail('최종 답변·문자 시각·활동·포커스 로그가 일치하지 않습니다.');
    if(characters.some(c=>!finite(c.atMs)||c.atMs>last)||last>value.submittedAtMs)fail('문자 시각 범위가 올바르지 않습니다.');
    const result={questionId:value.questionId,questionVersion:value.questionVersion,question:clone(value.question),recordingVersion:value.recordingVersion,text:value.text,
      characters:clone(value.characters),events:clone(value.events),firstActivityMs:first,lastTextInputMs:last,submittedAtMs:value.submittedAtMs,focusLoss:clone(focusLoss)};
    if(value.recordingVersion==='dom-typing-v2'||grouped){
      const activities=I.collectTyping(value.events,{grouped});
      if(!equal(activities,value.typingActivities))fail('입력 활동 로그와 원본 이벤트가 일치하지 않습니다.');
      if(activities.some((e,i)=>!finite(e.atMs)||e.atMs>value.submittedAtMs||(i&&e.atMs<activities[i-1].atMs)))fail('입력 활동 시각을 확인해 주세요.');
      result.typingActivities=activities;
    }
    const morse=M.compile(result);
    if(!finite(morse.durationMs)||!equal(morse,value.morse))fail('원본과 모스 변환 결과가 다릅니다.');
    return {...result,morse};
  }
  function validate(value) {
    if(!value||value.schemaVersion!==2||value.kind!=='three-questions')fail('질문형 schemaVersion 2가 필요합니다. 이전 B 자료는 이전 B 화면에서 열어 주세요.');
    if(typeof value.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.id)||!['participant','synthetic'].includes(value.source))fail('관객 ID 또는 출처가 올바르지 않습니다.');
    if(!value.sound||!MIDI.includes(value.sound.midi)||!Number.isFinite(value.sound.pan)||Math.abs(value.sound.pan)>.3)fail('음높이 또는 좌우 설정이 올바르지 않습니다.');
    if(!Array.isArray(value.answers)||value.answers.length!==C.questions.length)fail('완료한 세 답변이 필요합니다.');
    if(value.isDemo!==undefined&&(typeof value.isDemo!=='boolean'||(value.isDemo&&value.source!=='synthetic')))fail('합성 데이터 표시를 확인해 주세요.');
    if(value.demoBatchId!==undefined&&(!value.isDemo||value.source!=='synthetic'||typeof value.demoBatchId!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(value.demoBatchId)))fail('합성 배치 ID를 확인해 주세요.');
    return {schemaVersion:2,kind:'three-questions',id:value.id,source:value.source,
      ...(value.isDemo!==undefined?{isDemo:value.isDemo}:{}),...(value.demoBatchId?{demoBatchId:value.demoBatchId}:{}),sound:{midi:value.sound.midi,pan:value.sound.pan},answers:C.questions.map((q,i)=>validateAnswer(value.answers[i],q.id))};
  }
  function participant(id,source,answers){return validate({schemaVersion:2,kind:'three-questions',id,source,sound:soundFor(id),answers});}
  const serialize=records=>JSON.stringify({schemaVersion:2,kind:'three-questions-collection',records:records.map(validate)},null,2);
  function parse(text) {
    if(typeof text!=='string'||new Blob([text]).size>C.maxFileBytes)fail('파일은 16MB 이하여야 합니다.');
    let value;try{value=JSON.parse(text);}catch{fail('올바른 JSON이 아닙니다.');}
    if(!value||value.schemaVersion!==2||value.kind!=='three-questions-collection'||!Array.isArray(value.records)||value.records.length>C.maxParticipants)fail('질문형 v2 전체 기록 파일이 필요합니다. 이전 B 자료는 이전 B 화면을 이용하세요.');
    const records=value.records.map(validate);if(new Set(records.map(r=>r.id)).size!==records.length)fail('파일에 중복 관객 ID가 있습니다.');return records;
  }
  class Store {
    constructor(storage){this.storage=storage;this.records=[];this.warning='';}
    restore(){try{const text=this.storage.getItem(C.storageKey);if(text)this.records=parse(text);}catch{this.warning='로컬 기록을 복원하지 못했습니다. 저장 원본을 지우지 않았습니다.';}return this.getRecords();}
    getRecords(){return clone(this.records);}
    save(records){this.warning='';try{this.storage.setItem(C.storageKey,serialize(records));}catch{this.warning='로컬 저장 실패: 현재 기록은 메모리에 보존했습니다. JSON으로 백업해 주세요.';}this.records=records;}
    add(values){const checked=values.map(validate),next=this.getRecords(),ids=new Set(next.map(r=>r.id));for(const r of checked)if(!ids.has(r.id)){next.push(r);ids.add(r.id);}if(next.length>C.maxParticipants)fail('최대 20명입니다. JSON 백업 후 운영 도구에서 정리해 주세요.');const added=next.length-this.records.length;this.save(next);return added;}
    removeExamples(){this.save(this.records.filter(r=>r.source!=='synthetic'||r.demoBatchId||!/^questions-example-v1-[1-6]$/.test(r.id)));}
    removeDemoBatch(batchId){this.save(this.records.filter(r=>r.demoBatchId!==batchId));}
    clear(){this.save([]);}
  }
  globalThis.HelloQuestionData={clone,validateAnswer,validate,participant,soundFor,serialize,parse,Store};
})();
