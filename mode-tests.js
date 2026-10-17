globalThis.runModeTests = async ({ check, assert, same, fourRecord, frame, uiAudio, type }) => {
  const w = frame.contentWindow, d = frame.contentDocument, $ = id => d.getElementById(id);
  const host = w.HelloExperiments, a = w.HelloOrchestra;
  const base = HelloOrchestraData.capture(fourRecord, 'mode-roundtrip-example', { melody:null }, .07);
  base.source = 'example'; base.a.handwriting = { volume:.03, strokes:[
    [{x:.1,y:.9,time:0,kind:'down'},{x:.8,y:.9,time:1000,kind:'up'}],
    [{x:.8,y:.1,time:1500,kind:'down'},{x:.1,y:.1,time:2000,kind:'up'}]
  ] };
  host.importText(JSON.stringify(base));
  check('모드 JSON: A 전체 입력·자간·선택 손글씨·음량을 원본에서 복원', () => {
    assert(a.diagnostics().state === 'complete' && !$('play').disabled && !$('play-together').disabled);
    same(a.getRecord().relativeTimesMs, base.relativeTimesMs);
    same(a.getRecord().raw, base.raw);
    same(a.getRecord().a.handwriting.strokes, base.a.handwriting.strokes);
    assert(a.getRecord().a.handwriting.volume === base.a.handwriting.volume);
    assert($('bar-metrics').children.length === 4 && $('record-summary').textContent.includes('실제 참여자 아님'));
    assert($('letters').querySelectorAll('.recorded').length === 20);
  });
  const before = JSON.stringify(a.getRecord()), beforeSelected = JSON.stringify(host.getRecord());
  for (const text of ['{',JSON.stringify({...base,schemaVersion:9}),JSON.stringify({...base,a:{bars:[]}})]) {
    try { host.importText(text); } catch { /* transactional rejection */ }
  }
  check('모드 JSON: 잘못된 파일은 A 기록·선율·공통 선택을 변경하지 않음', () => {
    assert(before === JSON.stringify(a.getRecord()) && beforeSelected === JSON.stringify(host.getRecord()));
  });
  const originalDownload = w.HelloRecording.download; let saved;
  w.HelloRecording.download = record => { saved = JSON.stringify(record); };
  try { $('save-json').click(); } finally { w.HelloRecording.download = originalDownload; }
  check('모드 JSON: 실제 저장 버튼이 공통 기록과 원본 손글씨를 전달', () => {
    assert(JSON.parse(saved).id === base.id && JSON.parse(saved).a.handwriting.strokes.length === 2);
  });
  $('play-together').click(); await Promise.resolve(); await Promise.resolve();
  check('모드 전환 전 A 타악기·선율·글자/경로 RAF가 실제로 예약됨', () => {
    assert(a.diagnostics().voices > 20 && a.diagnostics().loopTimer !== null && a.diagnostics().handwritingFrame !== null);
  });
  $('nav-b').click();
  check('A→B: 음원·예약·타이머·두 RAF·키보드/Canvas 리스너 모두 해제', () => {
    const state = a.diagnostics();
    assert(!state.active && state.voices === 0 && state.events === 0 && state.loopTimer === null);
    assert(state.letterFrame === null && state.handwritingFrame === null && state.inputBindings === 0 && !state.canvasInputEnabled);
    assert($('mode-a').hidden && !$('mode-b').hidden && $('letters').querySelectorAll('.sounding').length === 0);
  });
  check('B: 준비 중을 명시 · 공통 기록 연결 · 오디오/입력 엔진 없음', () => {
    assert(host.getMode() === 'b' && !w.HelloSoundscape.diagnostics().audioImplemented);
    assert($('mode-b').textContent.includes('아직 구현하지 않았습니다'));
    assert(w.HelloSoundscape.getRecords().some(record => record.id === base.id));
    assert($('b-records').textContent.includes('실제 참여자 아님'));
  });
  const basic = { schemaVersion:1,id:'b-common-only',text:'hello',relativeTimesMs:[0,180,420,570,900],durationMs:900,source:'imported' };
  host.importText(JSON.stringify(basic));
  check('B: 최소 공통 JSON도 연결 · 저장 기록 개수는 ID 기준', () => {
    const count = host.getRecords().length; host.importText(JSON.stringify(basic));
    assert(host.getRecords().length === count && w.HelloSoundscape.getRecords().some(record => record.id === basic.id));
  });
  // A-compatible example selected in B must survive A.enter() publishing older data.
  host.importText(JSON.stringify(base)); $('nav-a').click();
  check('B→A: 같은 JSON을 다시 사용하고 이전 소리를 자동 재생하지 않음', () => {
    assert(a.diagnostics().active && a.diagnostics().state === 'complete' && a.diagnostics().voices === 0);
    assert(a.getRecord().id === base.id && !$('play-together').disabled);
  });
  const wait = async predicate => { for(let i=0;i<300;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('mode test timeout'); };
  const transfer = new w.DataTransfer(); transfer.items.add(new w.File(['{bad json'], 'bad.json', {type:'application/json'}));
  $('json-file').files = transfer.files; $('json-file').dispatchEvent(new w.Event('change'));
  await wait(() => $('json-status').textContent.includes('불러오기 실패'));
  check('실제 파일 입력: 잘못된 JSON 안내 · 기존 A 손글씨·기록 보존', () => {
    assert(a.getRecord().id === base.id && !!a.getRecord().a.handwriting && $('json-file').value === '');
  });
  const validTransfer = new w.DataTransfer(); validTransfer.items.add(new w.File([JSON.stringify(base)], 'example.json', {type:'application/json'}));
  $('json-file').files = validTransfer.files; $('json-file').dispatchEvent(new w.Event('change'));
  await wait(() => $('json-status').textContent.includes('불러왔습니다'));
  check('실제 파일 입력: JSON 왕복 후 재생·손글씨·WAV 기능 사용 가능', () => {
    assert(!$('play').disabled && !$('play-together').disabled && !$('download-original').disabled && !$('download-repeated').disabled);
  });
  let resolveFile;
  const pendingFile = host.importFile({ size:10,text:()=>new Promise(resolve=>{resolveFile=resolve;}) });
  $('nav-b').click(); resolveFile(JSON.stringify({...basic,id:'late-file'})); await pendingFile;
  check('모드 전환 중 늦게 끝난 파일 읽기는 이전 모드에 적용하지 않음', () => assert(!host.getRecords().some(record => record.id === 'late-file')));
  $('nav-a').click();
  const realRender = w.HelloWav.renderExport, realDownloadWav = w.HelloWav.download; let resolveExport, downloads = 0;
  w.HelloWav.renderExport = () => new Promise(resolve => { resolveExport = resolve; });
  w.HelloWav.download = () => { downloads++; };
  try {
    $('download-original').click(); assert(a.diagnostics().exporting);
    $('nav-b').click(); resolveExport({wav:new ArrayBuffer(44),gain:1,plan:{durationSeconds:1,count:1}});
    await wait(() => !a.diagnostics().exporting);
    check('WAV 렌더 중 모드 전환: 오래된 완료 콜백의 다운로드·화면 반응 취소', () => {
      assert(downloads === 0 && host.getMode() === 'b' && !a.diagnostics().active);
    });
  } finally { w.HelloWav.renderExport = realRender; w.HelloWav.download = realDownloadWav; }
  for(let i=0;i<5;i++){host.selectMode('a');host.selectMode('b');}
  host.selectMode('a'); $('reset').click(); [...'hello'].forEach(type); type('Enter');
  check('반복 모드 전환: 입력 리스너 중복 없음 · 하나의 Enter는 한 마디만 완료', () => {
    assert($('bar-progress').textContent.includes('완료 1개') && a.diagnostics().inputBindings > 0);
  });
  $('nav-b').click();
  const zone = $('input-zone');zone.dispatchEvent(new w.KeyboardEvent('keydown',{key:'h',code:'KeyH',bubbles:true}));
  check('입력 중 A→B: 부분 시도 취소 · 숨겨진 영역의 키 입력 미적용', () => {
    assert(a.diagnostics().state === 'waiting' && a.diagnostics().inputBindings === 0);
    assert($('letters').querySelectorAll('.recorded').length === 0);
  });
  $('nav-home').click();
  check('시작 화면: A/B 두 모드 선택 · B 준비 상태 · 모드별 화면 숨김', () => {
    assert(!$('mode-home').hidden && $('mode-a').hidden && $('mode-b').hidden && $('mode-nav').hidden);
    assert($('mode-home').textContent.includes('준비 중'));
  });
  const fresh = document.createElement('iframe');
  const markup = await (await fetch('index.html')).text();
  const noAudio = `<base href="${location.href}"><script>window.AudioContext=function(){throw Error('B must not create audio');};window.OfflineAudioContext=function(){throw Error('B must not decode audio');};<\/script>`;
  fresh.srcdoc = markup.replace('<head>', '<head>' + noAudio); document.body.append(fresh);
  await new Promise(resolve => fresh.addEventListener('load', resolve, {once:true}));
  fresh.contentDocument.getElementById('choose-b').click();
  check('새 B 진입: AudioContext와 디코더를 쓸 수 없어도 준비 화면 정상', () => {
    assert(fresh.contentWindow.HelloExperiments.getMode() === 'b');
    assert(!fresh.contentDocument.getElementById('mode-b').hidden && !fresh.contentWindow.HelloOrchestra.diagnostics().active);
  });
  fresh.remove();
};
