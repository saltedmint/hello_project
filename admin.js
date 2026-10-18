(() => {
  const $=id=>document.getElementById(id),status=text=>$('status').textContent=text;
  const demoLabel=document.createElement('label'),demoInput=document.createElement('input');demoInput.type='checkbox';demoInput.id='include-demo';demoLabel.append(demoInput,'발표용 합성 데이터를 누적 재생에 포함');$('switch').before(demoLabel);
  async function call(path,method='GET',data){const response=await fetch('/api/admin/'+path,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const value=await response.json();if(!response.ok)throw Error(value.error);return value;}
  async function load(){const value=await call('rounds');$('tools').hidden=false;$('round').value=value.current;const current=value.rounds.find(r=>r.id===value.current);$('title').value=current?.title||'Your Type';$('include-demo').checked=current?.include_demo===1;$('rounds').textContent=JSON.stringify(value.rounds,null,2);status('발표자 권한 확인 완료');}
  function action(id,handler){$(id).addEventListener('click',async()=>{try{$(id).disabled=true;await handler();}catch(error){status(error.message);}finally{$(id).disabled=false;}});}
  action('switch',async()=>{const id=$('round').value,title=$('title').value,includeDemo=$('include-demo').checked;if(!confirm('새 관객에게 이 회차를 적용할까요?'))return;await call('rounds','POST',{id,title,includeDemo});await load();});
  action('seed',async()=>status(JSON.stringify(await call('demo','POST',{}))));
  action('remove-demo',async()=>{if(confirm('현재 회차의 presentation-10-v1 합성 배치만 삭제할까요? 실제 응답은 유지합니다.'))status(JSON.stringify(await call('demo','DELETE',{confirm:'presentation-10-v1'})));});
  action('remove-one',async()=>{const id=$('delete-id').value,roundId=$('delete-round').value;if(confirm(`${roundId} / ${id} 기록을 삭제할까요?`))status(JSON.stringify(await call('response','DELETE',{id,roundId,confirm:id})));});
  action('export',async()=>{const value=await call('export'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='your-type-server-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('서버 기록을 다운로드했습니다.');});
  load().catch(error=>status(error.message+' 위의 발표자 로그인 링크를 사용하세요.'));
})();
