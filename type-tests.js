globalThis.runTypeTests=async({check,assert,same,frame})=>{
  const w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id),T=w.HelloTypeExperience,S=w.HelloTypeSequence,C=w.HelloQuestionConfig,K=w.HelloTypeConfig,D=w.HelloQuestionData;
  const examples=w.HelloQuestionExamples.examples(),own={...D.clone(examples[0]),id:'type-own',source:'participant'};
  const sequence=S.build(own,[own,...examples],{expression:'dots',includeDemo:true});
  check('Your Type:한국어 질문 규칙 ·공백에만 200ms 추가 ·문장부호/음절 각 한 점',()=>{
    const q=S.questionScore({id:'test',ko:'가 나?'});same(q.events.map(e=>e.atMs),[0,400,600]);assert(q.source==='question-rule-v1'&&q.events.every(e=>e.durationMs===80));
    C.questions.forEach(q=>assert(S.questionScore(q).events.length===Array.from(q.ko).filter(c=>!(/\s/u.test(c))).length));
  });
  check('Your Type:정확한 9구간 순서 ·자기 ID 중복 제거 ·모든 원본 침묵/꼬리 보존',()=>{
    same(sequence.segments.map(s=>`${s.questionId}-${s.kind}`),['Q1-question','Q1-own','Q1-together','Q2-question','Q2-own','Q2-together','Q3-question','Q3-own','Q3-together']);
    for(const segment of sequence.segments){assert(segment.durationMs>=Math.max(...segment.plan.events.map(e=>e.atMs+e.durationMs)));if(segment.kind==='together')assert(segment.rows.filter(r=>r.id===own.id).length===1);
      if(segment.kind==='own'){const a=own.answers.find(a=>a.questionId===segment.questionId),source=w.HelloTypeTrim.compile(a,'dots');same(segment.plan.events.map(e=>e.atMs),source.events.map(e=>e.atMs));assert(segment.durationMs>=source.durationMs);}
    }
    sequence.segments.slice(1).forEach((s,i)=>assert(s.atMs===sequence.segments[i].atMs+sequence.segments[i].durationMs+K.transitionMs));
  });
  check('Your Type:더미 제외/결과 스냅샷 불변 ·모스여도 질문은 점 ·긴 침묵은 구간 내부',()=>{
    const before=JSON.stringify(examples),morse=S.build(own,[own,...examples],{expression:'morse',includeDemo:false});
    assert(morse.snapshot.length===1&&morse.segments.filter(s=>s.kind==='question').every(s=>s.rows[0].expression==='dots'));
    assert(JSON.stringify(examples)===before);const gap=sequence.segments[1];assert(S.locate(sequence,gap.atMs+100).index===1);
    const saved=sequence.snapshot[0].answers[0].text;own.answers[0].text='external mutation';assert(sequence.snapshot[0].answers[0].text===saved);own.answers[0].text=saved;
  });
  const recordWithEdges=(first=30000,submitted=90000,version='dom-typing-v2')=>D.participant('edge-test','participant',C.questions.map(q=>{
    const r=new w.HelloQuestionInput.Recorder(0,{recordingVersion:version});
    r.input('a','insertText',first);r.input('ab','insertText',first+300);r.input('abc','insertText',first+10000);
    const answer=r.finish(q,submitted);answer.morse=w.HelloQuestionMorse.compile(answer);return answer;
  }));
  const long=recordWithEdges(),original=D.serialize([long]);
  check('긴 양끝 침묵:앞 5초/뒤 1.5초 상한 ·중간 9.7초 멈춤과 모든 타격 유지',()=>{
    const score=w.HelloTypeTrim.compile(long.answers[0],'dots');same(score.events.map(e=>e.atMs),[5000,5300,15000]);
    assert(score.durationMs===16580&&score.edgeTrim.leadingRemovedMs===25000&&score.edgeTrim.trailingRemovedMs===48420);
    same(score.events.slice(1).map((e,i)=>e.atMs-score.events[i].atMs),[300,9700]);assert(D.serialize([long])===original);
  });
  check('긴 양끝 침묵:정상 경계는 그대로 ·구버전 문자 시각을 새 타격으로 추정하지 않음',()=>{
    const normal=recordWithEdges(500,11000),score=w.HelloTypeTrim.compile(normal.answers[0],'dots');
    same(score.events,w.HelloQuestionDots.compile(normal.answers[0]).events);assert(score.edgeTrim.leadingRemovedMs===0&&score.edgeTrim.trailingRemovedMs===0);
    const legacy=recordWithEdges(30000,90000,'dom-composition-v1'),old=w.HelloTypeTrim.compile(legacy.answers[0],'dots');assert(old.events.length===3&&old.label==='문자 단위 기록 사용');
  });
  check('긴 양끝 침묵:모스 부호/음 길이/간격 보존 ·그림과 오디오에 같은 조정 시각',()=>{
    const a=long.answers[0],score=w.HelloTypeTrim.compile(a,'morse');assert(score.events.length===a.morse.events.length);
    score.events.forEach((e,i)=>{assert(e.atMs===a.morse.events[i].atMs-score.edgeTrim.leadingRemovedMs&&e.durationMs===a.morse.events[i].durationMs&&e.symbol===a.morse.events[i].symbol);assert(score.segments.some(s=>s.kind==='tone'&&s.atMs===e.atMs));});
    const plan=S.build(long,[long],{expression:'morse',includeDemo:false});
    for(const segment of plan.segments.filter(s=>s.kind!=='question'))same(segment.plan.events.map(e=>e.atMs),segment.rows[0].score.events.map(e=>e.atMs));
  });
  check('긴 양끝 침묵:기존 JSON 복원 기록에도 자동 적용 ·원본 저장값/질문 생성 규칙 유지',()=>{
    const restored=D.parse(original),plan=S.build(restored[0],restored,{expression:'dots',includeDemo:false});
    assert(restored[0].answers[0].submittedAtMs===90000&&plan.segments[1].durationMs<20000&&plan.segments[1].rows[0].answer.submittedAtMs===90000);
    same(plan.segments[0].plan.events.map(e=>e.atMs),S.questionScore(C.questions[0]).events.map(e=>e.atMs));assert(D.serialize(restored)===original);
  });
  {
    const score=w.HelloTypeTrim.compile(long.answers[0],'dots'),context=new OfflineAudioContext(2,Math.ceil((score.durationMs/1000+.1)*44100),44100),p=new w.HelloQuestionAudio.Player();p.context=context;p.connectOutput(1);
    for(const e of score.events)p.schedule({participantId:'edge-audio',midi:60,pan:0},.02+e.atMs/1000,e.durationMs/1000);
    const buffer=await context.startRendering(),pcm=buffer.getChannelData(0);
    check('긴 양끝 침묵 실제 오디오:첫 5초 무음 ·조정된 시각에 발음 ·끝 잔향 보존',()=>{
      assert(pcm.slice(0,Math.floor(5.01*44100)).every(v=>v===0));assert(pcm.slice(Math.floor(5.04*44100),Math.floor(5.09*44100)).some(v=>v!==0));
      assert(pcm.slice(-44100).every(v=>v===0));
    });p.stop();
  }
  {
    const context=new OfflineAudioContext(2,44100,44100),p=new w.HelloQuestionAudio.Player();p.context=context;p.connectOutput(2);
    const scheduled=sequence.events.slice(0,5);for(const e of scheduled)p.schedule(e,.1+e.atMs/1000,e.durationMs/1000);
    p.stop();const buffer=await context.startRendering();check('Your Type:결과 예약 정지 후 실제 오프라인 파형 무음',()=>assert(buffer.getChannelData(0).every(v=>v===0)));
  }
  {
    const context=new OfflineAudioContext(2,44100,44100),sound=new w.HelloTypeSound.Sound(),p=new w.HelloQuestionAudio.Player();
    sound.context=context;sound.enabled=true;sound.volume=1;sound.ensureOutput();sound.startAmbient();p.context=context;p.output=sound.resultBus;p.setVolume(1);p.connectOutput(20);
    for(let i=0;i<20;i++)p.schedule({participantId:'layer-'+i,midi:60,pan:0,layerCount:20},.2,.08);
    const buffer=await context.startRendering();let peak=0;for(let c=0;c<2;c++)for(const value of buffer.getChannelData(c)){assert(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));}
    p.stop();check(`Your Type 실제 오디오:앰비언스+동시20음 무클리핑 (peak ${peak.toFixed(4)}) ·결과만 정리`,()=>assert(peak>0&&peak<.98&&sound.ambient.size===3&&buffer.getChannelData(0).slice(30000,35000).some(v=>v!==0)));sound.stopAll();
  }
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(value){this.target=value;}}),node=()=>({connect(to){this.destination=to;return to;},disconnect(){}});
  const clock={state:'running',currentTime:0,destination:node(),resume(){this.state='running';return Promise.resolve();},suspend(){this.state='suspended';return Promise.resolve();},
    createGain:()=>({...node(),gain:param()}),createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param()}),createStereoPanner:()=>({...node(),pan:param()}),
    createOscillator:()=>({...node(),frequency:param(),start(at){this.startedAt=at;},stop(at){this.stoppedAt=at;}})};
  const wait=async test=>{for(let i=0;i<500;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Your Type timeout '+T.diagnostics().state+' / '+$('yt-feedback').textContent);};
  const press=(extra={},release=true)=>{const target=isQuestion()?$('yt-answer'):d;target.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,...extra}));if(release)target.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true}));};
  const isQuestion=()=>/^Q/.test(T.diagnostics().state);
  const input=(value,type='insertText',composing=false)=>{$('yt-answer').value=value;$('yt-answer').dispatchEvent(new w.InputEvent('input',{inputType:type,isComposing:composing,bubbles:true}));};
  w.HelloQuestions.store.clear();w.HelloQuestions.store.add([own]);w.HelloExperiments.selectMode('b');
  check('Your Type:메인 기본 점 모드 ·무음 진입 ·설정 Enter는 시작하지 않음',()=>{
    assert(T.diagnostics().state==='main'&&$('yt-expression').value==='dots'&&!T.sound.enabled);
    T.sound.playTyping();assert(T.sound.typing.size===0&&!T.sound.context);
    $('yt-expression').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(T.diagnostics().state==='main');
  });
  T.sound.context=clock;$('yt-sound-enable').click();await wait(()=>T.sound.enabled);
  check('Your Type:세 레이어는 공통 마스터 경유 ·전체 음소거/해제',()=>{
    assert(T.sound.ambientBus.destination===T.sound.master&&T.sound.mainBus.destination===T.sound.master&&T.sound.resultBus.destination===T.sound.master);
    $('yt-muted').checked=true;$('yt-muted').dispatchEvent(new w.Event('change'));assert(T.sound.master.gain.target===0);
    T.sound.playTyping();assert(T.sound.typing.size===0&&T.sound.typingBus.destination===T.sound.master);
    $('yt-muted').checked=false;$('yt-muted').dispatchEvent(new w.Event('change'));assert(T.sound.master.gain.target===.65);
  });
  const ambient=T.sound.ambient,ambientStarts=T.sound.ambientStarts,oldSetTimeout=w.setTimeout.bind(w),oldNow=w.performance.now.bind(w.performance);
  let time=10000,processingCallback,endingCallback;Object.defineProperty(w.performance,'now',{configurable:true,value:()=>time});
  w.setTimeout=(fn,ms,...args)=>{if(ms>=4900&&ms<=5000){if(T.diagnostics().state==='blackout')endingCallback=fn;else processingCallback=fn;return 999999;}return oldSetTimeout(fn,ms,...args);};
  press({},false);time+=200;await new Promise(resolve=>oldSetTimeout(resolve,K.questionRevealMs+30));
  check('질문 출력:한 글자씩 증가 ·번역/입력 잠금 ·Enter로 건너뛰기 금지',()=>{
    assert($('yt-prompt-ko').textContent.length>0&&$('yt-prompt-ko').textContent.length<C.questions[0].ko.length&&$('yt-prompt-en').textContent===''&&$('yt-answer').disabled&&T.diagnostics().inputOriginAt===null);
    d.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Enter',bubbles:true}));press();assert(T.diagnostics().state==='Q1'&&T.diagnostics().locked);
  });await wait(()=>!T.diagnostics().locked);
  check('질문 출력:한국어/번역 완성 후 원점 생성 ·출력 시간은 기록에서 제외',()=>assert($('yt-prompt-ko').textContent===C.questions[0].ko&&$('yt-prompt-en').textContent===C.questions[0].en&&T.diagnostics().inputOriginAt===time));
  press({repeat:true},false);assert(T.diagnostics().state==='Q1');d.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
  check('Your Type:Enter 시작 한 단계 ·메인 배경음 종료 ·질문 입력 포커스/0초',()=>assert(d.activeElement===$('yt-answer')&&T.diagnostics().state==='Q1'&&T.diagnostics().decorTimer===null&&T.sound.ambient===ambient&&T.sound.ambientStarts===ambientStarts));
  time+=500;$('yt-answer').dispatchEvent(new w.CompositionEvent('compositionstart',{bubbles:true}));input('ㄱ','insertCompositionText',true);time+=120;input('가','insertCompositionText',true);
  time+=90000;press({isComposing:true},false);$('yt-answer').dispatchEvent(new w.CompositionEvent('compositionend',{data:'가',bubbles:true}));input('가');
  press({},false);assert(T.diagnostics().state==='Q1');d.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
  check('Your Type:조합 후속 input까지 기다리고 중복/held Enter는 무시',()=>assert(T.diagnostics().state==='Q1'));
  check('입력 효과음:한글 두 활동은 두 음 ·조합 확정/후속 input 중복 없음 ·같은 70ms/음높이/겹침',()=>assert(T.sound.typing.size===2&&T.diagnostics().typingPlayed===2&&[...T.sound.typing].every(v=>v.source.frequency.value===K.typingHz&&Math.abs(v.source.stoppedAt-v.source.startedAt-K.typingToneMs/1000)<1e-8)));
  await new Promise(resolve=>oldSetTimeout(resolve,10));
  check('Your Type:IME 확정 Enter는 제출하지 않음 ·별도 다음 버튼 제공',()=>assert(T.diagnostics().state==='Q1'&&!$('yt-next').disabled));
  press();await wait(()=>T.diagnostics().state==='Q2'&&!T.diagnostics().locked);
  check('Your Type:확정된 한글은 새 Enter로 제출 ·마지막 음절/시각 보존',()=>assert(T.getSession().answers.length===1&&T.getSession().answers[0].text==='가'&&T.getSession().answers[0].submittedAtMs===90620));
  assert(T.sound.typing.size===0);press();assert(T.diagnostics().state==='Q2');time+=800;input('b');input('b ');
  $('yt-answer').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Backspace',bubbles:true}));input('b','deleteContentBackward');
  for(const key of ['Shift','Control','ArrowLeft'])$('yt-answer').dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true}));
  $('yt-answer').dispatchEvent(new w.KeyboardEvent('keydown',{key:'b',repeat:true,bubbles:true,cancelable:true}));
  $('yt-answer').dispatchEvent(new w.Event('paste',{bubbles:true,cancelable:true}));
  check('입력 효과음:공백 포함 ·삭제/수정키/반복/붙여넣기는 추가 음 없음',()=>assert(T.diagnostics().typingPlayed===2&&T.sound.typing.size===2));
  time+=500;press({keyCode:229});assert(T.diagnostics().state==='Q2');$('yt-next').click();await wait(()=>T.diagnostics().state==='Q3'&&!T.diagnostics().locked);
  check('Your Type:229 Enter는 IME에 맡기고 다음 버튼으로 한 번에 제출',()=>assert(T.getSession().answers.length===2));
  time+=1200;input('c');time+=600;press();await wait(()=>!!processingCallback);
  check('Your Type:Q3 후 자동 저장 ·빈 답변 거부 ·처리중 Enter 무시 ·5초 타이머',()=>{
    assert(w.HelloQuestions.store.records.length===2&&T.diagnostics().state==='processing');press();assert(T.diagnostics().state==='processing'&&K.processingMs===5000);
    const r=T.getSession().record;assert(r.answers[0].typingActivities.length===2&&r.answers[0].characters.length===1&&r.answers[0].submittedAtMs===90620&&T.sound.typing.size===0);
  });
  const build=S.build;S.build=()=>{throw Error('deliberate preparation error');};time+=5000;processingCallback();await wait(()=>!$('yt-processing-error').hidden);
  check('Your Type:준비 실패면 결과로 진행하지 않음 ·저장 답변 유지 ·재시도 수단',()=>assert(T.diagnostics().state==='processing'&&$('yt-result').hidden&&w.HelloQuestions.store.records.length===2));
  S.build=build;processingCallback=null;$('yt-retry').click();await wait(()=>!!processingCallback);time+=5000;processingCallback();await wait(()=>T.diagnostics().state==='playing');
  check('Your Type:재시도도 같은 ID로 한 번만 저장 ·앰비언스 유지',()=>assert(w.HelloQuestions.store.records.length===2&&T.sound.ambientStarts===ambientStarts));
  const plan=T.getSequence();
  check('Your Type:결과에 문장/버튼/라벨 없음 ·9구간 공통 오디오 시계',()=>assert(!$('yt-result').hidden&&$('yt-result').textContent.trim()===''&&!$('yt-result').querySelector('button,.q-row-label')&&plan.segments.length===9&&T.player.context===T.sound.context));
  for(const [i,segment] of plan.segments.entries()){
    clock.currentTime=T.player.startedAt+(segment.atMs+Math.min(20,segment.durationMs/2))/1000;
    await new Promise(resolve=>w.requestAnimationFrame(resolve));
    assert($('yt-graphics').children.length===segment.rows.length,`segment ${i}`);
    if(i===1)check('긴 뒤 공백 Q1 재현:부호 실제 범위가 중앙 ·빈 꼬리로 폭/스크롤 증가 없음',()=>{
      const marks=[...$('yt-graphics').querySelectorAll('.q-typing-dot')].map(n=>n.getBoundingClientRect());
      const left=Math.min(...marks.map(r=>r.left)),right=Math.max(...marks.map(r=>r.right));
      assert(Math.abs((left+right)/2-w.innerWidth/2)<1&&segment.durationMs<3000);
      const scroll=$('yt-graphics').querySelector('.q-row-scroll');assert(scroll.scrollWidth<=scroll.clientWidth+1);
    });
    if(i===2)check('여러 관객 중앙 배치:공통 원점 ·사람별 시작 차이와 동일 시간 스케일 보존',()=>{
      const tracks=[...$('yt-graphics').querySelectorAll('.q-track')];assert(tracks.length===2&&tracks[0].style.marginLeft===tracks[1].style.marginLeft);
      const actual=tracks[0].querySelector('.q-typing-dot').getBoundingClientRect().left-tracks[1].querySelector('.q-typing-dot').getBoundingClientRect().left;
      const expected=(segment.rows[0].score.events[0].atMs-segment.rows[1].score.events[0].atMs)*C.pixelsPerMs*K.visualZoom;
      assert(Math.abs(actual-expected)<.1);
    });
  }
  press({},false);clock.currentTime=T.player.startedAt+plan.durationMs/1000+.1;T.player.tick();await wait(()=>T.diagnostics().state==='blackout');
  check('종료:그래픽/안내 없는 완전 검정 ·5초 전 새 Enter도 무시',()=>{
    assert($('yt-graphics').children.length===0&&$('yt-result').hidden&&!$('yt-ending').hidden&&$('yt-return-prompt').hidden);
    time+=4999;d.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Enter',bubbles:true}));press();assert(T.diagnostics().state==='blackout');
  });
  press({},false);time++;endingCallback();
  press({},false);check('종료:5초 뒤 안내 ·이전부터 누른 Enter 복귀 금지 ·앰비언스 유지',()=>assert(T.diagnostics().state==='ended'&&!$('yt-return-prompt').hidden&&T.sound.ambientStarts===ambientStarts));
  d.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Enter',bubbles:true}));press();
  check('Your Type:새 Enter로 메인 ·앰비언스 재시작 없음 ·결과 음/타이머 정리',()=>assert(T.diagnostics().state==='main'&&T.sound.ambientStarts===ambientStarts&&T.player.voices.size===0&&T.player.timer===null&&T.diagnostics().decorTimer!==null));
  press();time+=200;assert(T.diagnostics().state==='Q1'&&T.diagnostics().locked&&T.diagnostics().questionTimer!==null&&T.getSession().answers.length===0);
  w.HelloExperiments.selectMode('a');
  check('Your Type→A:질문 출력/종료 안내/입력음/RAF/전체 레이어 정리 ·A 정상 활성화',()=>assert(!T.diagnostics().active&&T.diagnostics().bindings===0&&T.diagnostics().questionTimer===null&&T.diagnostics().endingTimer===null&&T.sound.typing.size===0&&T.diagnostics().frame===null&&T.sound.ambient.size===0&&T.diagnostics().decorTimer===null&&w.HelloOrchestra.diagnostics().active));
  // A second short session checks cancellation while the ending timer is pending.
  const timed=w.setTimeout;w.setTimeout=(fn,ms,...args)=>timed(fn,ms===K.questionRevealMs?0:ms,...args);
  w.HelloExperiments.selectMode('b');press();time+=200;
  for(let q=0;q<3;q++){await wait(()=>T.diagnostics().state===`Q${q+1}`&&!T.diagnostics().locked);time+=100;input('x');press();}
  await wait(()=>T.diagnostics().state==='processing'&&T.getSequence());time+=5000;processingCallback();await wait(()=>T.diagnostics().state==='playing');
  const second=T.getSequence();clock.currentTime=T.player.startedAt+second.durationMs/1000+.1;T.player.tick();await wait(()=>T.diagnostics().state==='blackout');
  const lateEnding=endingCallback;assert(T.diagnostics().endingTimer!==null);w.HelloExperiments.selectMode('a');lateEnding();
  check('종료 안내 예약 중 A 이탈:타이머 취소 ·늦은 콜백은 안내/오디오를 되살리지 않음',()=>assert(T.diagnostics().endingTimer===null&&$('yt-return-prompt').hidden&&T.sound.typing.size===0&&T.sound.ambient.size===0&&!T.diagnostics().active));
  w.setTimeout=oldSetTimeout;Object.defineProperty(w.performance,'now',{configurable:true,value:oldNow});w.HelloQuestions.store.clear();w.HelloExperiments.selectMode('home');
};
