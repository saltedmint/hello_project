/* B owns its active listeners; storage and synthesis live in separate modules. */
(() => {
  'use strict';
  const $ = id=>document.getElementById(id), D = HelloSoundscapeData, V = HelloSoundscapeVisual;
  let storage; try { storage = window.localStorage; } catch { storage = {getItem(){throw Error();},setItem(){throw Error();}}; }
  const store = new D.Store(storage), recorder = new HelloTyping.PhraseRecorder(D.TEXT), player = new HelloSoundscapeAudio.Player();
  store.restore();
  let active=false, preview=null, kind='spacing', frame=null, composing=false, solo=null, bindings=[], generation=0;
  const message = text=>{$('b-feedback').textContent=text;};
  const selection = ()=>store.getRecords().filter(r=>!solo||r.id===solo);
  function stop() {
    generation++; player.stop(); cancelAnimationFrame(frame); frame=null;
    $('b-records').querySelectorAll('.b-sounding').forEach(node=>node.classList.remove('b-sounding'));
    $('b-sound-start').disabled=!store.records.length; $('b-stop').disabled=true; $('b-playing').textContent='정지';
  }
  function animate() {
    $('b-records').querySelectorAll('.b-sounding').forEach(node=>node.classList.remove('b-sounding'));
    for (const event of player.highlights()) {
      const row=[...$('b-records').children].find(node=>node.dataset.id===event.id);
      row?.querySelector(`[data-index="${event.index}"]`)?.classList.add('b-sounding');
    }
    if(active&&player.running) frame=requestAnimationFrame(animate);
  }
  async function start(id=null) {
    stop(); solo=id; const token=generation; $('b-sound-start').disabled=true; $('b-stop').disabled=false;
    try {
      await player.start(selection());
      if(token!==generation||!active)return;
      $('b-stop').disabled=false; $('b-playing').textContent=id?'한 기록 재생 중':'전체 재생 중';
      message('고요한 풍경을 재생합니다. 변경은 다음 반복 경계에서 반영됩니다.'); animate();
    } catch(error) {if(token===generation){stop();message(`재생 실패: ${error.message}`);}}
  }
  function renderDraft() {
    const row=$('b-input-letters'); row.replaceChildren();
    Array.from(D.TEXT).forEach((letter,index)=>{
      const span=document.createElement('span'); span.textContent=letter===' '?'\u00a0':letter;
      span.className=index<recorder.times.length?'b-entered':''; row.append(span);
    });
    $('b-submit').disabled=!preview; $('b-preview').hidden=!preview;
    if(preview){$('b-preview').replaceChildren(V.render(preview,kind));$('b-draft-status').textContent=`입력 완료 · ${preview.durationMs.toFixed(0)}ms · 공백 포함 14개 입력`;}
    else $('b-draft-status').textContent=recorder.active?`입력 중 · ${recorder.times.length}/14`:'영문 소문자 입력 모드로 준비해 주세요.';
  }
  function render() {
    const records=store.getRecords(), list=$('b-records'); list.replaceChildren();
    $('b-record-count').textContent=`${records.length} / ${D.LIMIT}개 기록`;
    $('b-sound-start').disabled=player.running||!records.length; $('b-download').disabled=!records.length;
    records.forEach((record,index)=>{
      const item=document.createElement('li'); item.dataset.id=record.id; item.className='b-record';
      item.style.setProperty('--age-opacity',String(Math.max(.58,1-(records.length-1-index)*.025)));
      const top=document.createElement('div'); top.className='b-record-heading';
      const title=document.createElement('span'); title.textContent=`${String(index+1).padStart(2,'0')} · ${record.source==='example'?'예시 · 실제 참여자 아님':'이 기기의 기록'} · ${(record.durationMs/1000).toFixed(2)}초`;
      top.append(title);
      for(const [label,action] of [['한 기록만 듣기',()=>start(record.id)],['제거',()=>{store.remove(record.id);changed();}]]){
        const button=document.createElement('button');button.textContent=label;button.addEventListener('click',action);top.append(button);
      }
      item.append(top,V.render(record,kind));list.append(item);
    });
    list.classList.toggle('morse-view',kind==='morse');
    $('b-spacing').setAttribute('aria-pressed',String(kind==='spacing'));$('b-morse').setAttribute('aria-pressed',String(kind==='morse'));
    renderDraft();
  }
  function changed() {
    if(solo&&!store.records.some(r=>r.id===solo))solo=null;
    if(!store.records.length)stop();else player.setRecords(selection());
    render();message(store.warning||(player.running?'다음 반복 경계에서 기록 변경을 반영합니다.':'기록을 저장했습니다. 소리는 자동으로 시작하지 않습니다.'));
  }
  function addRecords(records){const added=store.addRecords(records);changed();return added;}
  function begin(){stop();preview=null;composing=false;recorder.start();renderDraft();message('당신의 속도로 hello stranger를 입력해 주세요. 공백도 한 번 입력합니다.');$('b-input-zone').focus();}
  function cancelInput(){
    if(recorder.active){recorder.reset();preview=null;renderDraft();message('입력이 중단되었습니다. 다시 입력해 주세요.');}
    recorder.held.clear();composing=false;
  }
  function listen(target,type,handler){target.addEventListener(type,handler);bindings.push(()=>target.removeEventListener(type,handler));}
  function enter(records=[]){
    if(active)return;active=true;
    const matching=records.filter(r=>r.text===D.TEXT&&r.b);
    if(matching.length)try{store.addRecords(matching);}catch(error){message(error.message);}
    listen($('b-input-zone'),'keydown',event=>{
      if(!recorder.active)return;event.preventDefault();if(composing)return;
      const result=recorder.keydown(event,performance.now());
      if(result==='complete'){
        try{preview=D.create(recorder.times);message('나의 간격을 확인하고 ‘풍경에 보태기’를 눌러 주세요.');}
        catch(error){message(error.message);recorder.reset();}
      }else if(result==='wrong'){
        const expected=D.TEXT[recorder.times.length];message(`다음 문자는 ${expected===' '?'공백(Space)':`‘${expected}’`}입니다. 수정하려면 다시 입력해 주세요.`);
      }
      renderDraft();
    });
    listen($('b-input-zone'),'keyup',event=>recorder.release(event.code));
    listen($('b-input-zone'),'compositionstart',()=>{composing=true;});
    listen($('b-input-zone'),'compositionend',()=>{composing=false;});
    listen($('b-input-zone'),'paste',event=>{event.preventDefault();message('붙여넣기 대신 키보드로 입력해 주세요.');});
    listen($('b-input-zone'),'blur',cancelInput);
    listen(window,'blur',()=>{cancelInput();stop();});
    listen(document,'visibilitychange',()=>{if(document.hidden){cancelInput();stop();}});
    listen(window,'pagehide',()=>{cancelInput();stop();});
    render();if(store.warning)message(store.warning);
  }
  function leave(){active=false;stop();cancelInput();bindings.forEach(remove=>remove());bindings=[];}
  $('b-input-start').addEventListener('click',begin);$('b-reset').addEventListener('click',begin);
  $('b-submit').addEventListener('click',()=>{
    try{if(preview){addRecords([preview]);preview=null;recorder.reset();renderDraft();message(store.warning||'풍경에 보탰습니다. 다음 분은 ‘인사 입력하기’를 눌러 주세요.');}}
    catch(error){message(error.message);}
  });
  $('b-spacing').addEventListener('click',()=>{kind='spacing';render();});$('b-morse').addEventListener('click',()=>{kind='morse';render();});
  $('b-sound-start').addEventListener('click',()=>start());$('b-stop').addEventListener('click',stop);
  $('b-volume').addEventListener('input',event=>player.setVolume(event.target.value));
  $('b-examples').addEventListener('click',()=>{
    try{const count=addRecords(D.examples(Number($('b-example-count').value)));message(store.warning||`${count}개 예시를 추가했습니다. 예시는 실제 참여 기록이 아닙니다. 중복 예시는 추가하지 않습니다.`);}
    catch(error){message(error.message);}
  });
  $('b-download').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([D.serialize(store.getRecords())],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='greeting-soundscape.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  });
  $('b-upload').addEventListener('click',()=>$('b-json-file').click());
  $('b-json-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0],token=generation;
    try{
      if(!file)return;if(file.size>HelloRecording.MAX_FILE_BYTES)throw new Error('JSON은 2MB 이하여야 합니다.');
      const records=D.parse(await file.text());if(!active||token!==generation)return;
      const count=addRecords(records);message(store.warning||`${count}개 기록을 추가했습니다. 기존 기록은 유지했습니다.`);
    }catch(error){message(`불러오기 실패: ${error.message} 기존 기록은 유지했습니다.`);}
    finally{event.target.value='';}
  });
  $('b-clear').addEventListener('click',()=>{
    if(window.confirm('이 기기에 저장한 B 기록을 모두 삭제할까요? A 기록은 유지됩니다.')){stop();store.clear();changed();}
  });
  globalThis.HelloSoundscape={enter,leave,addRecords,
    setRecords(records){const matching=records.filter(r=>r.text===D.TEXT&&r.b);if(matching.length)addRecords(matching);},
    getRecords:()=>store.getRecords(),
    diagnostics:()=>({active,audioImplemented:true,inputBindings:bindings.length,frame,...player.diagnostics()}),player,store};
})();
