(() => {
  'use strict';
  const C=HelloQuestionConfig,D=HelloQuestionData,V=HelloQuestionVisual,$=id=>document.getElementById(id);
  let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error();},setItem(){throw Error();}};}
  const store=new D.Store(storage),player=new HelloQuestionAudio.Player();store.restore();
  let active=false,state='waiting',session=null,recorder=null,index=0,pending=null,currentId=null,bindings=[],frame=null,generation=0,submitting=false,imeEnter=false;
  const status=text=>{$('q-feedback').textContent=text;};
  const now=()=>performance.now();
  function stop(){generation++;player.stop();cancelAnimationFrame(frame);frame=null;$('q-stop').disabled=true;$('q-audio-status').textContent='정지';
    $('q-board').querySelectorAll('.q-playhead').forEach(node=>node.hidden=true);$('q-board').querySelectorAll('.q-sounding,.q-group-playing').forEach(node=>node.classList.remove('q-sounding','q-group-playing'));
  }
  function records(){const values=store.getRecords();if(pending&&!values.some(r=>r.id===pending.id))values.push(pending);return values;}
  function own(){return pending||store.getRecords().find(r=>r.id===currentId);}
  function filteredRecords(){const filter=$('q-data-filter').value;return records().filter(r=>filter==='all'||(filter==='demo')===(r.isDemo===true||r.source==='synthetic'));}
  function selectedRecords(){const selected=$('q-person').value;return filteredRecords().filter(r=>selected==='all'||r.id===selected);}
  function paint(){
    const elapsed=player.position();if(elapsed===null)return;
    const group=player.plan.groups.find(g=>elapsed>=g.atMs&&elapsed<g.atMs+g.durationMs);
    $('q-audio-status').textContent=group?`${group.questionId} 재생 중 · 전체 ${player.plan.speed}×`:'질문 사이의 침묵';
    $('q-board').querySelectorAll('.q-sounding').forEach(node=>node.classList.remove('q-sounding'));
    $('q-board').querySelectorAll('.q-question-column').forEach(node=>node.classList.toggle('q-group-playing',node.dataset.question===group?.questionId));
    for(const row of $('q-board').querySelectorAll('.q-row')){
      const cursor=row.querySelector('.q-playhead'),record=recordsCache.find(r=>r.id===row.dataset.participant),answer=record?.answers.find(a=>a.questionId===row.dataset.question);
      const included=player.plan.participantIds.includes(row.dataset.participant);
      if(!group||group.questionId!==row.dataset.question||!answer||!included){cursor.hidden=true;continue;}
      const position=(elapsed-group.atMs)*player.plan.speed;
      const dots=player.plan.expression==='dots',score=dots?HelloQuestionDots.compile(answer):answer.morse;
      if(position>score.durationMs){cursor.hidden=true;continue;}
      cursor.hidden=false;const x=dots?position*C.pixelsPerMs*Number($('q-zoom').value):HelloQuestionMorse.position(answer.morse,position,$('q-axis').value==='original');cursor.style.left=`${x}px`;
      if(dots){for(const event of score.events)if(position>=event.atMs&&position<event.atMs+event.durationMs)row.querySelector(`[data-activity="${event.activityIndex}"]`)?.classList.add('q-sounding');}
      const segment=dots?null:answer.morse.segments.find(s=>position>=s.atMs&&position<s.atMs+s.durationMs);
      if(segment?.kind==='tone')row.querySelectorAll(`[data-char="${segment.charIndex}"]`).forEach(node=>{
        if($('q-axis').value==='original'||Number(node.dataset.at)===segment.atMs)node.classList.add('q-sounding');
      });
      const scroll=row.querySelector('.q-row-scroll');if($('q-follow').checked&&(x<scroll.scrollLeft||x>scroll.scrollLeft+scroll.clientWidth-20))scroll.scrollLeft=Math.max(0,x-scroll.clientWidth*.3);
    }
    if(active&&player.running)frame=requestAnimationFrame(paint);
  }
  async function play(values,questionId=$('q-question-selection').value){
    $('q-question-selection').value=questionId;
    $('q-play-all').textContent=questionId==='all'?'Q1 → Q2 → Q3 듣기':`${questionId} 다시 듣기`;
    stop();const token=generation;$('q-stop').disabled=false;
    try{
      const plan=HelloQuestionAudio.buildPlan(values,{questionId,speed:Number($('q-speed').value),expression:$('q-expression').value});plan.participantIds=values.map(r=>r.id);
      await player.start(plan,()=>{cancelAnimationFrame(frame);frame=null;$('q-stop').disabled=true;$('q-audio-status').textContent='재생 완료';$('q-board').querySelectorAll('.q-playhead').forEach(node=>node.hidden=true);$('q-board').querySelectorAll('.q-sounding,.q-group-playing').forEach(node=>node.classList.remove('q-sounding','q-group-playing'));});
      if(token!==generation||!active)return;paint();
    }catch(error){if(token===generation){stop();status(`재생 실패: ${error.message}`);}}
  }
  let recordsCache=[];
  function renderResults(){
    const all=filteredRecords(),old=$('q-person').value;
    $('q-person').replaceChildren(new Option('여러 관객 · 같은 질문 비교','all'));
    all.forEach((record,i)=>$('q-person').append(new Option(`${record.id===currentId?'나의 응답':`관객 ${String(i+1).padStart(2,'0')}`} ${record.source==='synthetic'?'· 합성 예시':''}`,record.id)));
    $('q-person').value=all.some(r=>r.id===old)?old:'all';recordsCache=selectedRecords();
    const dots=$('q-expression').value==='dots';
    $('q-expression-note').textContent=dots?'질문 시작 기준 입력 활동을 같은 크기의 점과 짧은 소리로 재생합니다. 긴 침묵은 빈 공간이며 가까운 점은 그대로 겹칩니다. 점 확대와 행 내부 가로 이동으로 확인하세요.':'같은 질문의 시작을 맞춥니다. 기존 모스 부호 길이에 실제 침묵을 더한 변환이며 원본 타이핑의 실시간 복제는 아닙니다. 원본 시간축의 빗금은 포커스 이탈이며 미지원 문자는 ◇로 남깁니다. 긴 행은 가로로 이동할 수 있습니다.';
    $('q-demo-notice').hidden=!recordsCache.some(r=>r.isDemo||r.source==='synthetic');
    $('q-board').setAttribute('aria-label',`Q1 Q2 Q3 응답의 시간과 ${dots?'타이핑 점':'모스'}`);
    $('q-play-all').textContent=$('q-question-selection').value==='all'?'Q1 → Q2 → Q3 듣기':`${$('q-question-selection').value} 다시 듣기`;
    $('q-board').replaceChildren();
    C.questions.forEach(question=>{
      const column=V.element('section','q-question-column');column.dataset.question=question.id;
      const heading=V.element('header','q-column-heading');heading.append(V.element('strong','',question.id),V.element('h2','',question.ko));
      const button=V.element('button','',`${question.id} 듣기`);button.disabled=!recordsCache.length;button.addEventListener('click',()=>play(selectedRecords(),question.id));heading.append(button);column.append(heading);
      const rows=V.element('div','q-question-rows');rows.style.setProperty('--rows',String(Math.max(1,recordsCache.length)));
      recordsCache.forEach((record,i)=>rows.append(V.row(record,record.answers.find(a=>a.questionId===question.id),{expression:$('q-expression').value,zoom:Number($('q-zoom').value),original:$('q-axis').value==='original',current:record.id===currentId,reveal:$('q-show-original').checked,index:i})));
      if(!recordsCache.length)rows.append(V.element('p','q-empty','아직 합류한 응답이 없습니다.'));column.append(rows);$('q-board').append(column);
    });
    const demo=HelloQuestionDemo.query(store);$('q-demo-count').textContent=`발표용 합성 데이터 ${demo.participants}명 · ${demo.answers}답변`;
    $('q-count').textContent=`${store.records.length}명 합류${pending?' · 내 응답 확인 중':''} / 최대 ${C.maxParticipants}명`;
    $('q-own-listen').disabled=!own();$('q-play-all').disabled=!all.length;$('q-join').hidden=!pending;$('q-join-listen').hidden=!pending;
    $('q-own-details').replaceChildren();if(own())$('q-own-details').append(V.review(own()));
  }
  function screen(next){state=next;for(const name of ['waiting','intro','question','results'])$(`q-${name}`).hidden=name!==next;
    $('q-tools').hidden=next==='intro'||next==='question';$('q-cancel').hidden=next!=='intro'&&next!=='question';
  }
  function reset(){stop();session=null;recorder=null;pending=null;currentId=null;submitting=false;imeEnter=false;$('q-show-original').checked=false;$('q-answer').value='';screen('waiting');status('한국어 또는 영어로, 당신의 시간에 답해 주세요.');}
  function begin(){stop();pending=null;currentId=null;session={id:HelloRecording.newId(),answers:[]};screen('intro');status('준비가 되면 첫 질문을 열어 주세요.');}
  function selection(){const input=$('q-answer');return {start:Array.from(input.value.slice(0,input.selectionStart)).length,end:Array.from(input.value.slice(0,input.selectionEnd)).length};}
  function openQuestion(number){
    stop();recorder=null;imeEnter=false;index=number;const question=C.questions[index];$('q-number').textContent=`${index+1} / ${C.questions.length}`;$('q-prompt-ko').textContent=question.ko;$('q-prompt-en').textContent=question.en;
    $('q-answer').value='';$('q-answer').disabled=true;$('q-submit').textContent=index===C.questions.length-1?'답변 마치기':'다음 질문';$('q-submit').disabled=true;
    screen('question');const token=generation;
    requestAnimationFrame(()=>{if(!active||token!==generation||state!=='question')return;recorder=new HelloQuestionInput.Recorder(now());$('q-answer').disabled=false;$('q-submit').disabled=false;$('q-answer').focus();status('짧게 답해 주세요. 정답이나 권장 속도는 없습니다.');});
  }
  function rollback(result){if(result?.blocked){$('q-answer').value=recorder.text;status(result.reason==='answer-too-long'?`답변은 ${C.maxCharacters}자 이내로 적어 주세요. 기존 답변은 유지했습니다.`:'여러 글자를 한 번에 넣는 입력은 기록하지 않습니다. 직접 타이핑해 주세요.');}}
  async function submit(){
    if(submitting||!recorder||state!=='question')return;submitting=true;$('q-submit').disabled=true;const token=generation;
    try{
      if(recorder.composing){$('q-answer').blur();for(let i=0;i<50&&recorder.composing;i++)await new Promise(resolve=>setTimeout(resolve,20));}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(token!==generation||!active||state!=='question')return;
      const answer=recorder.finish(C.questions[index],now());answer.morse=HelloQuestionMorse.compile(answer);D.validateAnswer(answer,C.questions[index].id);session.answers.push(answer);
      if(index<C.questions.length-1)openQuestion(index+1);
      else {pending=D.participant(session.id,'participant',session.answers);currentId=pending.id;recorder=null;screen('results');$('q-person').replaceChildren(new Option('나의 세 응답',currentId));$('q-person').value=currentId;renderResults();status('세 응답을 마쳤습니다. 자신의 시간과 부호를 확인한 뒤 풍경에 합류해 주세요.');}
    }catch(error){status(error.message);$('q-answer').focus();}
    finally{submitting=false;if(recorder&&state==='question')$('q-submit').disabled=false;}
  }
  function join(listen=false){
    try{if(pending){store.add([pending]);currentId=pending.id;pending=null;}$('q-person').value='all';screen('results');renderResults();status(store.warning||'당신의 세 응답이 풍경에 합류했습니다.');if(listen)play(store.getRecords());}
    catch(error){status(error.message);}
  }
  function listen(target,type,handler){target.addEventListener(type,handler);bindings.push(()=>target.removeEventListener(type,handler));}
  function enter(){
    if(active)return;active=true;screen('waiting');renderResults();if(store.warning)status(store.warning);
    const input=$('q-answer');
    listen(input,'beforeinput',event=>{
      if(state!=='question'||!recorder)return;const type=event.inputType||'';recorder.before(type,event.data,now(),selection());
      if(['insertFromPaste','insertFromDrop','insertReplacementText','insertFromYank'].includes(type)||(!recorder.composing&&!event.isComposing&&type==='insertText'&&event.data&&Array.from(event.data).length>1)||(imeEnter&&type==='insertLineBreak')){
        event.preventDefault();recorder.blocked(now(),type);status('붙여넣기·자동완성 대신 직접 타이핑해 주세요. 기존 답변은 유지합니다.');
      }
    });
    listen(input,'input',event=>{if(state==='question'&&recorder)rollback(recorder.input(input.value,event.inputType||'input',now(),event.isComposing));});
    listen(input,'compositionstart',()=>{if(recorder)recorder.compositionStart(now(),selection());});
    listen(input,'compositionupdate',event=>{if(recorder)recorder.compositionUpdate(event.data,now());});
    listen(input,'compositionend',event=>{if(recorder)rollback(recorder.compositionEnd(input.value,event.data,now()));});
    for(const type of ['paste','drop'])listen(input,type,event=>{event.preventDefault();if(recorder)recorder.blocked(now(),type);status('리듬 기록에는 직접 타이핑이 필요합니다.');});
    listen(input,'keydown',event=>{if(recorder&&state==='question'){recorder.keyDown(event,now());if(event.repeat){event.preventDefault();return;}}if(event.key==='Enter'&&(event.isComposing||recorder?.composing))imeEnter=true;});
    listen(input,'keyup',event=>{if(recorder&&state==='question')recorder.keyUp(now());if(event.key==='Enter')imeEnter=false;});
    listen(input,'blur',()=>{if(recorder&&state==='question')recorder.loseFocus(now(),'input');});
    listen(input,'focus',()=>{if(recorder&&state==='question')recorder.gainFocus(now());});
    listen(window,'blur',()=>{if(recorder&&state==='question')recorder.loseFocus(now(),'window');stop();});
    listen(window,'focus',()=>{if(recorder&&state==='question')recorder.gainFocus(now());});
    listen(document,'visibilitychange',()=>{if(document.hidden){if(recorder&&state==='question')recorder.loseFocus(now(),'hidden');stop();}else if(recorder&&state==='question')recorder.gainFocus(now());});
    listen(window,'pagehide',stop);
  }
  function leave(){active=false;stop();bindings.forEach(remove=>remove());bindings=[];recorder=null;session=null;pending=null;currentId=null;screen('waiting');$('q-show-original').checked=false;}
  $('q-begin').addEventListener('click',begin);$('q-intro-start').addEventListener('click',()=>openQuestion(0));$('q-submit').addEventListener('click',submit);
  $('q-cancel').addEventListener('click',reset);$('q-next-visitor').addEventListener('click',reset);$('q-open-landscape').addEventListener('click',()=>{screen('results');renderResults();});
  $('q-join').addEventListener('click',()=>join());$('q-join-listen').addEventListener('click',()=>join(true));
  $('q-own-listen').addEventListener('click',()=>{if(own())play([own()]);});$('q-play-all').addEventListener('click',()=>play(selectedRecords()));$('q-stop').addEventListener('click',stop);
  $('q-expression').addEventListener('change',()=>{stop();const dots=$('q-expression').value==='dots';$('q-axis').disabled=dots;$('q-zoom').disabled=!dots;renderResults();status('표현을 바꿨습니다. 선택한 기록은 유지되며 다시 듣기를 누르면 처음부터 재생합니다.');});
  $('q-data-filter').addEventListener('change',()=>{stop();renderResults();});
  $('q-question-selection').addEventListener('change',()=>{stop();renderResults();});
  $('q-zoom').addEventListener('change',renderResults);
  $('q-person').addEventListener('change',()=>{stop();renderResults();});$('q-axis').addEventListener('change',renderResults);$('q-show-original').addEventListener('change',renderResults);
  $('q-speed').addEventListener('change',()=>{stop();$('q-rate').textContent=`모든 질문 ${$('q-speed').value}×`;status('같은 배율을 모든 질문에 적용합니다. 원본 시각은 바뀌지 않습니다. 다시 듣기를 눌러 주세요.');});
  $('q-volume').addEventListener('input',event=>player.setVolume(event.target.value));
  $('q-load-examples').addEventListener('click',()=>{try{stop();const count=store.add(HelloQuestionExamples.examples());screen('results');$('q-person').value='all';renderResults();status(store.warning||`발표용 합성 예시 ${count}명 × 세 답변을 추가했습니다. 실제 관객의 일반적 패턴을 뜻하지 않습니다.`);}catch(error){status(error.message);}});
  $('q-remove-examples').addEventListener('click',()=>{if(!window.confirm('이전 합성 예시 6명만 제거할까요? 발표 배치와 실제 기록은 유지합니다.'))return;stop();store.removeExamples();renderResults();status(store.warning||'이전 합성 예시만 제거했습니다.');});
  $('q-seed-demo').addEventListener('click',()=>{try{stop();const result=HelloQuestionDemo.seed(store);screen('results');renderResults();status(result.persisted?`발표용 합성 데이터: ${result.participants}명 · ${result.answers}답변 등록 확인 (${result.added}명 추가). 실제 관객 기록이 아닙니다.`:store.warning||'브라우저 저장을 확인하지 못했습니다. JSON으로 백업해 주세요.');}catch(error){status(`배치 등록 실패: ${error.message} 기존 기록은 유지했습니다.`);}});
  $('q-remove-demo').addEventListener('click',()=>{if(!window.confirm(`발표용 합성 데이터 배치 ${HelloQuestionDemo.batchId}만 제거할까요? 실제 기록과 이전 예시는 유지합니다.`))return;stop();store.removeDemoBatch(HelloQuestionDemo.batchId);renderResults();status(store.warning||'지정한 발표용 합성 배치만 제거했습니다.');});
  $('q-download').addEventListener('click',()=>{try{const url=URL.createObjectURL(new Blob([D.serialize(store.getRecords())],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='three-questions-v2.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){status(error.message);}});
  $('q-upload').addEventListener('click',()=>$('q-file').click());
  $('q-file').addEventListener('change',async event=>{const token=generation,file=event.target.files?.[0];try{if(!file)return;if(file.size>C.maxFileBytes)throw Error('파일은 16MB 이하여야 합니다.');const records=D.parse(await file.text());if(!active||token!==generation)return;stop();const count=store.add(records);screen('results');renderResults();status(store.warning||`${count}명의 완료 기록을 불러왔습니다. 소리는 자동 재생하지 않습니다.`);}catch(error){status(`불러오기 실패: ${error.message} 기존 기록은 유지했습니다.`);}finally{event.target.value='';}});
  $('q-clear').addEventListener('click',()=>{if(window.confirm('질문형 B의 누적 기록을 모두 삭제할까요? A와 이전 B 기록은 유지됩니다.')){stop();store.clear();pending=null;currentId=null;renderResults();status(store.warning||'질문형 B 기록을 삭제했습니다.');}});
  globalThis.HelloQuestions={enter,leave,store,player,begin,openQuestion,submit,join,
    diagnostics:()=>({active,state,questionIndex:index,answers:session?.answers.length||0,composing:!!recorder?.composing,rawEvents:recorder?.events.length||0,inputBindings:bindings.length,frame,running:player.running,voices:player.voices.size,timer:player.timer}),
    getPending:()=>pending?D.clone(pending):null};
})();
