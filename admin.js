(() => {
  'use strict';
  const $=id=>document.getElementById(id),pageSize=20;
  let rounds=[],activeRound='',page=null,offset=0,serial=0,mutating=false,detail=null,detailSerial=0;
  const selected=new Map(),key=r=>JSON.stringify([r.roundId,r.id]);
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
  const seconds=value=>Number.isFinite(value)?`${(value/1000).toFixed(2)}초`:'—';
  const date=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(d);};
  const source=r=>r.isDemo||r.source==='synthetic'?'발표용 합성':'실제 응답';
  async function call(path,method='GET',data){
    const response=await fetch('/api/admin/'+path,{method,headers:{'Content-Type':'application/json'},cache:'no-store',...(data?{body:JSON.stringify(data)}:{})});
    let value;try{value=await response.json();}catch{throw Error('서버 응답을 읽지 못했습니다. 잠시 후 다시 시도하세요.');}
    if(!response.ok){if([401,403].includes(response.status)){$('login-panel').hidden=false;$('tools').hidden=true;if($('record-dialog').open)$('record-dialog').close();detail=null;detailSerial++;}throw Error(value.error||`요청에 실패했습니다 (${response.status}).`);}return value;
  }
  function download(value,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function controls(){
    $('delete-selected').disabled=mutating||!selected.size;$('delete-selected').textContent=selected.size?`선택한 ${selected.size}개 삭제`:'선택 삭제';$('selected-count').textContent=`${selected.size}개 선택`;
    $('previous').disabled=mutating||offset===0;$('next-page').disabled=mutating||!page?.hasMore;
    const items=page?.records||[];$('select-page').disabled=mutating||!items.length;$('select-page').checked=!!items.length&&items.every(r=>selected.has(key(r)));$('select-page').indeterminate=items.some(r=>selected.has(key(r)))&&!$('select-page').checked;
    for(const id of ['add-demo','remove-demo'])$(id).disabled=mutating||$('round-filter').value==='all';
    for(const id of ['export','refresh','switch-round','download-record','delete-detail'])$(id).disabled=mutating;
    $('demo-round').textContent=$('round-filter').value==='all'?'회차 선택 필요':`대상: ${$('round-filter').selectedOptions[0]?.textContent||''}`;
  }
  function render(){
    const root=$('records');root.replaceChildren();selected.clear();
    for(const r of page.records){
      const row=node('tr');row.dataset.record=r.id;row.dataset.round=r.roundId;
      const pick=node('td'),box=node('input');box.type='checkbox';box.setAttribute('aria-label',`${source(r)} ${r.id} 선택`);box.addEventListener('change',()=>{if(box.checked)selected.set(key(r),r);else selected.delete(key(r));controls();});pick.append(box);
      const info=node('td');info.append(node('span',source(r),'badge'+(r.isDemo?' demo':'')),node('code',r.id),node('div',`회차 · ${r.roundId}`,'record-round'));
      if(r.demoBatchId)info.append(node('div',r.demoBatchId==='presentation-5-v1'?'기본 5인 배치':r.demoBatchId==='presentation-10-v1'?'기존 10인 배치':r.demoBatchId,'record-round'));
      const answers=node('td');for(const a of r.answers){const text=node('div',undefined,'answer-preview');text.append(node('span',a.questionId,'q-label'),document.createTextNode(a.text));answers.append(text);}
      const when=node('td',date(r.createdAt)),actions=node('td'),view=node('button','상세','secondary'),remove=node('button','삭제','danger');view.addEventListener('click',()=>openDetail(r));remove.addEventListener('click',()=>deleteRecords([r]));actions.append(view,remove);
      row.append(pick,info,answers,when,actions);root.append(row);
    }
    $('empty').hidden=page.records.length>0;$('counts').textContent=`검색 결과 ${page.counts.total}개 · 실제 ${page.counts.actual}개 · 합성 ${page.counts.demo}개`;
    $('page-info').textContent=page.counts.total?`${offset+1}–${offset+page.records.length} / ${page.counts.total}개`:'0개';controls();
  }
  async function loadRecords(reset=false){
    if(reset)offset=0;const generation=++serial;$('record-list').setAttribute('aria-busy','true');
    const params=new URLSearchParams({round:$('round-filter').value,source:$('source-filter').value,search:$('search').value.trim(),limit:String(pageSize),offset:String(offset)});
    try{const result=await call('records?'+params);if(generation!==serial)return false;page=result;if(!result.records.length&&offset>0){offset=Math.max(0,offset-pageSize);return await loadRecords();}render();return true;}
    catch(error){if(generation===serial)status(error.message,true);return false;}
    finally{if(generation===serial)$('record-list').setAttribute('aria-busy','false');}
  }
  function roundForm(){const value=rounds.find(r=>r.id===$('round-filter').value)||rounds.find(r=>r.id===activeRound);$('round-id').value=value?.id||activeRound;$('round-title').value=value?.title||'Your Type';$('include-demo').checked=value?.include_demo===1;controls();}
  async function loadRounds(initial=false){
    const value=await call('rounds'),old=$('round-filter').value;rounds=value.rounds;activeRound=value.current;
    if(!rounds.some(r=>r.id===activeRound))rounds.unshift({id:activeRound,title:'Your Type',include_demo:0});
    const select=$('round-filter');select.replaceChildren();const all=node('option','전체 회차');all.value='all';select.append(all);
    for(const r of rounds){const option=node('option',`${r.title} · ${r.id}${r.id===activeRound?' (발표 중)':''}`);option.value=r.id;select.append(option);}
    select.value=initial?activeRound:old==='all'||rounds.some(r=>r.id===old)?old:activeRound;
    $('active-round').textContent=`발표 중 · ${activeRound}`;roundForm();
  }
  async function mutation(task){if(mutating)return;mutating=true;controls();try{await task();}catch(error){status(error.message,true);}finally{mutating=false;controls();}}
  async function deleteRecords(records){
    if(mutating||!records.length)return;
    const real=records.filter(r=>r.source==='participant').length;
    if(!window.confirm(`${records.length}개 기록을 서버에서 삭제할까요?${real?` 실제 응답 ${real}개가 포함됩니다.`:''}\n삭제 후 되돌릴 수 없습니다.`))return;
    await mutation(async()=>{const result=await call('records','DELETE',{records:records.map(r=>({id:r.id,roundId:r.roundId})),confirm:'delete-selected'});if(detail&&records.some(r=>r.id===detail.record.id&&r.roundId===detail.roundId))closeDetail();await loadRecords();status(`${result.deleted}개 기록을 삭제했습니다.`);});
  }
  function closeDetail(){detailSerial++;detail=null;$('record-dialog').close();}
  async function openDetail(r){
    if(mutating)return;const generation=++detailSerial;
    try{
      const value=await call('record?'+new URLSearchParams({round:r.roundId,id:r.id}));if(generation!==detailSerial)return;detail=value;
      $('detail-heading').textContent=source(value.record)+' · 기록 상세';const root=$('detail-content');root.replaceChildren();
      root.append(node('code',value.record.id),node('p',`회차 ${value.roundId} · ${date(value.createdAt)}`,'muted'));
      for(const a of value.record.answers){
        const article=node('article',undefined,'detail-answer');article.append(node('h3',`${a.questionId} · ${a.question.ko}`),node('p',a.text,'text'));
        const count=a.typingActivities?.length??a.characters.length,metrics=node('div',undefined,'metrics');
        metrics.append(node('span',`첫 입력 전 ${seconds(a.firstActivityMs)}`),node('span',`제출까지 ${seconds(a.submittedAtMs)}`),node('span',`입력 활동 ${count}개`),node('span',`수정 ${a.events.filter(e=>e.type==='commit'&&e.removed).length}회`));article.append(metrics,node('code',`${a.recordingVersion} · 질문 v${a.questionVersion}`));
        const logs=node('details'),summary=node('summary',`입력 시간·수정 로그 보기 (${a.events.length}개)`);logs.append(summary);let expanded=false;logs.addEventListener('toggle',()=>{if(logs.open&&!expanded){logs.append(node('pre',JSON.stringify({characters:a.characters,typingActivities:a.typingActivities,events:a.events},null,2)));expanded=true;}});article.append(logs);root.append(article);
      }
      if(!$('record-dialog').open)$('record-dialog').showModal();
    }catch(error){status(error.message,true);}
  }
  $('filters').addEventListener('submit',event=>{event.preventDefault();loadRecords(true);});
  $('round-filter').addEventListener('change',()=>{roundForm();loadRecords(true);});$('source-filter').addEventListener('change',()=>loadRecords(true));
  $('refresh').addEventListener('click',async()=>{try{await loadRounds();if(await loadRecords())status('서버 기록을 새로 불러왔습니다.');}catch(error){status(error.message,true);}});
  $('previous').addEventListener('click',()=>{offset=Math.max(0,offset-pageSize);loadRecords();});$('next-page').addEventListener('click',()=>{if(page?.hasMore){offset+=pageSize;loadRecords();}});
  $('select-page').addEventListener('change',()=>{const checked=$('select-page').checked;for(const r of page?.records||[])if(checked)selected.set(key(r),r);else selected.delete(key(r));$('records').querySelectorAll('input[type=checkbox]').forEach(n=>n.checked=checked);controls();});
  $('delete-selected').addEventListener('click',()=>deleteRecords([...selected.values()]));
  $('close-detail').addEventListener('click',closeDetail);$('record-dialog').addEventListener('cancel',()=>{detailSerial++;detail=null;});
  $('delete-detail').addEventListener('click',()=>{if(detail)deleteRecords([{...detail.record,roundId:detail.roundId}]);});
  $('download-record').addEventListener('click',()=>{if(detail)download({schemaVersion:2,kind:'three-questions-collection',records:[detail.record]},`your-type-${detail.record.id.replace(/[^A-Za-z0-9._-]/g,'-')}.json`);});
  $('export').addEventListener('click',()=>mutation(async()=>{download(await call('export'),'your-type-server-backup.json');status('전체 회차의 서버 기록을 저장했습니다.');}));
  $('add-demo').addEventListener('click',()=>{const roundId=$('round-filter').value;if(roundId==='all')return;mutation(async()=>{const result=await call('demo','POST',{roundId,batchId:$('demo-batch').value});await loadRecords(true);status(`${result.participants}명 · ${result.answers}답변 합성 배치를 준비했습니다. 이미 있는 기록은 중복 추가하지 않았습니다.`);});});
  $('remove-demo').addEventListener('click',()=>{const roundId=$('round-filter').value,batchId=$('demo-batch').value;if(roundId==='all'||!confirm(`${roundId} 회차의 ${$('demo-batch').selectedOptions[0].textContent}만 삭제할까요? 실제 응답과 다른 배치는 유지합니다.`))return;mutation(async()=>{await call('demo','DELETE',{roundId,confirm:batchId});await loadRecords(true);status('선택한 합성 배치만 삭제했습니다.');});});
  $('switch-round').addEventListener('click',()=>{const id=$('round-id').value.trim(),title=$('round-title').value.trim(),includeDemo=$('include-demo').checked;if(!id||!title){status('회차 ID와 제목을 입력하세요.',true);return;}if(!confirm(`${title} (${id})를 새 관객의 발표 회차로 적용할까요? 진행 중인 체험은 기존 회차를 유지합니다.`))return;mutation(async()=>{await call('rounds','POST',{id,title,includeDemo});await loadRounds();$('round-filter').value=id;roundForm();await loadRecords(true);status('발표 회차 설정을 적용했습니다.');});});
  (async()=>{try{await loadRounds(true);$('login-panel').hidden=true;$('tools').hidden=false;if(await loadRecords())status('발표자 권한을 확인했습니다. 서버 기록을 관리할 수 있습니다.');}catch(error){status(error.message+' 발표자 계정으로 로그인해 주세요.',true);}})();
})();
