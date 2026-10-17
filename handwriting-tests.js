globalThis.runHandwritingTests = async ({ check, assert, same, realBank, fakeAudio, frame, uiAudio, type }) => {
  const { HandwritingRecorder, convert, zoneFor, cursorAt } = HelloHandwriting;
  const stroke = (points, start, end) => points.map(([x, y], i) => ({ x, y,
    time: start + (end - start) * i / (points.length - 1), kind: i === 0 ? 'down' : i === points.length - 1 ? 'up' : 'move' }));
  check('손글씨: 아래 C4 → 위 C5의 6구역 · y방향 반전', () => {
    same([.99,.75,.58,.42,.25,.01].map(y => HelloHandwriting.NOTES[zoneFor(y)].name), ['C4','D4','E4','G4','A4','C5']);
    assert(zoneFor(1) === 0 && zoneFor(0) === 5);
  });
  const sample = [stroke([[.9,.95],[.5,.95],[.2,.95]],0,2000), stroke([[.8,.05],[.6,.05],[.1,.05]],3000,4000)];
  const melody = convert(sample, 1000);
  check('손글씨: H=4000 T=1000 비례 변환 · 획 사이 쉼 · 음 시작/끝 동일 비율', () => {
    assert(melody.handwritingMs === 4000 && melody.scale === .25);
    same(melody.notes.map(note => [note.name,note.startMs,note.endMs]), [['C4',0,500],['C5',750,1000]]);
    assert(melody.paths[0].at(-1).atMs === 500 && cursorAt(melody.paths, 600) === null);
  });
  check('손글씨: 오른쪽→왼쪽도 필기 순서 유지 · 획 사이 연결 없음', () => {
    assert(melody.paths[0][0].x === .9 && melody.paths[0].at(-1).x === .2);
    const cursor = cursorAt(melody.paths, 250); assert(cursor.x === .5);
    assert(cursorAt(melody.paths, -1) === null && cursorAt(melody.paths, 1001) === null);
  });
  check('손글씨: 같은 구역 유지 · 작은 경계 떨림은 재시작하지 않음', () => {
    const stable = convert([stroke([[.1,.52],[.2,.499],[.3,.501],[.4,.495],[.5,.505],[.6,.52]],0,1000)],1000);
    assert(stable.notes.length === 1 && stable.notes[0].name === 'E4');
  });
  check('손글씨: 구역 이동 시 새 음 · 같은 높이의 새 획도 새 음', () => {
    const moved = convert([stroke([[.1,.95],[.3,.95],[.5,.01],[.7,.01]],0,3000)],1000);
    assert(moved.notes.length === 2 && moved.notes[0].name === 'C4' && moved.notes[1].name === 'C5');
    assert(moved.notes[0].endMs === moved.notes[1].startMs);
    const repeated = convert([stroke([[.1,.95],[.4,.95]],0,1000),stroke([[.6,.95],[.9,.95]],2000,3000)],1000);
    assert(repeated.notes.length === 2 && repeated.notes.every(note => note.name === 'C4'));
  });
  check('손글씨: 빈 입력·점·T/H=0·비정상 값·미완성 획 거부', () => {
    const invalid = [() => convert([],1000), () => convert([stroke([[.5,.5],[.5,.5]],0,1000)],1000),
      () => convert(sample,0), () => convert(sample,NaN), () => convert(sample,Infinity),
      () => convert([stroke([[.1,.5],[.5,.5]],0,0)],1000),
      () => convert([[{ x:.1,y:.2,time:0,kind:'down' }]],1000),
      () => convert([stroke([[NaN,.2],[.3,.4]],0,1000)],1000)];
    assert(invalid.every(fn => { try { fn(); return false; } catch { return true; } }));
  });
  check('손글씨: 짧은 T를 늘리지 않음 · 첫 down~마지막 up만 사용', () => {
    const short = convert(sample,100); assert(short.short && short.targetMs === 100 && short.notes.at(-1).endMs === 100);
    const r = new HandwritingRecorder(); r.down(.2,.3,100); r.move(.5,.3,200); r.up(.8,.3,300);
    assert(convert(r.strokes,1000).handwritingMs === 200);
    r.down(.2,.3,10000); r.cancel(); assert(r.strokes.length === 1 && r.active === null);
    r.clear(); assert(r.strokes.length === 0);
  });
  const testCanvas=document.createElement('canvas');testCanvas.style.cssText='width:400px;height:240px';document.body.append(testCanvas);
  const testView=new HelloHandwriting.HandwritingCanvas(testCanvas,()=>{}),captured=new Set();
  testCanvas.setPointerCapture=id=>captured.add(id);testCanvas.hasPointerCapture=id=>captured.has(id);testCanvas.releasePointerCapture=id=>captured.delete(id);
  const dispatchPointer=(event,id,x,y)=>{
    const rect=testCanvas.getBoundingClientRect();testCanvas.dispatchEvent(new PointerEvent(event,{ pointerId:id,isPrimary:true,button:0,
      clientX:rect.left+x*rect.width,clientY:rect.top+y*rect.height,bubbles:true,cancelable:true }));
  };
  dispatchPointer('pointerdown',1,.25,.75);dispatchPointer('pointermove',2,.9,.1);dispatchPointer('pointermove',1,.75,.25);dispatchPointer('pointerup',1,.8,.2);
  check('Canvas: 정규화 좌표·down/move/up 구분 · 다른 포인터 무시',()=>{
    const points=testView.recorder.strokes[0];
    same(points.map(point=>point.kind),['down','move','up']);assert(points[0].x===.25 && points[0].y===.75 && points[1].x===.75);
  });
  testCanvas.style.width='800px';testView.draw();
  check('Canvas: 크기를 바꿔도 정규화 경로와 음 구역 보존',()=>{
    assert(testView.recorder.strokes[0][0].y===.75 && zoneFor(testView.recorder.strokes[0][0].y)===1);
    assert(testCanvas.width===Math.round(testCanvas.getBoundingClientRect().width*(devicePixelRatio||1)));
  });
  dispatchPointer('pointerdown',3,.2,.2);dispatchPointer('pointercancel',3,.3,.3);
  check('Canvas: pointercancel은 미완성 획만 제거',()=>assert(testView.recorder.strokes.length===1 && testView.pointerId===null));
  testView.clear();
  const originalRequest=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
  let visualTick,visualCanceled=false;const positions=[];
  globalThis.requestAnimationFrame=fn=>{visualTick=fn;return 55;};
  globalThis.cancelAnimationFrame=id=>{visualCanceled=id===55;};
  const originalDraw=testView.draw;
  testView.draw=position=>positions.push(position||null);testView.melody=melody;
  const visualPlayer={playing:true,startTime:.06,looping:false,loopPeriod:1.2,context:{currentTime:.31}};
  try {
    testView.start(visualPlayer);
    check('필기 커서: 변환한 오디오 시간축에서 이동 · 획 사이 쉼은 점 없음',()=>{
      assert(Math.abs(positions.at(-1).x-.5)<1e-8);
      visualPlayer.context.currentTime=.66;visualTick();assert(positions.at(-1)===null);
    });
    visualPlayer.looping=true;visualPlayer.context.currentTime=1.51;visualTick();
    check('필기 커서: 다음 루프에서도 같은 위상 · 정지 시 RAF와 잔여 반응 취소',()=>{
      assert(Math.abs(positions.at(-1).x-.5)<1e-8);
      testView.stop();const count=positions.length;visualTick();
      assert(visualCanceled && positions.length===count && positions.at(-1)===null && testView.frame===null);
    });
  } finally {
    globalThis.requestAnimationFrame=originalRequest;globalThis.cancelAnimationFrame=originalCancel;
    testView.draw=originalDraw;testView.resize.disconnect();testCanvas.remove();
  }

  const audio = fakeAudio(); let done = 0;
  const player = new HelloRhythm.RhythmPlayer(() => audio.context,realBank);
  await player.play([0,180,420,570,900],() => done++,{ melody });
  check('동시 재생: 같은 AudioContext 시작 · triangle · 비례 음 시작/끝과 release', () => {
    same(audio.sources.slice(0,5).map(source => Math.round((source.startAt-player.startTime)*1000)),[0,180,420,570,900]);
    same(audio.oscillators.map(source => Math.round((source.startAt-player.startTime)*1000)),[0,750]);
    same(audio.oscillators.map(source => Math.round((source.stops[0]-player.startTime)*1000)),[520,1020]);
    assert(audio.oscillators.every(source => source.type === 'triangle'));
    assert(Math.abs(audio.oscillators[0].frequencyValue-261.625565)<.001 && audio.oscillators[1].frequencyValue>523);
  });
  audio.sources.slice(0,5).forEach(source => source.onended());
  check('동시 재생: 드럼 종료만으로 선율 release를 끊지 않음 · 음량 변경', () => {
    assert(player.playing && done === 0);
    player.setMelodyVolume(.03); assert(player.melodyGain.level === .03);
  });
  audio.oscillators.forEach(source => source.onended());
  check('동시 재생: 모든 소리 종료 후 재청취 가능', () => assert(done === 1 && !player.playing && player.voices.size === 0));
  let queued, canceled = false;
  const looper = new HelloRhythm.RhythmPlayer(() => audio.context,realBank,
    { setInterval(fn) { queued=fn;return 1; }, clearInterval() { canceled=true; } });
  const baseline = audio.oscillators.length;
  await looper.play([0,180,420,570,900],() => {},{ loop:true,loopGapMs:300,melody });
  audio.context.currentTime=11.1;queued();
  check('동시 루프: 다음 주기에도 선율과 리듬을 동일 시작으로 예약', () => {
    assert(audio.oscillators.length===baseline+4);
    assert(Math.abs(audio.oscillators.at(-2).startAt-11.26)<1e-8);
  });
  const sourceCount=audio.sources.length; looper.stop(); queued();
  check('정지: 모든 선율·드럼·반복 예약 취소 · 늦은 콜백 무시', () => {
    assert(canceled && audio.sources.length===sourceCount && looper.voices.size===0 && looper.melodyGain===null);
    assert(audio.oscillators.slice(baseline).every(source => source.disconnected && source.onended===null && source.stops.at(-1)===11.1));
  });

  const offline = new OfflineAudioContext(1,44100*2,44100);
  const adapter = { state:'running',currentTime:0,destination:offline.destination,
    createBufferSource:()=>offline.createBufferSource(),createGain:()=>offline.createGain(),createOscillator:()=>offline.createOscillator() };
  const actual = new HelloRhythm.RhythmPlayer(()=>adapter,realBank);
  await actual.play([0,180,420,570,900],()=>{},{melody});
  const pcm=(await offline.startRendering()).getChannelData(0);
  check('실제 Web Audio: 선율+타악기 파형 생성 · 공통 시작 전 무음 · 잔향 보존', () => {
    assert(pcm.slice(0,2600).every(value=>value===0));
    assert(pcm.some(value=>Math.abs(value)>.1));
    assert(pcm.slice(44100).some(value=>Math.abs(value)>0));
  });
  const drumsContext=new OfflineAudioContext(1,44100*2,44100);
  const drumsPlayer=new HelloRhythm.RhythmPlayer(()=>({ ...adapter,destination:drumsContext.destination,
    createBufferSource:()=>drumsContext.createBufferSource(),createGain:()=>drumsContext.createGain() }),realBank);
  await drumsPlayer.play([0,180,420,570,900],()=>{});
  const drumsPcm=(await drumsContext.startRendering()).getChannelData(0);
  check('실제 Web Audio: 드럼만 파형과 비교해 낮은 음량의 선율·pen-up 쉼 확인',()=>{
    let power=0,peak=0,restPeak=0;
    for(let i=0;i<pcm.length;i++){
      const value=pcm[i]-drumsPcm[i];power+=value*value;peak=Math.max(peak,Math.abs(value));
      if(i>44100*.62 && i<44100*.78)restPeak=Math.max(restPeak,Math.abs(value));
    }
    assert(Math.sqrt(power/pcm.length)>.005 && peak<.09 && restPeak<.0001);
  });
  const silentContext=new OfflineAudioContext(1,44100*2,44100);
  const silentPlayer=new HelloRhythm.RhythmPlayer(()=>({ ...adapter,destination:silentContext.destination,
    createBufferSource:()=>silentContext.createBufferSource(),createGain:()=>silentContext.createGain(),createOscillator:()=>silentContext.createOscillator() }),realBank);
  await silentPlayer.play([0,180,420,570,900],()=>{},{melody}); silentPlayer.stop();
  const silent=(await silentContext.startRendering()).getChannelData(0);
  check('실제 Web Audio: 정지 후 드럼과 oscillator 예약 모두 무음',()=>assert(silent.every(value=>value===0)));

  const w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id);
  frame.focus(); $('reset').click();
  for(let bar=0;bar<4;bar++){[...'hello'].forEach(type);type('Enter');}
  check('UI: 손글씨 생략 시 네 마디 리듬만 재생 가능',()=>assert(!$('play').disabled && $('handwriting-panel').hidden));
  $('add-handwriting').click();$('finish-writing').click();
  check('UI: 선택적으로 Canvas 표시 · 빈 입력 안내',()=>{
    assert(!$('handwriting-panel').hidden && $('play-together').disabled && $('handwriting-status').textContent.includes('드래그'));
  });
  const canvas=$('handwriting-canvas'),captures=new Set();
  canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);
  let time=10000;Object.defineProperty(w.performance,'now',{configurable:true,value:()=>time});
  const pointer=(event,x,y,t)=>{
    time=t;const rect=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new w.PointerEvent(event,{pointerId:77,isPrimary:true,button:0,buttons:event==='pointerup'?0:1,
      clientX:rect.left+x*rect.width,clientY:rect.top+y*rect.height,bubbles:true,cancelable:true}));
  };
  pointer('pointerdown',.2,.5,10000);pointer('pointerup',.2,.5,11000);$('finish-writing').click();
  check('UI: 점 하나 입력 거부',()=>assert($('play-together').disabled && $('handwriting-status').textContent.includes('점')));
  $('clear-writing').click();
  pointer('pointerdown',.8,.95,10000);pointer('pointermove',.4,.95,11000);pointer('pointerup',.2,.95,12000);
  pointer('pointerdown',.7,.05,13000);pointer('pointermove',.4,.05,13500);pointer('pointerup',.1,.05,14000);
  time=99000; $('finish-writing').click();
  check('UI: 여러 획과 pen-up 쉼 변환 · 마지막 완료 대기 제외 · 짧은 T 안내',()=>{
    assert(!$('play-together').disabled && $('handwriting-status').textContent.includes('4000ms 필기'));
    assert($('handwriting-status').textContent.includes('더 천천히'));
  });
  const oscillatorCount=uiAudio.oscillators.length;
  $('play-together').click();await Promise.resolve();await Promise.resolve();
  check('UI: 함께 듣기 중 중복 재생 차단 · 필기 재생 커서 RAF 시작',()=>{
    assert($('play-together').disabled && $('play').disabled && !$('stop').disabled);
    assert(uiAudio.oscillators.length>oscillatorCount);
  });
  $('melody-volume').value='20';$('melody-volume').dispatchEvent(new w.Event('input'));
  check('UI: 재생 중 선율 음량 변경',()=>assert($('melody-volume-value').textContent==='20%'));
  $('stop-handwriting').click();
  check('UI: 손글씨 옆 정지 버튼으로 전체 재생 정지 · 다시 함께 듣기 가능',()=>{
    assert($('status').textContent==='입력 완료' && !$('play-together').disabled && $('stop-handwriting').disabled);
  });
  $('play-together').click();await Promise.resolve();await Promise.resolve();
  $('clear-writing').click();
  check('UI: 삭제 시 음원·선율·반복·커서 취소 · 리듬만 듣기 유지',()=>{
    assert($('status').textContent==='입력 완료' && !$('play').disabled && $('play-together').disabled);
    assert(uiAudio.oscillators.slice(oscillatorCount).every(source=>source.disconnected && source.onended===null));
  });
  $('without-melody').click();$('play').click();await Promise.resolve();
  check('UI: 선율 없이 복귀 · 화면 이탈 시 전체 정지',()=>{
    assert($('handwriting-panel').hidden); w.dispatchEvent(new w.Event('blur'));
    assert($('status').textContent==='입력 완료' && !$('play').disabled);
  });
  $('reset').click();
  check('UI: 재입력 시 손글씨 선택과 변환 기록까지 초기화',()=>assert($('handwriting-panel').hidden && $('play-together').disabled && $('results').hidden));
};
