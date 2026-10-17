(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let recorder = new HelloTyping.Recorder();
  let active = false;
  let onRecord = () => {};
  let recordId = HelloRecording.newId();
  let baseRecord = null;
  const bindings = [];
  const listen = (target, type, handler) => bindings.push([target, type, handler]);
  const player = new HelloRhythm.RhythmPlayer();
  const zone = $('input-zone');
  const letters = [...$('letters').querySelectorAll('.letter')];
  const visual = new HelloRhythm.PlaybackVisual(letters);
  let state = 'waiting';
  let composing = false;
  let playbackRequest = 0;
  let handwritingOpen = false;
  let exporting = false;
  let exportGeneration = 0;
  const handwriting = new HelloHandwriting.HandwritingCanvas($('handwriting-canvas'), () => {
    stopPlayback();
    $('handwriting-status').textContent = '필기를 기록 중입니다. 여러 획을 쓴 뒤 ‘쓰기 완료’를 눌러 주세요.';
  });
  const labels = { waiting: '대기', recording: '입력 중', complete: '입력 완료', playing: '재생 중' };
  function render(message) {
    $('status').textContent = labels[state];
    $('start').disabled = state !== 'waiting';
    $('play').disabled = exporting || state !== 'complete' || player.bank.status !== 'ready';
    $('stop').disabled = state !== 'playing';
    $('stop-handwriting').disabled = state !== 'playing';
    $('add-handwriting').disabled = exporting || state !== 'complete';
    $('handwriting-panel').hidden = !handwritingOpen || !recorder.complete;
    $('play-together').disabled = exporting || state !== 'complete' || player.bank.status !== 'ready' || !handwriting.melody;
    $('finish-writing').disabled = exporting || state === 'playing' || handwriting.locked;
    $('reset').disabled = exporting;
    $('clear-writing').disabled = exporting;
    $('without-melody').disabled = exporting;
    $('melody-volume').disabled = exporting;
    $('handwriting-canvas').style.pointerEvents = exporting ? 'none' : '';
    $('export-panel').hidden = !recorder.complete;
    const canExport = recorder.complete && player.bank.status === 'ready' && !exporting;
    $('download-original').disabled = !canExport;
    $('download-repeated').disabled = !canExport;
    if (recorder.complete && player.bank.status === 'ready') {
      for (const [id, repeated] of [['original-estimate', false], ['repeated-estimate', true]]) {
        try {
          const plan = HelloWav.planExport({ relative: recorder.relative, melody: handwriting.melody, bank: player.bank, repeated });
          $(id).textContent = `${plan.hasMelody ? '리듬 + 손글씨 선율' : '리듬만'} · ${plan.count}회 · 파일 약 ${plan.durationSeconds.toFixed(1)}초${plan.outsideTarget ? ' · 완전한 단위를 유지해 15~20초 범위를 벗어납니다.' : ''}`;
        } catch (error) { $(id).textContent = error.message; }
      }
    } else {
      $('original-estimate').textContent = '음원 준비 후 예상 길이가 표시됩니다.';
      $('repeated-estimate').textContent = '';
    }
    zone.tabIndex = state === 'recording' ? 0 : -1;
    letters.forEach((letter, i) => {
      const bar = recorder.bars[Math.floor(i / 5)], position = i % 5;
      letter.classList.toggle('recorded', position < bar.times.length);
      letter.style.marginLeft = position === 0 ? '0px' : `${recorder.complete ? HelloRhythm.spacingFor(bar.gaps[position - 1]) : HelloRhythm.SPACING.minimumPx}px`;
    });
    $('bar-progress').textContent = recorder.complete ? '4 / 4 마디 기록 완료' : `${Math.min(recorder.completedBars + 1, 4)} / 4 마디 · 완료 ${recorder.completedBars}개`;
    $('layout-caption').textContent = recorder.complete
      ? '긴 입력 간격은 넓은 여백으로. 넘치는 글자는 좌우로 스크롤해 보세요.'
      : '입력 중에는 같은 간격으로, 완료 후에는 당신의 간격으로.';
    $('letters').setAttribute('aria-label', `${recorder.completedBars} / 4 마디 완료, ${recorder.current.times.length} / 5 글자 입력${recorder.current.times.length === 5 && !recorder.complete ? ', Enter 대기' : ''}`);
    $('results').hidden = !recorder.complete;
    if (message) $('feedback').textContent = message;
    if (recorder.complete) {
      const cell = text => { const td = document.createElement('td'); td.textContent = text; return td; };
      $('bar-metrics').replaceChildren(...recorder.bars.map((bar, index) => {
        const row = document.createElement('tr');
        row.append(cell(`${index + 1}마디`), ...[...bar.gaps, bar.loopGapMs, bar.durationMs].map(ms => cell(ms.toFixed(1))));
        return row;
      }));
      $('total').textContent = `${recorder.durationMs.toFixed(1)} ms`;
    }
    if (active && recorder.complete) onRecord(getRecord());
    if (!active) $('mode-a').querySelectorAll('button, input').forEach(element => { element.disabled = true; });
    else $('retry-sounds').disabled = false;
  }
  function reset(message, start = false) {
    recordId = HelloRecording.newId(); baseRecord = null;
    exportGeneration++;
    $('export-status').textContent = '현재 리듬과 완료한 손글씨 선율을 WAV로 저장합니다.';
    playbackRequest++;
    player.stop();
    visual.stop();
    handwriting.clear(); handwritingOpen = false;
    $('handwriting-status').textContent = 'hello나 다른 인사말을 자유롭게 써 주세요. 문자 인식은 하지 않습니다.';
    recorder.reset();
    composing = false;
    state = start ? 'recording' : 'waiting';
    if (start) recorder.start();
    render(message);
    $('word-scroll').scrollLeft = 0;
    if (start) zone.focus();
  }
  function cancelAttempt() {
    if (state === 'recording') reset('입력 영역의 포커스가 사라져 기록을 취소했습니다. ‘입력 시작’을 눌러 다시 입력해 주세요.');
  }
  $('start').addEventListener('click', () => reset('1마디: hello를 입력한 뒤 Enter를 눌러 주세요. 총 네 번 기록합니다.', true));
  $('reset').addEventListener('click', () => reset('네 마디를 새로 기록합니다. 1마디의 hello → Enter부터 입력해 주세요.', true));
  listen(zone, 'keydown', event => {
    if (state !== 'recording' || document.activeElement !== zone) return;
    // Tab retains native keyboard navigation; leaving the zone cancels this attempt.
    if (event.key === 'Tab') return;
    event.preventDefault();
    const result = recorder.keydown({ key: event.key, code: event.code, repeat: event.repeat,
      isComposing: composing || event.isComposing, keyCode: event.keyCode,
      ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey }, performance.now());
    if (result === 'complete') {
      state = 'complete';
      render('네 마디 기록을 마쳤습니다. 리듬만 듣거나 손글씨 선율을 추가해 보세요.');
    } else if (result === 'bar-complete') render(`${recorder.completedBars}마디 완료. ${recorder.completedBars + 1}마디의 hello → Enter를 입력해 주세요.`);
    else if (result === 'awaiting-enter') render(`${recorder.completedBars + 1}마디: 원하는 간격을 두고 Enter를 누르면 이 마디가 완료됩니다.`);
    else if (result === 'accepted') render(`${recorder.completedBars + 1}마디: 자연스러운 속도로 hello를 입력한 뒤 Enter를 눌러 주세요.`);
    else if (result === 'wrong') render(event.key === 'Backspace'
      ? 'Backspace 수정은 지원하지 않습니다. ‘다시 입력하기’를 눌러 주세요.'
      : recorder.current.times.length === 5 ? '이제 Enter를 눌러 이 마디를 완료해 주세요.' : `지금은 소문자 ‘${'hello'[recorder.current.times.length]}’를 입력해 주세요.`);
    else if (result === 'composition') render('조합 입력은 기록하지 않습니다. 영문 입력 모드로 전환해 주세요.');
  });
  listen(zone, 'keyup', event => recorder.release(event.code));
  listen(zone, 'compositionstart', () => { composing = true; });
  listen(zone, 'compositionend', () => { composing = false; });
  listen(zone, 'paste', event => {
    event.preventDefault();
    if (state === 'recording') render('붙여넣기는 기록하지 않습니다. 키보드로 직접 입력해 주세요.');
  });
  listen(zone, 'beforeinput', event => event.preventDefault());
  listen(zone, 'blur', cancelAttempt);
  const leave = () => { cancelAttempt(); handwriting.cancelActive(); if (state === 'playing') stopPlayback('화면을 벗어나 재생을 정지했습니다. 다시 들을 수 있습니다.'); };
  listen(window, 'blur', leave);
  listen(window, 'pagehide', leave);
  listen(document, 'visibilitychange', () => { if (document.hidden) leave(); });
  async function playRecording(withMelody = false) {
    if (!active || exporting || state !== 'complete' || player.bank.status !== 'ready') return;
    if (withMelody && !handwriting.melody) return;
    const request = ++playbackRequest;
    state = 'playing';
    render(withMelody ? '네 마디 리듬과 손글씨 선율을 함께 반복 재생합니다. ‘정지’를 누르면 멈춥니다.' : '네 마디 리듬을 반복 재생합니다. ‘정지’를 누르면 멈춥니다.');
    try {
      await player.play(recorder.relative, () => {
        if (request !== playbackRequest) return;
        state = 'complete';
        visual.stop();
        handwriting.stop();
        render('재생을 마쳤습니다. 같은 리듬을 다시 들을 수 있습니다.');
      }, { loop: true, loopGapMs: recorder.loopGapMs, melody: withMelody ? handwriting.melody : null });
      if (request === playbackRequest && player.playing) {
        visual.start(player);
        if (withMelody) handwriting.start(player);
      }
    } catch (error) {
      if (request !== playbackRequest) return;
      state = 'complete';
      visual.stop();
      handwriting.stop();
      render(`오디오를 시작하지 못했습니다: ${error.message} 오디오 장치와 브라우저 설정을 확인해 주세요.`);
    }
  }
  $('play').addEventListener('click', () => playRecording());
  $('play-together').addEventListener('click', () => playRecording(true));
  function stopPlayback(message) {
    playbackRequest++;
    player.stop();
    visual.stop();
    handwriting.stop();
    if (state === 'playing') state = 'complete';
    render(message);
  }
  $('stop').addEventListener('click', () => stopPlayback('재생을 정지했습니다. 기록한 리듬을 다시 들을 수 있습니다.'));
  $('stop-handwriting').addEventListener('click', () => stopPlayback('함께 듣기를 정지했습니다. 같은 기록을 다시 들을 수 있습니다.'));
  $('add-handwriting').addEventListener('click', () => {
    if (!handwriting.melody && !handwriting.recorder.strokes.length) $('handwriting-status').textContent = 'hello나 다른 인사말을 자유롭게 써 주세요. 문자 인식은 하지 않습니다.';
    handwritingOpen = true; render(); handwriting.draw();
  });
  $('finish-writing').addEventListener('click', () => {
    try {
      const melody = handwriting.finish(recorder.relative.at(-1));
      $('handwriting-status').textContent = `${melody.notes.length}개 음 · ${melody.handwritingMs.toFixed(0)}ms 필기 → ${melody.targetMs.toFixed(1)}ms 선율. ${melody.short ? '재생 구간이 짧습니다. 더 천천히 타이핑하면 선율을 자세히 들을 수 있습니다.' : '‘함께 듣기’를 눌러 보세요.'}`;
    } catch (error) { $('handwriting-status').textContent = error.message; }
    render();
  });
  $('clear-writing').addEventListener('click', () => {
    stopPlayback(); handwriting.clear();
    $('handwriting-status').textContent = '손글씨를 지웠습니다. 드래그로 다시 써 주세요. 리듬만 듣기도 가능합니다.';
    render();
  });
  $('without-melody').addEventListener('click', () => {
    stopPlayback(); handwriting.clear(); handwritingOpen = false; render();
  });
  $('melody-volume').addEventListener('input', event => {
    player.setMelodyVolume(Number(event.target.value) / 100 * .15);
    $('melody-volume-value').textContent = `${event.target.value}%`;
    render();
  });
  async function exportWav(repeated) {
    if (!active || exporting || !recorder.complete) return;
    if (player.bank.status !== 'ready') { $('export-status').textContent = '음원 준비가 끝난 뒤 다시 다운로드해 주세요.'; return; }
    exporting = true;
    const generation = ++exportGeneration;
    // Snapshot the chosen content and volume; stop live speakers before rendering.
    const options = { relative: [...recorder.relative], bank: player.bank, repeated,
      melody: handwriting.melody ? { notes: handwriting.melody.notes.map(note => ({ ...note })) } : null,
      melodyVolume: player.melodyVolume };
    stopPlayback();
    $('export-status').textContent = 'WAV 렌더링 중… 스피커로 재생하지 않습니다.';
    try {
      const result = await HelloWav.renderExport(options);
      if (generation !== exportGeneration) return;
      const filename = repeated ? 'greeting-repeated.wav' : 'greeting-original.wav';
      HelloWav.download(result.wav, filename);
      $('export-status').textContent = `${filename} 다운로드 준비 완료 · ${result.plan.durationSeconds.toFixed(2)}초 · ${result.plan.count}회${result.gain < 1 ? ` · 클리핑 방지: 전체 ${(-20 * Math.log10(result.gain)).toFixed(1)}dB 감쇠` : ' · 음량 보정 없음'}. 브라우저의 다운로드 목록을 확인해 주세요.`;
    } catch (error) {
      if (generation === exportGeneration) $('export-status').textContent = `WAV 내보내기 실패: ${error.message} 다시 시도해 주세요.`;
    } finally { exporting = false; render(); }
  }
  $('download-original').addEventListener('click', () => exportWav(false));
  $('download-repeated').addEventListener('click', () => exportWav(true));
  async function loadSounds() {
    $('retry-sounds').hidden = true;
    $('sound-status').textContent = '음원 준비 중…';
    const pending = player.bank.load();
    render();
    try {
      await pending;
      $('sound-status').textContent = '음원 준비 완료 · 로컬 TR-808';
    } catch (error) {
      $('sound-status').textContent = `음원 로딩 실패: ${error.message} 프로젝트 파일이 모두 있는지 확인한 뒤 다시 불러와 주세요.`;
      $('retry-sounds').hidden = false;
    }
    render();
  }
  $('retry-sounds').addEventListener('click', loadSounds);
  // Font fallback never blocks recording or sound playback.
  document.fonts.load('500 76px "Bodoni Moda"', 'hello').then(faces => {
    $('font-status').textContent = faces.length ? 'Bodoni Moda' : '대체 세리프 폰트 사용 중';
  }).catch(() => { $('font-status').textContent = '폰트 로딩 실패 · 대체 세리프 폰트 사용 중'; });
  function getRecord() {
    const result = HelloOrchestraData.capture(recorder, recordId, handwriting, player.melodyVolume);
    if (result && baseRecord) {
      result.source = baseRecord.source;
      if (!baseRecord.raw) delete result.raw;
    }
    return result;
  }
  function applyRecord(prepared) {
    // prepare() validates and constructs everything before this changes live state.
    exportGeneration++; stopPlayback(); handwriting.clear();
    recorder = prepared.recorder; recordId = prepared.record.id; baseRecord = prepared.record;
    composing = false; state = 'complete';
    handwriting.recorder.strokes = prepared.strokes;
    handwriting.melody = prepared.melody; handwriting.locked = !!prepared.melody;
    handwritingOpen = !!prepared.melody;
    player.setMelodyVolume(prepared.volume);
    $('melody-volume').value = Math.round(prepared.volume / .15 * 100);
    $('melody-volume-value').textContent = `${$('melody-volume').value}%`;
    $('handwriting-status').textContent = prepared.melody ? 'JSON의 원본 필기에서 선율을 복원했습니다. 함께 듣기를 사용할 수 있습니다.' : '원하면 손글씨 선율을 추가해 주세요.';
    render('JSON에서 네 마디 기록을 불러왔습니다.'); handwriting.draw();
  }
  function enter() {
    if (active) return;
    active = true;
    bindings.forEach(([target, type, handler]) => target.addEventListener(type, handler));
    handwriting.setEnabled(true); render();
    if (player.bank.status === 'idle') loadSounds();
    handwriting.draw();
  }
  function leaveMode() {
    if (!active) return;
    active = false; exportGeneration++;
    bindings.forEach(([target, type, handler]) => target.removeEventListener(type, handler));
    handwriting.setEnabled(false); stopPlayback();
    if (state === 'recording') reset('모드를 전환해 진행 중인 입력을 취소했습니다. 다시 입력할 수 있습니다.');
    recorder.held.clear(); composing = false;
  }
  handwriting.setEnabled(false); render();
  globalThis.HelloOrchestra = { enter, leave: leaveMode, getRecord, applyRecord,
    prepareImport: HelloOrchestraData.prepare, subscribe(callback) { onRecord = callback; },
    diagnostics: () => ({ active, state, voices: player.voices.size, events: player.events.length,
      loopTimer: player.loopTimer, letterFrame: visual.frame, handwritingFrame: handwriting.frame,
      inputBindings: active ? bindings.length : 0, canvasInputEnabled: handwriting.inputEnabled, exporting }) };
})();
