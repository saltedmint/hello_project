globalThis.runSoundscapeTests = async ({check,assert,same,frame}) => {
  const w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id);
  const D=w.HelloSoundscapeData,V=w.HelloSoundscapeVisual,A=w.HelloSoundscapeAudio,b=w.HelloSoundscape;
  const key=(letter,extra={})=>({key:letter,code:letter===' '?'Space':'Key'+letter.toUpperCase(),...extra});
  const record=D.examples()[0];
  check('B 입력: 공백 포함14자 · 비공백13음 · 공백 전후 원본 간격',()=>{
    const r=new w.HelloTyping.PhraseRecorder(D.TEXT);r.start();
    Array.from(D.TEXT).forEach((letter,i)=>{r.keydown(key(letter),1000+record.relativeTimesMs[i]);r.release(key(letter).code);});
    assert(r.complete&&r.times.length===14);same(r.relative,record.relativeTimesMs);
    const events=A.plan([record]).events;assert(events.length===13&&!events.some(e=>e.index===5));
    assert(Math.abs(events[5].time-events[4].time-(record.relativeTimesMs[6]-record.relativeTimesMs[4])/1000)<1e-9);
  });
  check('B 입력: 오타·repeat·조합·누른 채 l 중복 제외 · keyup 후 허용',()=>{
    const r=new w.HelloTyping.PhraseRecorder(D.TEXT);r.start();
    for(const letter of 'he'){r.keydown(key(letter),10);r.release(key(letter).code);}
    r.keydown(key('l'),20);r.keydown(key('l'),30);r.keydown(key('l',{repeat:true}),40);assert(r.times.length===3);
    r.release('KeyL');r.keydown(key('l',{isComposing:true}),45);r.release('KeyL');assert(r.times.length===3);
    r.keydown(key('l'),50);r.release('KeyL');r.keydown(key('x'),55);same(r.relative,[0,0,10,40]);
  });
  check('B JSON: 원본 시각·음높이·좌우·시작 비율 왕복',()=>same(D.parse(D.serialize([record]))[0],record));
  const memory={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}};
  const store=new D.Store(memory);store.addRecords([record]);
  check('B 저장: 동일ID 제외 · 새 Store로 복원',()=>{
    assert(store.addRecords([record])===0);const restored=new D.Store(memory);restored.restore();same(restored.getRecords(),[record]);
  });
  check('B 검증: 비유한 숫자·순서·개수·음높이/pan/시작 범위 오류는 원자적 거부',()=>{
    const before=D.serialize(store.getRecords());
    const invalid=[{...record,b:{...record.b,midi:999}},{...record,b:{...record.b,pan:Infinity}},{...record,b:{...record.b,startFraction:2}},
      {...record,relativeTimesMs:[0,NaN]},{...record,durationMs:0},{...record,relativeTimesMs:record.relativeTimesMs.map((t,i)=>i===3?-1:t)},{...record,text:'hello'}];
    for(const bad of invalid){let threw=false;try{store.addRecords([D.examples()[1],bad]);}catch{threw=true;}assert(threw);same(D.serialize(store.getRecords()),before);}
    for(const text of ['{',JSON.stringify({schemaVersion:9,mode:'soundscape-b',records:[record]}),JSON.stringify({schemaVersion:1,mode:'soundscape-b',records:[record,record]})]){
      let threw=false;try{D.parse(text);}catch{threw=true;}assert(threw);
    }
  });
  check('B 저장:20개 한도 · 제거 · 저장 거부 시 메모리 보존과 안내',()=>{
    const s=new D.Store(memory);s.addRecords(D.examples(20));let threw=false;try{s.addRecords([{...record,id:'twenty-one'}]);}catch{threw=true;}
    assert(threw&&s.getRecords().length===20);s.remove(record.id);assert(s.getRecords().length===19);
    const denied=new D.Store({getItem(){throw Error();},setItem(){throw Error();}});denied.restore();assert(denied.warning);denied.addRecords([record]);assert(denied.warning&&denied.getRecords().length===1);
  });
  check('B 예시: 서로 다른10개 · 1/5/10/20 지원 · 결정적 배정',()=>{
    for(const n of [1,5,10,20])assert(D.examples(n).length===n);
    assert(new Set(D.examples().map(r=>JSON.stringify(r.relativeTimesMs))).size===10);
    assert(D.examples().every(r=>r.source==='example'));same(D.examples()[0],record);
  });
  check('B 모스: 국제 hello stranger 부호 · 공백 전후 시간을 다음 묶음에 합산',()=>{
    same(V.groups(record).map(g=>g.code),['....','.','.-..','.-..','---','...','-','.-.','.-','-.','--.','.','.-.']);
    const groups=V.groups(record);assert(groups.length===13&&groups[5].index===6);
    assert(groups[5].margin===V.gap(record.relativeTimesMs[6]-record.relativeTimesMs[4])+V.SETTINGS.wordGapPx);
  });
  check('B 비주얼: 선형 여백 · 공백 폭 분리 · 점/선 묶음',()=>{
    const row=V.render(record,'spacing');assert(row.children.length===14&&row.children[5].classList.contains('b-space'));
    assert(V.gap(1000)>V.gap(100)&&V.gap(200)===V.gap(200));
    const morse=V.render(record,'morse');assert(morse.children[0].querySelectorAll('.dot').length===4&&morse.children[4].querySelectorAll('.dash').length===3);
  });
  check('B 반복: 최소12초 · 긴 기록+2초 · 잔향 포함 구간내 · 매 반복 동일 간격',()=>{
    assert(A.periodFor([record])===12);
    const long=D.create(Array.from({length:14},(_,i)=>i*2000),'long');assert(A.periodFor([long])===28);
    for(const r of [...D.examples(20),long]){
      const p=A.plan([r],10);assert(p.events.every(e=>e.time>=10&&e.time+A.SETTINGS.attack+A.SETTINGS.release<p.end));
      const next=A.plan([r],p.end);p.events.forEach((e,i)=>assert(Math.abs(next.events[i].time-e.time-p.period)<1e-9));
    }
  });
  function fakeContext(){
    const sources=[];
    const param=()=>({value:0,events:[],setValueAtTime(...v){this.events.push(v);},linearRampToValueAtTime(...v){this.events.push(v);},exponentialRampToValueAtTime(...v){this.events.push(v);},setTargetAtTime(...v){this.events.push(v);},cancelScheduledValues(){}});
    const node=()=>({connect(to){return to;},disconnect(){this.disconnected=true;}});
    return {sources,currentTime:0,state:'running',destination:node(),createGain:()=>({...node(),gain:param()}),createStereoPanner:()=>({...node(),pan:param()}),
      createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}),
      createOscillator(){const source={...node(),frequency:param(),start(time){this.startAt=time;},stop(time){this.stopAt=time;}};sources.push(source);return source;}};
  }
  const p=new A.Player(),ctx=fakeContext();p.context=ctx;
  const first={...record,b:{...record.b,startFraction:0}},long=D.create(Array.from({length:14},(_,i)=>i*1200),'long-boundary');
  await p.start([first]);clearInterval(p.timer);p.timer=null;
  const firstStart=p.current.start,firstEnd=p.current.end;p.setRecords([first,long]);
  check('B 재생: 추가·길이 변경은 다음 반복 경계에서 적용',()=>{
    assert(p.current.records.length===1&&p.current.period===12);
    ctx.currentTime=firstEnd-.1;p.tick();assert(p.next.records.length===2&&Math.abs(p.next.period-17.6)<1e-9&&p.next.start===firstEnd);
  });
  const staged=ctx.sources.filter(s=>s.startAt>=firstEnd);p.setRecords([first]);
  check('B 재생: 경계직전 제거는 예약한 다음 음도 취소·재구성',()=>{
    assert(p.next===null&&staged.every(s=>s.disconnected));p.tick();assert(p.next.records.length===1);
    ctx.currentTime=firstEnd+.001;p.tick();assert(p.current.start===firstEnd&&p.current.records.length===1);
  });
  check('B 재생: 타이머 지연 후 과거 이벤트를 몰아서 재생하지 않음',()=>{
    const count=ctx.sources.length;ctx.currentTime=firstStart+240.3;p.tick();
    assert(ctx.sources.slice(count).every(s=>s.startAt>=ctx.currentTime)&&ctx.sources.length-count<13);
  });
  p.stop();check('B 정지: 현재·미래 소스·레이어·타이머·시각 이벤트 정리',()=>{
    assert(p.voices.size===0&&p.layers.size===0&&p.timer===null&&p.highlights().length===0&&!p.running&&ctx.sources.every(s=>s.disconnected));
  });
  const pendingPlayer=new A.Player(),pendingContext=fakeContext();let resume;
  pendingContext.state='suspended';pendingContext.resume=()=>new Promise(resolve=>{resume=()=>{pendingContext.state='running';resolve();};});
  pendingPlayer.context=pendingContext;const pendingStart=pendingPlayer.start([first]);pendingPlayer.stop();resume();await pendingStart;
  check('B resume 대기 중 정지: 늦은 오디오 예약·타이머 없음',()=>assert(!pendingPlayer.running&&pendingPlayer.timer===null&&pendingContext.sources.length===0));
  const peaks=[];
  for(const count of [1,5,10,20]){
    const offline=new OfflineAudioContext(2,44100*3,44100),rp=new A.Player();rp.context=offline;rp.volume=1;rp.connectOutput();
    const records=D.examples(20).slice(0,count).map(r=>D.validate({...r,relativeTimesMs:r.relativeTimesMs.map(t=>t/r.durationMs*650),durationMs:650,raw:undefined,b:{...r.b,startFraction:0}}));
    const cycle=A.plan(records,.1);rp.configureLayers(cycle);cycle.events.forEach(e=>rp.schedule(e,cycle.start));
    const buffer=await offline.startRendering();let peak=0,energy=0;
    for(let c=0;c<2;c++)for(const sample of buffer.getChannelData(c)){assert(Number.isFinite(sample));peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
    peaks.push(peak);
    check(`B 실제 오디오: ${count}레이어 · ${count*13}음 · 유한 파형·무클리핑 (peak ${peak.toFixed(4)})`,()=>assert(cycle.events.length===count*13&&peak>.0001&&peak<.8&&energy>0));
    rp.stop();
  }
  check('B 합산 음량:20레이어 피크가 1레이어의3배 미만',()=>assert(peaks[3]<peaks[0]*3));
  b.store.clear();w.HelloExperiments.selectMode('b');b.setRecords([]);b.player.context=fakeContext();
  let now=1000;const oldNow=w.performance.now.bind(w.performance);Object.defineProperty(w.performance,'now',{configurable:true,value:()=>now});
  const type=(letter,extra={})=>{for(const type of ['keydown','keyup'])$('b-input-zone').dispatchEvent(new w.KeyboardEvent(type,{...key(letter,extra),bubbles:true,cancelable:true}));};
  $('b-input-start').click();type('x');type('h',{isComposing:true});$('b-input-zone').dispatchEvent(new w.Event('paste',{cancelable:true}));
  Array.from(D.TEXT).forEach((letter,i)=>{now=1000+i*100;type(letter);});
  check('B 입력UI:오타·조합·붙여넣기 제외 · 무음 ·14자 미리보기',()=>assert(!$('b-submit').disabled&&!$('b-preview').hidden&&b.player.context.sources.length===0&&b.getRecords().length===0));
  $('b-submit').click();
  check('B 제출UI:14개 시각 누적·저장 · 다음 참가자 대기·중복제출 방지',()=>{
    assert(b.getRecords().length===1&&$('b-submit').disabled);same(b.getRecords()[0].relativeTimesMs,Array.from({length:14},(_,i)=>i*100));$('b-submit').click();assert(b.getRecords().length===1);
  });
  $('b-sound-start').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  const running=b.player.current,sourceCount=b.player.context.sources.length,snapshot=JSON.stringify(b.getRecords());$('b-morse').click();
  check('B 자간↔모스:기록·오디오시계 유지 ·13개 모스 묶음',()=>{
    assert(b.player.current===running&&b.player.context.sources.length===sourceCount&&JSON.stringify(b.getRecords())===snapshot);
    assert($('b-records').querySelectorAll('.b-morse-group').length===13);$('b-spacing').click();assert(b.player.current===running&&$('b-records').querySelectorAll('.b-letter').length===14);
  });
  check('B 재생강조:글자의 위치·폭·높이 불변',()=>{
    const letter=$('b-records').querySelector('.b-letter'),before=letter.getBoundingClientRect();letter.classList.add('b-sounding');const after=letter.getBoundingClientRect();assert(before.x===after.x&&before.width===after.width&&before.height===after.height);letter.classList.remove('b-sounding');
  });
  $('b-stop').click();check('B 정지UI:예약·RAF 취소 ·재시작 가능',()=>assert(!b.diagnostics().running&&b.diagnostics().voices===0&&b.diagnostics().frame===null&&!$('b-sound-start').disabled));
  const beforeImport=JSON.stringify(b.getRecords()),transfer=new w.DataTransfer();transfer.items.add(new w.File(['{bad'],'bad.json',{type:'application/json'}));$('b-json-file').files=transfer.files;$('b-json-file').dispatchEvent(new w.Event('change'));
  for(let i=0;i<200&&!$('b-feedback').textContent.includes('실패');i++)await new Promise(resolve=>setTimeout(resolve,5));
  check('B 실제 파일UI:잘못된 JSON 안내 ·기존기록 유지',()=>assert($('b-feedback').textContent.includes('실패')&&JSON.stringify(b.getRecords())===beforeImport));
  $('b-example-count').value='10';$('b-examples').click();$('b-examples').click();
  check('B 예시UI:기존기록 유지·중복 없음·예시 표시',()=>assert(b.getRecords().length===11&&$('b-records').textContent.includes('실제 참여자 아님')));
  const originalConfirm=w.confirm;w.confirm=()=>false;$('b-clear').click();assert(b.getRecords().length===11);w.confirm=()=>true;$('b-clear').click();w.confirm=originalConfirm;
  check('B 전체삭제:확인거부 보존 ·명시적확인 후 삭제',()=>assert(b.getRecords().length===0));
  b.addRecords([record]);$('b-sound-start').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();w.HelloExperiments.selectMode('a');
  check('B→A:소리·예약·RAF·B리스너 정리 ·A활성',()=>{const s=b.diagnostics();assert(!s.active&&!s.running&&s.voices===0&&s.frame===null&&s.inputBindings===0&&w.HelloOrchestra.diagnostics().active);});
  w.HelloExperiments.selectMode('b');$('b-input-start').click();type('h');w.dispatchEvent(new w.Event('blur'));
  check('B 입력이탈:부분시도 취소 ·오디오정지',()=>assert($('b-input-letters').querySelectorAll('.b-entered').length===0&&!b.diagnostics().running));
  b.addRecords([D.create(Array.from({length:14},(_,i)=>i*9000),'long-layout')]);
  check('B 긴 입력:각 행 내부 가로 스크롤 · 동일 간격은 동일 자간',()=>{
    $('b-spacing').click();const row=$('b-records').lastElementChild.querySelector('.b-phrase');
    assert(row.scrollWidth>row.clientWidth&&row.children[1].style.marginLeft===row.children[2].style.marginLeft);
  });
  check('B 모스:점1·선3·내부간격1단위 · 강조해도 묶음 폭 불변',()=>{
    $('b-morse').click();const group=$('b-records').querySelector('.b-morse-group'), dot=group.querySelector('.dot'), dash=$('b-records').querySelector('.dash');
    const unit=parseFloat(w.getComputedStyle(dot).width);assert(parseFloat(w.getComputedStyle(dash).width)===unit*3&&parseFloat(w.getComputedStyle(group).gap)===unit);
    const before=group.getBoundingClientRect();group.classList.add('b-sounding');assert(group.getBoundingClientRect().width===before.width);
    assert($('b-records').lastElementChild.querySelector('.b-phrase').scrollWidth>$('b-records').lastElementChild.querySelector('.b-phrase').clientWidth);
  });
  Object.defineProperty(w.performance,'now',{configurable:true,value:oldNow});b.store.clear();w.HelloExperiments.selectMode('home');
};
