globalThis.runQuestionDotTests=async({check,assert,same,frame})=>{
  const w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id),C=w.HelloQuestionConfig,I=w.HelloQuestionInput,D=w.HelloQuestionData,M=w.HelloQuestionMorse,T=w.HelloQuestionDots,A=w.HelloQuestionAudio,B=w.HelloQuestionDemo,Q=w.HelloQuestions;
  const finish=(r,at=4000,q=C.questions[0])=>{const a=r.finish(q,at);a.morse=M.compile(a);return D.validateAnswer(a,q.id);};
  const hit=(r,key,at,value,type='insertText',extra={})=>{r.keyDown({key,code:key===' '?'Space':`Key${key.toUpperCase()}`,...extra},at);r.before(type,key,at+1);r.input(value,type,at+2);r.keyUp(at+3);};
  const memory=()=>({text:null,getItem(){return this.text;},setItem(k,v){this.text=v;}});
  const batch=B.buildBatch(),old=w.HelloQuestionExamples.examples();
  check('발표:고정10명×30답변 ·한국어5명/영어5명 ·재현 가능',()=>{
    assert(batch.length===10&&batch.reduce((n,r)=>n+r.answers.length,0)===30);
    assert(batch.slice(0,5).every(r=>r.answers.every(a=>/[가-힣]/.test(a.text))));
    assert(batch.slice(5).every(r=>r.answers.every(a=>/^[a-z ]+$/.test(a.text))));
    assert(batch.every(r=>r.isDemo&&r.source==='synthetic'&&r.demoBatchId===B.batchId));same(batch,B.buildBatch());
  });
  check('발표:첫 침묵·활동 간격 Q1→Q3 설계 ·한글 조합 입력 ·제출 시각 일치',()=>{
    for(const r of batch){let previous=0;for(const [q,a] of r.answers.entries()){
      const events=a.typingActivities,first=events[0].atMs;
      assert(first>previous&&first>=[500,2000,5000][q]&&first<=[2000,5000,12000][q]);previous=first;
      const gaps=events.slice(1).map((e,i)=>e.atMs-events[i].atMs);
      assert(gaps.every(g=>g>0)&&new Set(gaps).size>1);
      if(q)assert(Math.max(...gaps)>=[1000,1000,2000][q]);
      assert(a.text===a.characters.map(c=>c.char).join('')&&a.submittedAtMs>a.lastTextInputMs);
      if(r===batch[0])assert(a.events.some(e=>e.type==='compositionupdate')&&events.length>a.characters.length);
    }}
  });
  check('발표:실제·기존6명 보존 ·seed 두 번 ·복원 조회10명/30답변 ·배치만 제거',()=>{
    const m=memory(),s=new D.Store(m),actual={...D.clone(old[0]),id:'real-preserve',source:'participant'};
    s.add([...old,actual]);const preserved=D.serialize(s.getRecords());
    const first=B.seed(s),second=B.seed(s);assert(first.added===10&&first.persisted&&second.added===0&&second.persisted);
    const restored=new D.Store(m);restored.restore();same(B.query(restored),{participants:10,answers:30});
    s.removeExamples();assert(s.records.length===11&&B.query(s).participants===10);
    restored.removeDemoBatch(B.batchId);assert(D.serialize(restored.getRecords())===preserved);
  });
  check('발표:20명 한도 초과 시 원자적 거부 ·저장 실패를 성공으로 알리지 않음',()=>{
    const s=new D.Store(memory());s.add(Array.from({length:11},(_,i)=>({...D.clone(old[0]),id:`preserve-${i}`})));
    const before=D.serialize(s.getRecords());let rejected=false;try{B.seed(s);}catch{rejected=true;}assert(rejected&&D.serialize(s.getRecords())===before);
    const blocked=new D.Store({getItem(){return null;},setItem(){throw Error('quota');}});assert(!B.seed(blocked).persisted&&!!blocked.warning);
  });
  let exact;
  check('점:원본 [500,800,2400]ms ·공백 포함 ·제출 전 침묵 ·80ms 동일 음',()=>{
    const r=new I.Recorder(0);hit(r,'a',500,'a');hit(r,' ',800,'a ');hit(r,'b',2400,'a b');exact=finish(r);
    const score=T.compile(exact);same(score.events.map(e=>e.atMs),[500,800,2400]);assert(score.events.every(e=>e.durationMs===80)&&score.durationMs===4000);
    assert(exact.typingActivities.every(e=>e.unit==='physical-key'));
    const record=D.participant('exact','participant',C.questions.map(q=>({...D.clone(exact),questionId:q.id,question:{ko:q.ko,en:q.en}})));
    const plan=A.buildPlan([record],{expression:'dots',questionId:'Q1'});same(plan.events.map(e=>e.atMs),[500,800,2400]);assert(plan.events.length===score.events.length);
  });
  check('점:한글 개별 조합 활동 ·keydown/beforeinput/update/input/end 중복 제거',()=>{
    const r=new I.Recorder(0);r.keyDown({key:'Process',code:'KeyR',keyCode:229},500);r.compositionStart(501);r.before('insertCompositionText','ㄱ',502);r.compositionUpdate('ㄱ',503);r.input('ㄱ','insertCompositionText',504,true);r.keyUp(505);
    r.keyDown({key:'Process',code:'KeyK',keyCode:229},800);r.before('insertCompositionText','가',801);r.compositionUpdate('가',802);r.input('가','insertCompositionText',803,true);r.compositionEnd('가','가',804);r.input('가','insertText',805);r.keyUp(806);
    const a=finish(r);assert(a.characters.length===1);same(T.compile(a).events.map(e=>e.atMs),[500,800]);
  });
  check('점:수정·Shift·방향키·Enter·repeat 제외 ·삭제된 타격은 남음',()=>{
    const r=new I.Recorder(0);hit(r,'a',500,'a');hit(r,'b',800,'ab');
    r.keyDown({key:'Backspace'},900);r.before('deleteContentBackward',null,901,{start:2,end:2});r.input('a','deleteContentBackward',902);r.keyUp(903);
    for(const [i,key] of ['Shift','ArrowLeft','Enter'].entries()){r.keyDown({key},1000+i*10);r.keyUp(1001+i*10);}
    r.keyDown({key:'a',code:'KeyA',repeat:true},1200);r.input('aa','insertText',1201);r.keyUp(1202);
    const a=finish(r);same(T.compile(a).events.map(e=>e.atMs),[500,800]);assert(a.events.some(e=>e.type==='commit'&&e.removed==='b'));
  });
  check('점:한글 조합 중 Backspace도 수정으로 제외 ·관찰 가능한 모바일 입력 단위',()=>{
    const r=new I.Recorder(0);r.compositionStart(500);r.input('ㄱ','insertCompositionText',500,true);r.input('가','insertCompositionText',800,true);
    r.keyDown({key:'Backspace'},900);r.input('ㄱ','insertCompositionText',901,true);r.keyUp(902);r.compositionEnd('ㄱ','ㄱ',950);
    const a=finish(r);same(T.compile(a).events.map(e=>e.atMs),[500,800]);assert(a.typingActivities.every(e=>e.unit==='observed-input'));
  });
  check('점:선택한 문자를 같은 문자로 다시 타이핑해도 실제 타격은 남음',()=>{
    const r=new I.Recorder(0);hit(r,'a',500,'a');r.keyDown({key:'a',code:'KeyA'},900);r.before('insertText','a',901,{start:0,end:1});r.input('a','insertText',902);r.keyUp(903);
    same(T.compile(finish(r)).events.map(e=>e.atMs),[500,900]);
  });
  check('점:붙여넣기·자동완성 타격 생성 금지 ·기존 문자는 정확한 확보 시각만 사용',()=>{
    const r=new I.Recorder(0);r.input('abc','insertFromPaste',100);r.input('abc','insertReplacementText',200);r.input('a','insertText',500);
    same(T.compile(finish(r)).events.map(e=>e.atMs),[500]);
    const a=old[0].answers[0],before=JSON.stringify(a),score=T.compile(a);
    assert(score.label==='문자 단위 기록 사용'&&score.events.length===a.characters.length);same(score.events.map(e=>e.atMs),a.characters.map(c=>c.atMs).sort((a,b)=>a-b));assert(JSON.stringify(a)===before);
  });
  check('점:변조 로그 거부 ·신/구 버전 JSON 왕복 ·모스 변환 동일',()=>{
    same(D.parse(D.serialize(batch)),batch);same(D.parse(D.serialize(old)),old);
    const a=D.clone(exact);a.typingActivities[0].atMs=0;let rejected=false;try{D.validateAnswer(a,'Q1');}catch{rejected=true;}assert(rejected);
    assert(batch.every(r=>r.answers.every(a=>JSON.stringify(M.compile(a))===JSON.stringify(a.morse))));
  });
  check('점:동일 시각은 그대로 겹침 ·4px 원 ·공통 시간 스케일/확대 ·fallback 표시',()=>{
    const a=D.clone(exact);a.typingActivities[1].atMs=500;
    const row=w.HelloQuestionVisual.row(batch[0],a,{expression:'dots',zoom:2}),nodes=row.querySelectorAll('.q-typing-dot');
    assert(nodes.length===3&&nodes[0].style.left===nodes[1].style.left&&Math.abs(parseFloat(nodes[2].style.left)-2400*C.pixelsPerMs*2)<1e-8);
    d.body.append(row);assert(w.getComputedStyle(nodes[0]).width==='4px');row.remove();
    assert(w.HelloQuestionVisual.row(old[0],old[0].answers[0],{expression:'dots'}).textContent.includes('문자 단위 기록 사용'));
  });
  {
    const score=A.buildPlan(batch,{expression:'dots',questionId:'Q1',speed:4}),context=new OfflineAudioContext(2,Math.ceil((score.durationMs/1000+.2)*44100),44100),p=new A.Player();p.context=context;p.connectOutput(10);
    score.events.forEach(e=>p.schedule(e,.05+e.atMs/1000,e.durationMs/1000));const buffer=await context.startRendering();let peak=0,energy=0;for(let c=0;c<2;c++)for(const value of buffer.getChannelData(c)){peak=Math.max(peak,Math.abs(value));energy+=value*value;}
    check(`점 실제 오디오:10명 Q1 ·${score.events.length}활동과 음 수 동일 ·무클리핑`,()=>assert(peak>0&&peak<.98&&energy>0&&score.events.length===batch.reduce((n,r)=>n+r.answers[0].typingActivities.length,0)));p.stop();
  }
  const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
  const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change'));};
  Q.store.clear();w.HelloExperiments.selectMode('b');$('q-seed-demo').click();$('q-seed-demo').click();
  const real={...D.clone(old[0]),id:'real-ui',source:'participant'};Q.store.add([real]);$('q-open-landscape').click();
  check('점 UI:실제 localStorage 등록조회10명/30답변 ·중복 없음 ·실제11번째 보존',()=>assert(Q.store.records.length===11&&$('q-demo-count').textContent.includes('30답변')&&new D.Store(w.localStorage).restore().length===11));
  change('q-data-filter','actual');check('점 UI:실제만/더미만/함께 필터',()=>{assert($('q-board').querySelectorAll('.q-row').length===3);change('q-data-filter','demo');assert($('q-board').querySelectorAll('.q-row').length===30);change('q-data-filter','all');assert($('q-board').querySelectorAll('.q-row').length===33);});
  change('q-person',batch[0].id);change('q-question-selection','Q2');$('q-play-all').click();await flush();
  const source=D.serialize(Q.store.getRecords());change('q-expression','dots');
  check('점 UI:모드 변경은 음·예약·RAF 완전 정지 ·관객/질문/필터 유지 ·원본 불변',()=>assert(!Q.player.running&&Q.player.timer===null&&Q.player.voices.size===0&&Q.diagnostics().frame===null&&$('q-person').value===batch[0].id&&$('q-question-selection').value==='Q2'&&$('q-data-filter').value==='all'&&D.serialize(Q.store.getRecords())===source));
  $('q-play-all').click();await flush();check('점 UI:선택 Q2 점 모드 처음부터 재생 ·공통 배율 ·재청취',()=>{assert(Q.player.running&&Q.player.plan.expression==='dots'&&Q.player.plan.groups[0].questionId==='Q2');$('q-stop').click();assert(!Q.player.running&&Q.player.voices.size===0);});
  const confirm=w.confirm;w.confirm=()=>false;$('q-remove-demo').click();assert(Q.store.records.length===11);w.confirm=()=>true;$('q-remove-demo').click();w.confirm=confirm;
  check('점 UI:배치 제거 확인 취소 시 유지 ·확인 시 실제 기록 보존',()=>assert(Q.store.records.length===1&&Q.store.records[0].id==='real-ui'));
  change('q-expression','morse');change('q-question-selection','all');change('q-data-filter','all');Q.store.clear();w.HelloExperiments.selectMode('home');
};
