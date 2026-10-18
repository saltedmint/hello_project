(() => {
  'use strict';
  const C=HelloQuestionConfig,K=HelloTypeConfig,D=HelloQuestionData,V=HelloQuestionVisual,$=id=>document.getElementById(id);
  const store=HelloQuestions.store,sound=new HelloTypeSound.Sound(),player=new HelloQuestionAudio.Player();
  let active=false,state='main',session=null,recorder=null,index=0,settings=null,sequence=null;
  let bindings=[],frame=null,processingTimer=null,generation=0,locked=false,enterHeld=false,operator=false;
  let shown=-1,rendered=[],silentStart=0,hiddenAt=null,processingStarted=0,ready=false;
  let mainStart=0,silentDecor=[],nextSilent=0;
  let questionTimer=null,endingTimer=null,typingPlayed=0,blackoutStarted=0;
  let pendingSubmit=null,submitTimer=null;
  const online=globalThis.HelloTypeOnline;
  let resultRecords=null;
  function cancelSubmit(){clearTimeout(submitTimer);submitTimer=null;pendingSubmit=null;}
  function settleSubmit(){
    if(!pendingSubmit||recorder?.composing||submitTimer!==null)return;
    const request=pendingSubmit;
    // Let compositionend's trailing input finish before reading the final text.
    submitTimer=setTimeout(()=>{
      submitTimer=null;
      if(pendingSubmit!==request)return;
      pendingSubmit=null;
      if(active&&!operator&&request.recorder===recorder&&request.generation===generation)submit();
    },0);
  }
  const now=()=>performance.now(),isQuestion=()=>/^Q[123]$/.test(state);
  function message(text){$('yt-feedback').textContent=text;}
  function screen(next){
    state=next;$('type-experience').dataset.state=next;
    $('yt-main').hidden=next!=='main';$('yt-question').hidden=!isQuestion();
    $('yt-processing').hidden=next!=='processing';$('yt-result').hidden=next!=='playing';
    $('yt-ending').hidden=!['blackout','ended'].includes(next);$('yt-return-prompt').hidden=next!=='ended';
    $('yt-feedback').hidden=['playing','blackout','ended'].includes(next);
    $('yt-next').textContent=index===2?'완료':'다음';$('yt-next').disabled=!isQuestion()||locked;
  }
  function cancelResults(){generation++;clearTimeout(processingTimer);processingTimer=null;clearTimeout(questionTimer);questionTimer=null;clearTimeout(endingTimer);endingTimer=null;sound.stopTyping();player.stop();sequence=null;ready=false;shown=-1;rendered=[];}
  function refreshSettings(){
    const counts=HelloQuestionDemo.query(store);$('yt-demo-count').textContent=`발표용 합성 데이터 ${counts.participants}명 · ${counts.answers}답변 / 전체 ${store.records.length}명`;
    $('yt-sound-enable').hidden=sound.enabled;
  }
  function main(){
    cancelSubmit();
    cancelResults();session=null;recorder=null;settings=null;resultRecords=null;locked=false;$('yt-answer').value='';
    $('yt-processing-error').hidden=true;$('yt-settings').open=false;screen('main');message(store.warning||'');refreshSettings();
    mainStart=now();nextSilent=0;silentDecor=Array.from({length:8},(_,i)=>({when:-i*1.8-.5,dash:Math.random()>.5,y:12+Math.random()*76}));sound.setMain(true);
  }
  async function begin(){
    if(state!=='main'||locked)return;
    if(!online?.enabled&&store.records.length>=C.maxParticipants){message('저장 한도 20명입니다. 설정에서 JSON으로 백업하고 발표용 더미 배치 등을 정리한 뒤 시작해 주세요. 기존 기록은 지우지 않았습니다.');return;}
    if(online?.enabled){locked=true;const token=generation;await online.initialize(true);if(!active||operator||token!==generation||state!=='main')return;locked=false;}
    settings=Object.freeze({expression:$('yt-expression').value,includeDemo:online?.enabled?!!online.getRound().includeDemo:$('yt-include-demo').checked,preserveEdges:!!online?.enabled,roundId:online?.getRound().id,volume:Number($('yt-volume').value),muted:$('yt-muted').checked});
    sound.setVolume(settings.volume,settings.muted);sound.setMain(false);$('yt-settings').open=false;
    session={id:HelloRecording.newId(),answers:[],record:null};message('');openQuestion(0);
  }
  function selection(){const area=$('yt-answer');return {start:Array.from(area.value.slice(0,area.selectionStart)).length,end:Array.from(area.value.slice(0,area.selectionEnd)).length};}
  function openQuestion(number){
    cancelSubmit();
    clearTimeout(questionTimer);questionTimer=null;sound.stopTyping();typingPlayed=0;
    index=number;recorder=null;locked=true;const q=C.questions[index],area=$('yt-answer');
    $('yt-prompt-ko').textContent='';$('yt-prompt-en').textContent='';area.value='';area.disabled=true;
    screen(q.id);const token=generation,readyAt=now()+(number===0&&sound.enabled?K.mainFadeMs:0);
    // Two frames: paint the full question before establishing the input origin.
    const activate=()=>{
      if(!active||operator||token!==generation||state!==q.id)return;
      if(now()<readyAt){requestAnimationFrame(activate);return;}
      recorder=new HelloQuestionInput.Recorder(now());area.disabled=false;locked=false;$('yt-next').disabled=false;area.focus();
    };
    const chars=Array.from(q.ko);let count=0;
    const reveal=()=>{
      questionTimer=null;if(!active||operator||token!==generation||state!==q.id)return;
      $('yt-prompt-ko').textContent=chars.slice(0,++count).join('');
      if(count<chars.length)questionTimer=setTimeout(reveal,K.questionRevealMs);
      else {$('yt-prompt-en').textContent=q.en;requestAnimationFrame(()=>requestAnimationFrame(activate));}
    };
    questionTimer=setTimeout(reveal,K.questionRevealMs);
  }
  function playNewTyping(){
    if(!recorder)return;
    const activities=HelloQuestionInput.collectTyping(recorder.events);
    for(let i=typingPlayed;i<activities.length;i++)sound.playTyping();
    typingPlayed=activities.length;
  }
  function submit(){
    if(!isQuestion()||locked||!recorder||recorder.composing)return;
    try{
      const answer=recorder.finish(C.questions[index],now());answer.morse=HelloQuestionMorse.compile(answer);D.validateAnswer(answer,C.questions[index].id);
      locked=true;sound.stopTyping();recorder=null;$('yt-answer').disabled=true;session.answers.push(answer);message('');
      if(index<2)openQuestion(index+1);
      else {session.record=D.participant(session.id,'participant',session.answers);process();}
    }catch(error){message(error.message);}
  }
  function processingError(error){
    clearTimeout(processingTimer);processingTimer=null;player.stop();ready=false;screen('processing');
    $('yt-processing-error').hidden=false;$('yt-error-message').textContent=`준비하지 못했습니다: ${error.message} 답변은 현재 페이지 메모리에 보존되어 있습니다.`;
  }
  function process(){
    cancelResults();locked=true;sound.setMain(false);screen('processing');message('');$('yt-processing-error').hidden=true;
    const token=generation;
    requestAnimationFrame(()=>requestAnimationFrame(async()=>{
      if(!active||operator||token!==generation)return;processingStarted=now();
      try{
        if(online?.enabled){
          resultRecords=await online.prepare(session.record,settings.roundId);
          if(token!==generation||!active||operator)return;
          message(online.getStatus());
        }else {
          store.add([session.record]); // Q3 completion, exactly once by ID.
          if(store.warning)throw Error(store.warning);
        }
        sequence=HelloTypeSequence.build(session.record,resultRecords??store.getRecords(),settings);ready=true;
        processingTimer=setTimeout(()=>{
          processingTimer=null;if(token!==generation||!active||operator||!ready)return;
          if(!document.hidden)startResults();
        },Math.max(0,K.processingMs-(now()-processingStarted)));
      }catch(error){processingError(error);}
    }));
  }
  async function startResults(){
    if(!ready||state!=='processing'||!active||operator)return;ready=false;
    const token=generation;
    try{
      // Reconfirm the participants at result start; future mutations cannot affect this clone.
      sequence=HelloTypeSequence.build(session.record,resultRecords??store.getRecords(),settings);
      if(sound.enabled){
        sound.ensureOutput();player.context=sound.context;player.output=sound.resultBus;player.setVolume(1);
        await player.start(sequence,()=>finishResults());
        if(token!==generation||!active||operator)return;
      }else silentStart=now();
      screen('playing');locked=false;shown=-1;paintResults(0);
    }catch(error){if(token===generation)processingError(error);}
  }
  function finishResults(){
    if(state!=='playing')return;player.stop();sound.stopTyping();screen('blackout');locked=true;
    $('yt-graphics').replaceChildren();rendered=[];shown=-1;blackoutStarted=now();
    const token=generation;
    endingTimer=setTimeout(()=>{
      endingTimer=null;if(!active||operator||token!==generation||state!=='blackout')return;
      screen('ended');locked=false;
      // Preserve enterHeld: only a new press after release can return home.
    },K.endingDelayMs);
  }
  function renderSegment(segment,number){
    if(shown===number)return;shown=number;rendered=[];const root=$('yt-graphics');root.replaceChildren();root.style.setProperty('--rows',String(segment.rows.length));
    for(const item of segment.rows){
      let node,score;
      if(!item.record){
        score=item.score;node=V.element('div','q-row');const scroll=V.element('div','q-row-scroll'),track=V.element('div','q-track');
        track.style.width=`${Math.max(1,score.durationMs*C.pixelsPerMs*K.visualZoom)}px`;
        for(const e of score.events){const dot=V.element('i','q-typing-dot');dot.style.left=`${e.atMs*C.pixelsPerMs*K.visualZoom}px`;dot.dataset.activity=e.activityIndex;track.append(dot);}scroll.append(track);node.append(scroll);
      }else {
        score=item.score;
        node=V.row(item.record,item.record.publicScoreVersion?{...item.answer,question:{ko:''},morse:score,characters:[],focusLoss:[]}:item.answer,{expression:item.expression,zoom:K.visualZoom,score});
        node.querySelectorAll('.q-row-label,.q-timing-source,.q-playhead').forEach(n=>n.remove());
      }
      // No question/answer text, labels, tooltips or operational numbers on this screen.
      node.querySelectorAll('[title],[aria-label]').forEach(n=>{n.removeAttribute('title');n.removeAttribute('aria-label');});
      root.append(node);rendered.push({node,score,expression:item.expression,scroll:node.querySelector('.q-row-scroll')});
    }
    // Silent padding must not determine the center or create an empty scroll
    // runway. A single ink origin is shared by all rows, preserving their offsets.
    const bounds=rendered.map(row=>{
      const marks=[...row.node.querySelectorAll('.q-tone,.q-typing-dot,.q-unsupported')];
      return {row,first:marks.reduce((n,m)=>Math.min(n,parseFloat(m.style.left)),Infinity),
        last:marks.reduce((n,m)=>Math.max(n,parseFloat(m.style.left)+(parseFloat(m.style.width)||4)),0)};
    });
    const first=bounds.reduce((n,b)=>Math.min(n,b.first),Infinity),origin=Number.isFinite(first)?first:0;
    const last=bounds.reduce((n,b)=>Math.max(n,b.last),origin);
    for(const {row,last:rowLast} of bounds){
      const track=row.node.querySelector('.q-track');track.style.marginLeft=`${4-origin}px`;
      track.style.width=`${Math.max(origin,rowLast)+4}px`;row.visualOrigin=origin-4;row.visualEnd=Math.max(4,rowLast-origin+4);
    }
    const width=Math.max(12,last-origin+8);
    root.style.width=`min(84vw, ${width}px)`;
  }
  function paintSegment(segment,position){
    for(const row of rendered){
      row.node.querySelectorAll('.q-sounding').forEach(n=>n.classList.remove('q-sounding'));
      for(const e of row.score.events)if(position>=e.atMs&&position<e.atMs+e.durationMs){
        const mark=row.expression==='dots'?row.node.querySelector(`[data-activity="${e.activityIndex}"]`):row.node.querySelector(`[data-at="${e.atMs}"]`);mark?.classList.add('q-sounding');
      }
      const timelineX=row.expression==='dots'?Math.min(position,row.score.durationMs)*C.pixelsPerMs*K.visualZoom:HelloQuestionMorse.position(row.score,position);
      const x=Math.max(0,Math.min(row.visualEnd,timelineX-row.visualOrigin));
      if(x>row.scroll.scrollLeft+row.scroll.clientWidth-35)row.scroll.scrollLeft=Math.max(0,x-row.scroll.clientWidth*.35);
    }
  }
  function paintResults(elapsed){
    if(!sequence)return;const view=HelloTypeSequence.locate(sequence,elapsed);
    renderSegment(view.segment,view.index);$('yt-graphics').style.opacity=String(view.opacity);paintSegment(view.segment,view.position);
    if(view.ended&&state==='playing'){if(player.running)player.stop();finishResults();}
  }
  function paintMain(){
    const root=$('yt-decoration'),elapsed=(now()-mainStart)/1000;let points;
    if(sound.enabled){points=sound.visuals.map(v=>({...v,age:sound.context.currentTime-v.when}));}
    else {
      if(elapsed>=nextSilent){silentDecor.push({when:elapsed,y:12+Math.random()*76,dash:Math.random()>.5});nextSilent=elapsed+K.decorationStepMs/1000;}
      silentDecor=silentDecor.filter(p=>elapsed-p.when<18);points=silentDecor.map(v=>({...v,age:elapsed-v.when}));
    }
    root.replaceChildren();for(const p of points){if(p.age<0||p.age>18)continue;const mark=V.element('i',p.dash?'yt-background-dash':'yt-background-dot');mark.style.top=`${p.y}%`;mark.style.left=`${100-p.age*6}%`;root.append(mark);}
  }
  function tick(){
    frame=null;if(!active||operator)return;
    if(state==='main')paintMain();
    if(state==='playing')paintResults(sound.enabled?player.position()??sequence.durationMs:now()-silentStart);
    frame=requestAnimationFrame(tick);
  }
  function onKey(event){
    if(!active||operator)return;
    if(event.target.closest?.('#yt-settings')||event.target.closest?.('#yt-processing-error'))return;
    const enter=event.key==='Enter'||event.code==='Enter'||event.code==='NumpadEnter';
    if(!enter){
      if(isQuestion()&&event.target===$('yt-answer')){if(locked||event.repeat){event.preventDefault();return;}recorder?.keyDown(event,now());}
      return;
    }
    if(event.repeat||enterHeld){event.preventDefault();return;}enterHeld=true;
    if(isQuestion()&&!locked&&event.target===$('yt-answer')&&recorder){
      // IME Enter confirms only. A fresh Enter or the Next button submits.
      if(event.isComposing||recorder.composing||event.keyCode===229)return;
      event.preventDefault();submit();return;
    }
    if(event.isComposing||event.keyCode===229)return;
    event.preventDefault();
    if(locked)return;
    if(state==='main'){if(online?.enabled)sound.enable().then(refreshSettings).catch(()=>{});begin();}else if(isQuestion()&&event.target===$('yt-answer'))submit();else if(state==='ended')main();
  }
  function bind(target,type,handler,options){target.addEventListener(type,handler,options);bindings.push(()=>target.removeEventListener(type,handler,options));}
  function rollback(result){if(result?.blocked){$('yt-answer').value=recorder.text;message(result.reason==='answer-too-long'?`답변은 ${C.maxCharacters}자 이내로 입력해 주세요. 기존 답변은 유지했습니다.`:'한 번에 여러 글자를 넣는 붙여넣기·자동완성은 기록하지 않습니다. 직접 입력해 주세요.');}}
  function enter(){
    if(active)return;active=true;operator=false;enterHeld=false;document.body.classList.add('type-audience');document.body.classList.remove('type-operator');$('q-operator').hidden=true;$('type-experience').hidden=false;
    main();
    if(online?.enabled){document.body.classList.add('type-public');online.initialize();}
    if(sound.enabled)sound.enable().catch(()=>message('사운드를 활성화하지 못했습니다. 무음으로 진행할 수 있습니다.'));
    const area=$('yt-answer');
    if(window.visualViewport){const resize=()=>document.documentElement.style.setProperty('--yt-viewport-height',`${window.visualViewport.height}px`);bind(window.visualViewport,'resize',resize);resize();}
    bind(document,'keydown',onKey,true);
    bind(document,'keyup',event=>{if(event.key==='Enter'||event.code==='Enter'||event.code==='NumpadEnter')enterHeld=false;else if(isQuestion()&&recorder&&event.target===area)recorder.keyUp(now());});
    bind(area,'beforeinput',event=>{
      if(!recorder||locked){event.preventDefault();return;}
      if(event.inputType==='insertLineBreak'||event.inputType==='insertParagraph'){event.preventDefault();return;}
      recorder.before(event.inputType,event.data,now(),selection());
      if(['insertFromPaste','insertFromDrop','insertReplacementText','insertFromYank'].includes(event.inputType)||(!recorder.composing&&!event.isComposing&&event.data&&Array.from(event.data).length>1)){
        event.preventDefault();recorder.blocked(now(),event.inputType);message('여러 글자를 한 번에 넣지 않고 직접 입력해 주세요.');
      }
    });
    bind(area,'input',event=>{if(recorder&&!locked){rollback(recorder.input(area.value,event.inputType,now(),event.isComposing));playNewTyping();}});
    bind(area,'compositionstart',()=>recorder?.compositionStart(now(),selection()));
    bind(area,'compositionupdate',event=>recorder?.compositionUpdate(event.data,now()));
    bind(area,'compositionend',event=>{if(recorder){rollback(recorder.compositionEnd(area.value,event.data,now()));playNewTyping();settleSubmit();}});
    for(const type of ['paste','drop'])bind(area,type,event=>{event.preventDefault();recorder?.blocked(now(),type);message('직접 타이핑해 주세요.');});
    bind(area,'blur',()=>recorder?.loseFocus(now(),'input'));bind(area,'focus',()=>recorder?.gainFocus(now()));
    bind(window,'blur',()=>{recorder?.loseFocus(now(),'window');sound.stopTyping();});bind(window,'focus',()=>recorder?.gainFocus(now()));
    bind(document,'visibilitychange',()=>{
      if(document.hidden){recorder?.loseFocus(now(),'hidden');sound.stopTyping();hiddenAt=now();if(sound.enabled)sound.context.suspend().catch(()=>{});}
      else {recorder?.gainFocus(now());if(hiddenAt!==null&&state==='playing'&&!sound.enabled)silentStart+=now()-hiddenAt;hiddenAt=null;
        if(sound.enabled)sound.context.resume().catch(error=>{if(state==='playing')processingError(error);});
        if(state==='processing'&&ready&&now()-processingStarted>=K.processingMs)startResults();}
    });
    bind(window,'pagehide',leave);frame=requestAnimationFrame(tick);
  }
  function leave(){
    cancelSubmit();
    active=false;cancelResults();cancelAnimationFrame(frame);frame=null;bindings.forEach(remove=>remove());bindings=[];sound.stopAll();
    if(operator)HelloQuestions.leave();operator=false;recorder=null;locked=false;document.body.classList.remove('type-audience','type-operator','type-public');
  }
  function openOperator(){
    if(online?.enabled)return;
    if(!active||state!=='main')return;cancelResults();cancelAnimationFrame(frame);frame=null;sound.stopAll();operator=true;
    document.body.classList.remove('type-audience');document.body.classList.add('type-operator');$('type-experience').hidden=true;$('q-operator').hidden=false;HelloQuestions.enter();
  }
  function closeOperator(){if(!operator)return;leave();enter();}
  $('yt-sound-enable').addEventListener('click',async()=>{try{if(await sound.enable())refreshSettings();}catch(error){message(`사운드 활성화 실패: ${error.message}. 무음으로 진행할 수 있습니다.`);}});
  $('yt-touch-start').addEventListener('click',()=>{if(state!=='main'||locked)return;sound.enable().then(refreshSettings).catch(()=>message('사운드를 켜지 못했습니다. 무음으로 진행합니다.'));begin();});
  $('yt-next').addEventListener('pointerdown',()=>{if(recorder?.composing){pendingSubmit={recorder,generation};$('yt-answer').blur();}});
  $('yt-next').addEventListener('click',()=>{if(recorder?.composing){pendingSubmit={recorder,generation};$('yt-answer').blur();return;}if(pendingSubmit)settleSubmit();else submit();});
  $('yt-return-prompt').addEventListener('click',()=>{if(state==='ended')main();});
  $('yt-send-retry').addEventListener('click',()=>online?.retry());
  $('yt-expression').value='dots';
  const volume=()=>{if(active&&!operator&&state==='main')sound.setVolume($('yt-volume').value,$('yt-muted').checked);};
  $('yt-volume').addEventListener('input',volume);$('yt-muted').addEventListener('change',volume);
  $('yt-seed').addEventListener('click',()=>{try{const result=HelloQuestionDemo.seed(store);refreshSettings();message(result.persisted?'발표용 합성 데이터 10명·30답변을 저장했습니다.':store.warning||'저장을 확인하지 못했습니다.');}catch(error){message(error.message);}});
  $('yt-remove-demo').addEventListener('click',()=>{if(window.confirm('발표용 10인 배치만 삭제할까요? 실제 관객 기록과 이전 예시는 유지합니다.')){store.removeDemoBatch(HelloQuestionDemo.batchId);refreshSettings();message(store.warning||'지정한 발표용 배치만 삭제했습니다.');}});
  $('yt-operator').addEventListener('click',openOperator);$('yt-operator-back').addEventListener('click',closeOperator);
  $('yt-go-a').addEventListener('click',()=>HelloExperiments.selectMode('a'));
  $('yt-retry').addEventListener('click',()=>{if(session?.record)process();});
  $('yt-backup').addEventListener('click',()=>{if(!session?.record)return;const url=URL.createObjectURL(new Blob([D.serialize([session.record])],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='your-type-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});
  globalThis.HelloTypeExperience={enter,leave,openOperator,closeOperator,sound,player,
    diagnostics:()=>({active,state,locked,operator,index,inputOriginAt:recorder?.origin??null,segmentIndex:shown,enterHeld,bindings:bindings.length,frame,questionTimer,endingTimer,blackoutStartedAt:blackoutStarted,typingPlayed,typingVoices:sound.typing.size,processingTimer,processingStartedAt:processingStarted,ambientStarts:sound.ambientStarts,ambientVoices:sound.ambient.size,decorTimer:sound.decorTimer,voices:player.voices.size}),
    getSession:()=>session?D.clone(session):null,getSequence:()=>sequence?D.clone(sequence):null};
})();
