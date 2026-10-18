globalThis.runQuestionTests=async({check,assert,same,frame})=>{
  const w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id),C=w.HelloQuestionConfig,I=w.HelloQuestionInput,M=w.HelloQuestionMorse,D=w.HelloQuestionData,A=w.HelloQuestionAudio,Q=w.HelloQuestions;
  const answer=(text,first=1000,step=200,tail=900,question=C.questions[0])=>{const r=new I.Recorder(0);Array.from(text).forEach((char,i)=>r.input(r.text+char,'insertText',first+i*step));const a=r.finish(question,first+(Array.from(text).length-1)*step+tail);a.morse=M.compile(a);return a;};
  check('질문:국문 자모 26개 공식 별표와 대조 · 영문·숫자·기본 문장부호',()=>{
    same(Array.from('ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅔ').map(c=>M.KOREAN[c]),['.-..','..-.','-...','...-','--','.--','--.','-.-','.--.','-.-.','-..-','--..','---','.---','.','..','-','...','.-','-.','....','.-.','-..','..-','--.-','-.--']);
    assert(M.encode('A').parts[0].code==='.-'&&M.encode('7').parts[0].code==='--...'&&M.encode('?').parts[0].code==='..--..');
  });
  check('질문:한글 음절·독립/현대 자모 · 쌍자음·복합모음·겹받침 분해',()=>{
    same(M.decompose('안'),['ㅇ','ㅏ','ㄴ']);same(M.encode('값').parts.map(p=>p.jamo),['ㄱ','ㅏ','ㅂ','ㅅ']);
    same(M.encode('꽤').parts.map(p=>p.jamo),['ㄱ','ㄱ','ㅗ','ㅐ']);same(M.encode('ㅢ').parts.map(p=>p.jamo),['ㅡ','ㅣ']);
    assert(M.encode('ᄀ').parts[0].code===M.KOREAN['ㄱ']&&M.encode('ᅡ').parts[0].code==='.'&&M.encode('ᆨ').parts[0].code===M.KOREAN['ㄱ']);
    for(let code=0xac00;code<=0xd7a3;code++)assert(M.encode(String.fromCharCode(code)).kind==='korean');
  });
  check('질문:질문 시작 기준 첫 침묵·문자 간 멈춤·제출 전 침묵 유지',()=>{
    const a=answer('hi',4200,3100,2300);assert(a.characters[0].atMs===4200&&a.firstActivityMs===4200&&a.submittedAtMs===9600);
    assert(a.morse.segments[0].durationMs===4200&&a.morse.segments.at(-1).durationMs===2300);
    assert(a.morse.segments.some(s=>s.kind==='input-silence'&&s.durationMs===3100));
    assert(a.morse.durationMs>a.submittedAtMs&&a.morse.originalDurationMs===9600);
    const originalSilences=a.morse.segments.filter(s=>s.kind.endsWith('silence')).reduce((n,s)=>n+s.durationMs,0);assert(originalSilences===a.submittedAtMs);
  });
  check('질문:Q3 시간 강제 확대 없음 · 같은 기록은 같은 변환',()=>{
    const a=answer('same',1000,300,2000),b=answer('same',1000,300,2000,C.questions[2]);same(a.morse,b.morse);
    assert(answer('AB',2000,1500,1500).morse.durationMs===6360);
  });
  check('질문:IME 활동과 확정 시각 분리 · compositionend 후 input 중복 없음',()=>{
    const r=new I.Recorder(1000);r.compositionStart(3000);r.compositionUpdate('ㄱ',3100);r.input('가','insertCompositionText',3200,true);r.compositionEnd('가','가',3400);r.input('가','insertText',3401);
    const a=r.finish(C.questions[0],5000);assert(a.firstActivityMs===2000&&a.characters.length===1&&a.characters[0].atMs===2400&&a.lastTextInputMs===2400&&a.submittedAtMs===4000);
  });
  check('질문:삭제된 문자 제외 · 수정 시간 보존 · 동일 문자 중간 삭제 위치 정확',()=>{
    const r=new I.Recorder(0);r.input('l','insertText',100);r.input('ll','insertText',200);r.input('lll','insertText',300);
    r.before('deleteContentBackward',null,900,{start:2,end:2});r.input('ll','deleteContentBackward',900);
    same(r.characters.map(c=>c.atMs),[100,300]);const a=r.finish(C.questions[0],1600);a.morse=M.compile(a);D.validateAnswer(a,'Q1');
    assert(a.morse.segments.some(s=>s.kind==='revision-silence'&&s.durationMs===600)&&a.morse.segments.at(-1).durationMs===700);
    assert(a.events.some(e=>e.type==='commit'&&e.removed==='l'));
  });
  check('질문:중간 삽입은 최종 문장 위치 보존 · 재생은 실제 확정 순서',()=>{
    const r=new I.Recorder(0);r.input('a','insertText',100);r.input('ab','insertText',200);r.before('insertText','c',1000,{start:0,end:0});r.input('cab','insertText',1000);
    const a=r.finish(C.questions[0],2000);a.morse=M.compile(a);same(a.characters.map(c=>c.atMs),[1000,100,200]);
    assert(a.morse.events[0].charIndex===1&&a.morse.events.at(-1).charIndex===0);D.validateAnswer(a,'Q1');
  });
  check('질문:붙여넣기/자동완성 bulk를 추정하지 않음 · 계속 직접 입력 가능',()=>{
    const r=new I.Recorder(0);assert(r.input('abc','insertText',200).blocked&&r.text==='');assert(r.input('x','insertReplacementText',300).blocked);
    r.input('a','insertText',1000);const a=r.finish(C.questions[0],2000);assert(a.firstActivityMs===1000&&a.events.filter(e=>e.type==='blocked').length===2);
  });
  check('질문:매우 긴 붙여넣기 시도 후에도 직접 입력·제출 가능',()=>{
    const r=new I.Recorder(0);r.before('insertFromPaste','x'.repeat(2000),100,{start:0,end:0});r.blocked(100,'paste');r.input('x'.repeat(2000),'insertFromPaste',101);
    r.input('a','insertText',1000);const a=r.finish(C.questions[0],2000);a.morse=M.compile(a);D.validateAnswer(a,'Q1');
    assert(a.text==='a'&&a.events.some(e=>e.dataLength===2000)&&a.events.some(e=>e.valueLength===2000));
  });
  check('질문:포커스 이탈 별도 기록 · 미지원 문자 위치와 침묵 보존',()=>{
    const r=new I.Recorder(0);r.input('🙂','insertText',500);r.loseFocus(600,'window');r.loseFocus(700,'hidden');r.gainFocus(2600);
    const a=r.finish(C.questions[0],3000);a.morse=M.compile(a);D.validateAnswer(a,'Q1');assert(a.focusLoss.length===1&&a.focusLoss[0].toMs===2600);
    assert(a.morse.segments.some(s=>s.kind==='unsupported'&&s.char==='🙂')&&a.morse.events.length===0);
  });
  const examples=w.HelloQuestionExamples.examples();
  check('질문:6명×3답변 합성 예시 재현 · 한/영/혼합 · 삭제 및 가설 반례',()=>{
    assert(examples.length===6&&examples.every(p=>p.answers.length===3&&p.source==='synthetic'));same(w.HelloQuestionExamples.examples(),examples);
    assert(examples.some(p=>p.answers.some(a=>/[가-힣]/.test(a.text)&&/[a-z]/i.test(a.text))));
    assert(examples.some(p=>p.answers.some(a=>a.events.some(e=>e.type==='commit'&&e.removed))));
    assert(examples[3].answers[0].firstActivityMs>examples[4].answers[2].firstActivityMs);
  });
  check('질문:원본·파생 모스 JSON 왕복 · 기존 v1 거부 · 잘못된 로그는 거부',()=>{
    same(D.parse(D.serialize(examples)),examples);
    for(const change of [p=>{p.schemaVersion=1;},p=>{p.answers[0].characters[0].atMs=0;},p=>{p.answers[0].text='wrong';},p=>{p.answers[0].morse.events[0].durationMs=1;},p=>{p.answers[0].firstActivityMs=Infinity;}]){
      const value=D.clone(examples[0]);change(value);let threw=false;try{D.validate(value);}catch{threw=true;}assert(threw);
    }
  });
  check('질문:저장·복원·ID 중복 방지 · 불량 입력 원자적 거부 · 예시만 제거',()=>{
    const memory={text:null,getItem(){return this.text;},setItem(k,v){this.text=v;}},s=new D.Store(memory);assert(s.add(examples)===6&&s.add(examples)===0);
    const actual=D.clone(examples[0]);actual.id='actual-test';actual.source='participant';s.add([actual]);
    const restored=new D.Store(memory);same(restored.restore(),s.getRecords());const before=JSON.stringify(s.getRecords());
    let threw=false;try{s.add([{...actual,id:'valid-next'},{...actual,schemaVersion:1}]);}catch{threw=true;}assert(threw&&before===JSON.stringify(s.getRecords()));
    s.removeExamples();assert(s.records.length===1&&s.records[0].source==='participant');
  });
  const snapshot=JSON.stringify(examples),plan=A.buildPlan(examples),fast=A.buildPlan(examples,{speed:2});
  check('질문:Q1→Q2→Q3 · 같은 질문 공통 시작 · 전체 공통 속도만 적용',()=>{
    assert(plan.groups.length===3&&plan.groups[0].atMs===0&&plan.groups[1].atMs===plan.groups[0].durationMs+C.questionGapMs);
    plan.events.forEach((e,i)=>{assert(fast.events[i].atMs===e.atMs/2&&fast.events[i].durationMs===e.durationMs/2);});
    assert(JSON.stringify(examples)===snapshot&&fast.durationMs===plan.durationMs/2);
    for(const record of examples)for(const a of record.answers){const first=plan.events.find(e=>e.participantId===record.id&&e.questionId===a.questionId);const group=plan.groups.find(g=>g.questionId===a.questionId);assert(first.atMs===group.atMs+a.morse.events[0].atMs);}
  });
  check('질문:개별 질문·내 기록만 재생 · 음높이/pan은 질문별 동일',()=>{
    const ownPlan=A.buildPlan([examples[0]],{questionId:'Q2'});assert(ownPlan.groups.length===1&&ownPlan.groups[0].questionId==='Q2'&&ownPlan.layers===1);
    assert(ownPlan.events.every(e=>e.participantId===examples[0].id&&e.midi===examples[0].sound.midi&&e.pan===examples[0].sound.pan));
  });
  {
    const score=A.buildPlan(examples.slice(0,2),{questionId:'Q1',speed:4}),offline=new OfflineAudioContext(2,Math.ceil((score.durationMs/1000+.2)*44100),44100),p=new A.Player();p.context=offline;p.connectOutput(2);
    for(const event of score.events)p.schedule(event,.05+event.atMs/1000,event.durationMs/1000);
    const buffer=await offline.startRendering();let peak=0,energy=0;for(let c=0;c<2;c++)for(const value of buffer.getChannelData(c)){assert(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));energy+=value*value;}
    const firstTone=Math.min(...score.events.map(e=>e.atMs))/1000+.05;
    check(`질문 실제 오디오:점/선 ${score.events.length}개 · 첫 침묵 보존 ·무클리핑`,()=>{
      assert(energy>0&&peak<.98);const samples=buffer.getChannelData(0);for(let i=0;i<(firstTone-.01)*44100;i++)assert(samples[i]===0);
    });p.stop();
  }
  {
    const records=Array.from({length:20},(_,i)=>({...D.clone(examples[i%6]),id:`audio-layer-${i}`,sound:D.soundFor(`audio-layer-${i}`)}));
    const score=A.buildPlan(records,{speed:4}),offline=new OfflineAudioContext(2,Math.ceil((score.durationMs/1000+.2)*44100),44100),p=new A.Player();p.context=offline;p.connectOutput(20);
    score.events.forEach(e=>p.schedule(e,.05+e.atMs/1000,e.durationMs/1000));const buffer=await offline.startRendering();let peak=0;
    for(let c=0;c<2;c++)for(const value of buffer.getChannelData(c)){assert(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));}
    check(`질문 실제 오디오:20명×세 질문 ·${score.events.length}부호 ·무클리핑 (peak ${peak.toFixed(4)})`,()=>assert(peak>0&&peak<.98&&score.groups.length===3));p.stop();
  }
  {
    const score=A.buildPlan(examples.slice(0,2),{speed:4,questionId:'Q1'}),offline=new OfflineAudioContext(2,44100,44100),p=new A.Player();p.context=offline;p.connectOutput(2);
    score.events.forEach(e=>p.schedule(e,.05+e.atMs/1000,e.durationMs/1000));p.stop();const buffer=await offline.startRendering();
    check('질문 실제 정지 렌더:예약한 미래 부호까지 취소 후 완전 무음',()=>assert(buffer.getChannelData(0).every(x=>x===0)&&buffer.getChannelData(1).every(x=>x===0)));
  }
  function fakeContext(){const sources=[],param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}}),node=()=>({connect(to){return to;},disconnect(){this.disconnected=true;}});return {sources,state:'running',currentTime:0,destination:node(),createGain:()=>({...node(),gain:param()}),createStereoPanner:()=>({...node(),pan:param()}),createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param()}),createOscillator(){const n={...node(),frequency:param(),start(time){this.startAt=time;},stop(time){this.stopAt=time;}};sources.push(n);return n;}};}
  const p=new A.Player(),clock=fakeContext();p.context=clock;await p.start(plan);clearInterval(p.timer);p.timer=null;
  clock.currentTime=p.startedAt+plan.events[0].atMs/1000;p.tick();
  check('질문:오디오시계 예약 · 정지 후 미래 음과 활성 음·타이머 정리',()=>{assert(clock.sources.length>0);p.stop();assert(p.voices.size===0&&p.timer===null&&!p.running&&clock.sources.every(s=>s.disconnected));});
  const suspended=new A.Player(),suspendedClock=fakeContext();let resume;suspendedClock.state='suspended';suspendedClock.resume=()=>new Promise(resolve=>{resume=()=>{suspendedClock.state='running';resolve();};});suspended.context=suspendedClock;
  const resuming=suspended.start(plan);suspended.stop();resume();await resuming;
  check('질문:AudioContext resume 중 정지하면 늦은 예약 없음',()=>assert(!suspended.running&&suspended.timer===null&&suspendedClock.sources.length===0));
  const wait=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('question UI timeout / '+$('q-feedback').textContent);};
  Q.store.clear();w.HelloExperiments.selectMode('b');w.HelloTypeExperience.openOperator();Q.player.context=fakeContext();
  let time=10000;const oldNow=w.performance.now.bind(w.performance);Object.defineProperty(w.performance,'now',{configurable:true,value:()=>time});
  const input=(value,type='insertText',composing=false)=>{$('q-answer').value=value;$('q-answer').setSelectionRange(value.length,value.length);$('q-answer').dispatchEvent(new w.InputEvent('input',{inputType:type,isComposing:composing,bubbles:true}));};
  $('q-begin').click();$('q-intro-start').click();await wait(()=>!$('q-answer').disabled&&Q.diagnostics().questionIndex===0);
  check('질문 관객흐름:대기→안내→Q1 ·자동 포커스 ·입력 중 결과/소리/도구 숨김',()=>assert(d.activeElement===$('q-answer')&&!$('q-question').hidden&&$('q-results').hidden&&$('q-tools').hidden&&Q.player.voices.size===0));
  const paste=new w.Event('paste',{cancelable:true});$('q-answer').dispatchEvent(paste);assert(paste.defaultPrevented);
  time+=4200;input('r');time+=200;input('re');time+=600;input('red');time+=1700;$('q-submit').click();
  await wait(()=>Q.diagnostics().questionIndex===1&&!$('q-answer').disabled);
  check('질문 관객흐름:Q1 제출 후 Q2만 표시 ·아직 변환 결과 비공개',()=>assert($('q-prompt-ko').textContent===C.questions[1].ko&&$('q-results').hidden&&Q.store.records.length===0));
  time+=1300;$('q-answer').dispatchEvent(new w.CompositionEvent('compositionstart',{bubbles:true}));time+=40;$('q-answer').dispatchEvent(new w.CompositionEvent('compositionupdate',{data:'ㄱ',bubbles:true}));input('ㄱ','insertCompositionText',true);time+=180;input('감','insertCompositionText',true);$('q-answer').dispatchEvent(new w.CompositionEvent('compositionend',{data:'감',bubbles:true}));input('감');
  time+=200;$('q-answer').dispatchEvent(new w.CompositionEvent('compositionstart',{bubbles:true}));time+=120;input('감사','insertCompositionText',true);$('q-answer').dispatchEvent(new w.CompositionEvent('compositionend',{data:'사',bubbles:true}));input('감사');time+=700;$('q-submit').click();
  await wait(()=>Q.diagnostics().questionIndex===2&&!$('q-answer').disabled);
  time+=250;input('h');time+=180;input('hi');time+=900;$('q-submit').click();await wait(()=>Q.diagnostics().state==='results');
  const own=Q.getPending();
  check('질문 관객흐름:세 답변 후만 공개 ·한국어 중복 없음 ·Q3가 더 빨라도 그대로',()=>{
    assert(own.answers[1].text==='감사'&&own.answers[1].characters.length===2&&own.answers[0].characters[0].atMs===4200);
    assert(own.answers[2].firstActivityMs<own.answers[0].firstActivityMs&&Q.store.records.length===0&&$('q-board').querySelectorAll('.q-question-column').length===3);
    assert(!$('q-board').textContent.includes('감사')&&!$('q-show-original').checked);
  });
  $('q-join').click();
  check('질문 관객흐름:합류는 완성된 세 응답만 저장 ·나의 행 강조',()=>assert(Q.store.records.length===1&&Q.store.records[0].id===own.id&&$('q-board').querySelectorAll('.q-current').length===3));
  $('q-load-examples').click();$('q-load-examples').click();
  check('질문 발표:합성 예시6명 중복 없이 추가 ·참여기록 보존 ·원문 숨김',()=>assert(Q.store.records.length===7&&$('q-board').textContent.includes('합성')&&!$('q-board').textContent.includes('감사')));
  $('q-play-all').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  const currentPlan=Q.player.plan;$('q-axis').value='original';$('q-axis').dispatchEvent(new w.Event('change'));
  check('질문 발표:원본/모스 전환은 같은 데이터·같은 오디오 시간축',()=>assert(Q.player.plan===currentPlan&&$('q-board').querySelectorAll('.q-original-point').length>0));
  const beforeSpeed=D.serialize(Q.store.getRecords());$('q-speed').value='2';$('q-speed').dispatchEvent(new w.Event('change'));
  check('질문 발표:공통 속도 변경 시 안전 정지 ·원본 변경 없음 ·현재 배율 표시',()=>assert(!Q.player.running&&D.serialize(Q.store.getRecords())===beforeSpeed&&$('q-rate').textContent.includes('2×')));
  $('q-next-visitor').click();
  check('질문 다음 관객:입력 화면만 초기화 ·원문 공개 해제 ·누적 유지',()=>assert(Q.diagnostics().state==='waiting'&&Q.store.records.length===7&&!$('q-show-original').checked));
  $('q-begin').click();$('q-intro-start').click();await wait(()=>!$('q-answer').disabled);time+=1000;input('x');$('q-cancel').click();
  check('질문 중도취소:부분 세션은 완료 관객에 추가하지 않음',()=>assert(Q.store.records.length===7&&Q.diagnostics().state==='waiting'&&!Q.getPending()));
  $('q-begin').click();$('q-intro-start').click();await wait(()=>!$('q-answer').disabled);time+=500;$('q-answer').dispatchEvent(new w.CompositionEvent('compositionstart',{bubbles:true}));input('가','insertCompositionText',true);
  const delayedSubmit=Q.submit();await new Promise(resolve=>setTimeout(resolve,25));time+=100;$('q-answer').dispatchEvent(new w.CompositionEvent('compositionend',{data:'가',bubbles:true}));input('가');await delayedSubmit;await wait(()=>Q.diagnostics().questionIndex===1&&!$('q-answer').disabled);
  check('질문:조합 중 제출은 확정을 기다린 뒤 한 번만 다음 질문으로 이동',()=>assert(Q.diagnostics().answers===1&&Q.store.records.length===7));$('q-cancel').click();
  const beforeInvalid=D.serialize(Q.store.getRecords()),transfer=new w.DataTransfer();transfer.items.add(new w.File(['{"schemaVersion":1}'],'old.json',{type:'application/json'}));$('q-file').files=transfer.files;$('q-file').dispatchEvent(new w.Event('change'));
  await wait(()=>$('q-feedback').textContent.includes('불러오기 실패'));
  check('질문 실제 파일UI:v1/손상 파일 거부 ·기존 기록 보존',()=>assert(D.serialize(Q.store.getRecords())===beforeInvalid));
  $('q-open-landscape').click();$('q-play-all').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();w.HelloExperiments.selectMode('a');
  check('질문→A:미래 음·애니메이션·입력 리스너 취소 ·A 보존',()=>{const s=Q.diagnostics();assert(!s.active&&!s.running&&s.voices===0&&s.frame===null&&s.inputBindings===0&&w.HelloOrchestra.diagnostics().active);});
  Q.store.clear();Object.defineProperty(w.performance,'now',{configurable:true,value:oldNow});w.HelloExperiments.selectMode('home');
};
