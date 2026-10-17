(async () => {
  const report = document.getElementById('report');
  const lines = [];
  let failed = 0;
  function check(name, fn) {
    try { fn(); lines.push(`PASS ${name}`); }
    catch (error) { failed++; lines.push(`FAIL ${name}: ${error.message}`); }
    report.textContent = `${lines.join('\n')}\n\n검증 중…`;
  }
  function assert(value, message = 'assertion failed') { if (!value) throw new Error(message); }
  const same = (a, b) => assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  const key = (letter, overrides = {}) => ({ key: letter, code: `Key${letter.toUpperCase()}`, ...overrides });
  const { BarRecorder: Recorder, RhythmPlayer, SampleBank, PlaybackVisual, spacingFor, activeIndices } = HelloRhythm;
  check('첫 글자까지의 대기 제외 · 상대 시각 · 간격 · 전체 시간', () => {
    const r = new Recorder(); r.start();
    [...'hello'].forEach((letter, i) => { r.keydown(key(letter), 9000 + [0, 180, 420, 570, 900][i]); r.release(key(letter).code); });
    same(r.relative, [0, 180, 420, 570, 900]); same(r.gaps, [180, 240, 150, 330]);
    assert(r.relative[4] === 900 && r.active && !r.complete);
    assert(r.keydown(key('Enter'), 10200) === 'complete');
    assert(r.loopGapMs === 300 && r.durationMs === 1200 && !r.active);
    same(r.relative, [0, 180, 420, 570, 900]);
  });
  check('Enter: 조기 입력·반복·조합 무시 · o 뒤 Enter만 완료 · 초기화', () => {
    const r = new Recorder(); r.start();
    assert(r.keydown(key('Enter'), 1) === 'wrong'); r.release('KeyENTER');
    [...'hello'].forEach((letter, i) => { r.keydown(key(letter), 100 + i * 100); r.release(key(letter).code); });
    assert(r.active && r.loopGapMs === null);
    assert(r.keydown(key('Enter', { repeat: true }), 700) === 'repeat');
    assert(r.keydown(key('Enter', { isComposing: true }), 800) === 'composition'); r.release('KeyENTER');
    assert(!r.complete && r.times.length === 5);
    r.keydown(key('Enter'), 900); assert(r.complete && r.loopGapMs === 400 && r.durationMs === 800);
    r.reset(); assert(!r.complete && r.enterTime === null && r.loopGapMs === null);
  });
  check('길게 누른 l 및 repeat 플래그 없는 중복도 무시 · keyup 후 두 번째 l 허용', () => {
    const r = new Recorder(); r.start();
    for (const [i, letter] of [...'he'].entries()) { r.keydown(key(letter), i); r.release(key(letter).code); }
    r.keydown(key('l'), 10);
    assert(r.keydown(key('l', { repeat: true }), 20) === 'repeat');
    assert(r.keydown(key('l'), 30) === 'repeat'); assert(r.times.length === 3);
    r.release('KeyL'); r.keydown(key('l'), 40); same(r.times, [0, 1, 10, 40]);
  });
  check('오타 · 대문자 · Backspace · 조합 · 단축키는 기존 기록을 바꾸지 않음', () => {
    const r = new Recorder(); r.start(); r.keydown(key('h'), 100); r.release('KeyH');
    for (const event of [key('x'), key('E'), key('Backspace'), key('e', { isComposing: true }), key('e', { keyCode: 229 }), key('e', { ctrlKey: true })]) {
      r.keydown(event, 200); r.release(event.code);
    }
    same(r.times, [100]); r.keydown(key('e'), 400); same(r.relative, [0, 300]);
    r.reset(); assert(!r.active && r.times.length === 0 && r.held.size === 0);
  });
  check('자간: 공통 선형 계수 · 긴 간격은 넓게 · 같은 간격은 같게 · 정규화 없음', () => {
    same([180, 240, 150, 330].map(spacingFor), [33.599999999999994, 40.8, 30, 51.6]);
    assert(spacingFor(1000) > spacingFor(500));
    same([200, 200, 200, 200].map(spacingFor), [36, 36, 36, 36]);
    assert(spacingFor(10000) === 1212);
  });
  const fourRecord = new HelloRhythm.Recorder(); fourRecord.start();
  const patterns = [[0,180,420,570,900,1200], [0,100,200,300,400,600], [0,50,100,150,200,300], [0,200,400,600,800,1100]];
  const inputBar = (recorder, pattern, origin) => {
    let result;
    [...'hello', 'Enter'].forEach((letter, i) => {
      result = recorder.keydown(key(letter), origin + pattern[i]); recorder.release(key(letter).code);
    });
    return result;
  };
  for (let i = 0; i < 3; i++) {
    const result = inputBar(fourRecord, patterns[i], 1000 + i * 10000);
    check(`${i + 1}마디 Enter 후 다음 마디로 이동 · 전체 완료 금지`, () => {
      assert(result === 'bar-complete' && fourRecord.completedBars === i + 1 && fourRecord.active && !fourRecord.complete);
      assert(fourRecord.current.times.length === 0 && fourRecord.durationMs === null);
    });
  }
  const fourthResult = inputBar(fourRecord, patterns[3], 40000);
  check('네 번째 Enter만 전체 완료 · 20글자와 네 마디 끝 간격 저장', () => {
    assert(fourthResult === 'complete' && fourRecord.complete && !fourRecord.active && fourRecord.times.length === 20);
    same(fourRecord.bars.map(bar => bar.loopGapMs), [300,200,100,300]);
    assert(fourRecord.durationMs === 3200 && fourRecord.loopGapMs === 300);
  });
  check('네 마디 연결: 준비 시간 제외 · 각 h→Enter 길이를 누적 · 보정 없음', () => {
    same(fourRecord.relative, [0,180,420,570,900,1200,1300,1400,1500,1600,1800,1850,1900,1950,2000,2100,2300,2500,2700,2900]);
    assert(fourRecord.keydown(key('h'), 50000) === 'inactive');
  });
  check('다음 마디 조기 Enter와 자동 반복은 마디를 건너뛰지 않음 · 초기화는 전부 삭제', () => {
    const r = new HelloRhythm.Recorder(); r.start(); inputBar(r, patterns[0], 0);
    assert(r.keydown(key('Enter', { repeat: true }), 1300) === 'repeat');
    assert(r.keydown(key('Enter'), 1400) === 'wrong'); r.release(key('Enter').code);
    assert(r.completedBars === 1 && r.current.times.length === 0);
    r.reset(); assert(r.completedBars === 0 && r.times.length === 0 && r.held.size === 0 && !r.active);
  });
  function fakeAudio(state = 'running') {
    const sources = [], gains = [], oscillators = [];
    const context = { state, currentTime: 10, destination: {},
      createBufferSource() {
        const source = { connect() {}, disconnect() { this.disconnected = true; },
          start(at) { this.startAt = at; }, stop(at) { (this.stops ||= []).push(at); } };
        sources.push(source); return source;
      },
      createOscillator() {
        const source = this.createBufferSource();
        source.frequency = { setValueAtTime(value, at) { source.frequencyValue = value; source.frequencyAt = at; } };
        oscillators.push(source); return source;
      },
      createGain() {
        const gain = { gain: { setValueAtTime(value) { gain.level = value; }, linearRampToValueAtTime() {}, setTargetAtTime(value) { gain.level = value; } },
          connect() {}, disconnect() { this.disconnected = true; } };
        gains.push(gain); return gain;
      }
    };
    return { context, sources, gains, oscillators };
  }
  const fakeBank = () => ({ status: 'ready', buffers: new Map([...'helo'].map(letter => [letter, { letter }])) });
  const audio = fakeAudio(), bank = fakeBank();
  const p = new RhythmPlayer(() => audio.context, bank); let completed = 0;
  await p.play([0, 180, 420, 570, 900], () => completed++);
  check('h/e/l/l/o 매핑 · 두 l은 동일 버퍼와 서로 다른 소스', () => {
    same(audio.sources.map(s => s.buffer.letter), [...'hello']);
    assert(audio.sources[2] !== audio.sources[3] && audio.sources[2].buffer === audio.sources[3].buffer);
  });
  check('오디오 시간축: 원래 간격으로 다섯 음 한 번에 예약 · 자연스러운 꼬리 유지', () => {
    same(audio.sources.map(s => Math.round((s.startAt - 10.06) * 1000)), [0, 180, 420, 570, 900]);
    assert(audio.sources.every(s => !s.stops));
    same(audio.gains.map(g => g.level), [.22, .18, .12, .12, .20]);
  });
  check('시각 시간축: 각 l을 별개 인덱스로 강조 · 시작 전 강조 없음', () => {
    same(activeIndices(p.events, 10), []);
    same(activeIndices(p.events, 10.49), [2]);
    same(activeIndices(p.events, 10.64), [3]);
    same(activeIndices(p.events, 12), []);
  });
  p.stop();
  check('정지: 현재·미래 음 모두 종료 · 연결 해제 · 타임라인 취소', () => {
    assert(audio.sources.every(s => s.stops.at(-1) === 10 && s.disconnected && s.onended === null));
    assert(audio.gains.every(g => g.disconnected));
    assert(p.voices.size === 0 && p.events.length === 0 && !p.playing && completed === 0);
  });
  await p.play([0, 1, 2, 3, 4], () => completed++);
  check('빠른 입력에서도 원래 시작 간격 보존 · 기존 소리 강제 종료 없음', () => {
    same(audio.sources.slice(-5).map(s => Math.round((s.startAt - 10.06) * 1000)), [0, 1, 2, 3, 4]);
    assert(audio.sources.slice(-5).every(s => !s.stops));
  });
  const latest = audio.sources.slice(-5);
  latest[4].onended();
  check('마지막 글자 소리가 먼저 끝나도 나머지 소리의 종료를 기다림', () => assert(p.playing));
  latest.slice(0, 4).forEach(s => s.onended());
  check('전체 소리 종료 후 다시 재생 가능', () => assert(!p.playing && completed === 1 && p.voices.size === 0));
  const suspended = fakeAudio('suspended'); let resume;
  suspended.context.resume = () => new Promise(resolve => { resume = () => { suspended.context.state = 'running'; resolve(); }; });
  const pendingPlayer = new RhythmPlayer(() => suspended.context, fakeBank());
  const pending = pendingPlayer.play([0, 10, 20, 30, 40], () => {});
  pendingPlayer.stop(); resume(); await pending;
  check('resume 대기 중 취소하면 늦은 예약 없음', () => assert(suspended.sources.length === 0));

  const loopAudio = fakeAudio(); let queueLoop, cleared = 0, loopCompleted = 0;
  const loopTimers = { setInterval(fn) { queueLoop = fn; return 7; }, clearInterval(id) { assert(id === 7); cleared++; } };
  const looping = new RhythmPlayer(() => loopAudio.context, fakeBank(), loopTimers);
  await looping.play([0, 180, 420, 570, 900], () => loopCompleted++, { loop: true, loopGapMs: 300 });
  loopAudio.sources.slice().forEach(source => source.onended());
  check('루프: 한 패턴이 끝나도 재생 상태와 중복 재생 잠금 유지', () => {
    assert(looping.playing && looping.looping && loopCompleted === 0);
  });
  loopAudio.context.currentTime = 11.1; queueLoop();
  check('루프: 다음 패턴의 원래 간격 보존 · o→h는 기록한 o→Enter 300ms', () => {
    same(loopAudio.sources.slice(-5).map(source => Math.round((source.startAt - 11.26) * 1000)), [0, 180, 420, 570, 900]);
    assert(Math.abs(loopAudio.sources[5].startAt - loopAudio.sources[4].startAt - .3) < 1e-8);
  });
  loopAudio.context.currentTime = 12.32; queueLoop();
  check('루프: 예약 시각은 이전 타이머 실행 시각에 영향받지 않음', () => {
    assert(Math.abs(loopAudio.sources[10].startAt - 12.46) < 1e-8);
    same(activeIndices(looping.events, 12.47), [0]);
  });
  const countBeforeStop = loopAudio.sources.length;
  looping.stop(); queueLoop();
  check('루프 정지: 타이머·모든 소스·타임라인 취소 · 늦은 콜백 무시', () => {
    assert(cleared === 1 && loopAudio.sources.length === countBeforeStop && !looping.playing);
    assert(looping.events.length === 0 && looping.voices.size === 0 && looping.loopTimer === null);
    assert(loopAudio.sources.slice(-10).every(source => source.disconnected && source.stops.at(-1) === 12.32));
  });
  const zeroGapAudio = fakeAudio(); let zeroQueue;
  const zeroGapPlayer = new RhythmPlayer(() => zeroGapAudio.context, fakeBank(),
    { setInterval(fn) { zeroQueue = fn; return 1; }, clearInterval() {} });
  await zeroGapPlayer.play([0, 180, 420, 570, 900], () => {}, { loop: true, loopGapMs: 0 });
  zeroGapAudio.context.currentTime = 10.8; zeroQueue();
  check('루프: 기록한 끝 간격 0ms도 고정 간격 보정 없이 유지', () => {
    assert(zeroGapAudio.sources[5].startAt === zeroGapAudio.sources[4].startAt);
  });
  zeroGapPlayer.stop();
  let missingEnterError;
  try { await zeroGapPlayer.play([0, 180, 420, 570, 900], () => {}, { loop: true }); }
  catch (error) { missingEnterError = error; }
  check('Enter 간격 없는 루프 요청은 기본 0.5초를 사용하지 않고 거부', () => {
    assert(missingEnterError && !zeroGapPlayer.playing);
  });

  let tick, cancelCount = 0;
  const elements = [...'hello'].map(() => document.createElement('span'));
  const visual = new PlaybackVisual(elements, fn => { tick = fn; return 1; }, () => cancelCount++);
  const clock = { playing: true, context: { currentTime: 2 }, events: [{ index: 2, at: 2 }] };
  visual.start(clock);
  check('RAF가 오디오 시각을 읽어 해당 글자만 강조', () => {
    same(elements.map(e => e.classList.contains('sounding')), [false, false, true, false, false]);
  });
  visual.stop(); tick();
  check('시각화 정지: RAF 취소 · 잔여 콜백 방어 · 강조 제거', () => {
    assert(cancelCount > 0 && elements.every(e => !e.classList.contains('sounding')));
  });

  // Real local downloads and real browser WAV decoder, with no audio output.
  const realBank = new SampleBank(); await realBank.load();
  for (const instrument of Object.values(HelloRhythm.INSTRUMENTS)) {
    const original = new Uint8Array(await (await fetch(instrument.file)).arrayBuffer());
    const embedded = new Uint8Array(HelloRhythm.embeddedBytes(instrument.file));
    check(`직접 열기용 내장 WAV가 원본과 바이트 단위로 일치: ${instrument.name}`, () => {
      assert(original.length === embedded.length && original.every((value, i) => value === embedded[i]));
    });
  }
  const embeddedBank = new SampleBank(async file => ({ ok: true, arrayBuffer: async () => HelloRhythm.embeddedBytes(file) }));
  await embeddedBank.load();
  check('내장 WAV 네 개 실제 디코딩 성공 · 원본과 동일 길이', () => {
    assert(embeddedBank.status === 'ready');
    for (const [letter, buffer] of embeddedBank.buffers) assert(buffer.duration === realBank.buffers.get(letter).duration);
  });
  const first = HelloRhythm.embeddedBytes('assets/drums/kick.wav');
  new Uint8Array(first).fill(0);
  check('내장 데이터는 로딩마다 새 버퍼를 제공해 재시도 안전', () => {
    assert(new Uint8Array(HelloRhythm.embeddedBytes('assets/drums/kick.wav'))[0] === 82);
  });
  check('로컬 WAV 4개 실제 fetch/decode · 피크 정규화 · 서로 다른 버퍼', () => {
    assert(realBank.status === 'ready' && realBank.buffers.size === 4);
    for (const buffer of realBank.buffers.values()) {
      assert(buffer.duration > 0 && buffer.duration < 1.1);
      let peak = 0; for (const value of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(value));
      assert(Math.abs(peak - 1) < .00001);
    }
  });
  // Render actual AudioBufferSourceNodes offline and compare every sample with
  // the expected unquantized, overlapping sum. No mock audio nodes in this check.
  const offline = new OfflineAudioContext(1, 44100 * 2, 44100);
  const offlineAdapter = context => ({ state: 'running', currentTime: 0,
    destination: context.destination, createBufferSource: () => context.createBufferSource(), createGain: () => context.createGain() });
  const renderedPlayer = new RhythmPlayer(() => offlineAdapter(offline), realBank);
  await renderedPlayer.play([0, 180, 420, 570, 900], () => {});
  const scheduled = [...renderedPlayer.events];
  const rendered = (await offline.startRendering()).getChannelData(0);
  check('실제 Web Audio 오프라인 렌더: 원래 시작 시각·악기 순서·겹침 보존', () => {
    const expected = new Float32Array(rendered.length);
    for (const event of scheduled) {
      const samples = realBank.buffers.get(event.letter).getChannelData(0);
      const offset = Math.round(event.at * 44100);
      for (let i = 0; i < samples.length && i + offset < expected.length; i++) {
        expected[i + offset] += samples[i] * HelloRhythm.INSTRUMENTS[event.letter].gain;
      }
    }
    let maxError = 0, peak = 0;
    for (let i = 0; i < rendered.length; i++) {
      maxError = Math.max(maxError, Math.abs(rendered[i] - expected[i]));
      peak = Math.max(peak, Math.abs(rendered[i]));
    }
    assert(maxError < .001 && peak > .1 && peak < 1, `waveform error ${maxError}, peak ${peak}`);
  });
  const stoppedOffline = new OfflineAudioContext(1, 44100 * 2, 44100);
  const stoppedPlayer = new RhythmPlayer(() => offlineAdapter(stoppedOffline), realBank);
  await stoppedPlayer.play([0, 180, 420, 570, 900], () => {}); stoppedPlayer.stop();
  const silent = (await stoppedOffline.startRendering()).getChannelData(0);
  check('실제 Web Audio 오프라인 렌더: 정지한 미래 예약 음은 완전한 무음', () => assert(silent.every(sample => sample === 0)));
  const loopOffline = new OfflineAudioContext(1, 44100 * 8, 44100);
  const loopContext = offlineAdapter(loopOffline); let offlineQueue, loopDone = 0;
  const actualLoop = new RhythmPlayer(() => loopContext, realBank,
    { setInterval(fn) { offlineQueue = fn; return 1; }, clearInterval() {} });
  await actualLoop.play(fourRecord.relative, () => loopDone++, { loop: true, loopGapMs: fourRecord.loopGapMs });
  loopContext.currentTime = 3.1; offlineQueue();
  const loopEvents = [...actualLoop.events];
  // The queue prunes completed highlights, so reconstruct both audio cycles.
  const expectedLoopEvents = [0.06, 3.26].flatMap(start => fourRecord.relative.map((offset, i) => ({ at: start + offset / 1000, letter: 'hello'[i % 5] })));
  const loopPcm = (await loopOffline.startRendering()).getChannelData(0);
  check('실제 네 마디×두 루프 렌더: 40타격의 악기·간격·네 경계·겹침 보존', () => {
    const expected = new Float32Array(loopPcm.length);
    for (const event of expectedLoopEvents) {
      const samples = realBank.buffers.get(event.letter).getChannelData(0), offset = Math.round(event.at * 44100);
      for (let i = 0; i < samples.length; i++) expected[offset + i] += samples[i] * HelloRhythm.INSTRUMENTS[event.letter].gain;
    }
    let error = 0, squaredError = 0;
    for (let i = 0; i < expected.length; i++) {
      const difference = expected[i] - loopPcm[i];
      error = Math.max(error, Math.abs(difference)); squaredError += difference * difference;
    }
    // The browser interpolates sub-sample starts; the direct PCM sum rounds to
    // whole frames. Bound both transient error and RMS across the full render.
    const rms = Math.sqrt(squaredError / expected.length);
    assert(error < .003 && rms < .0001 && loopEvents.length === 20 && actualLoop.playing && loopDone === 0,
      `error=${error}, rms=${rms}, events=${loopEvents.length}, period=${actualLoop.loopPeriod}, playing=${actualLoop.playing}, done=${loopDone}`);
  });
  actualLoop.stop();
  const failing = new SampleBank(async () => ({ ok: false, status: 404 })); let loadError;
  try { await failing.load(); } catch (error) { loadError = error; }
  check('음원 로딩 실패 시 원인과 파일 표시 · 준비 상태 차단', () => {
    assert(failing.status === 'error' && failing.buffers.size === 0 && loadError.message.includes('404') && loadError.message.includes('.wav'));
  });
  failing.fetcher = (...args) => fetch(...args); await failing.load();
  check('음원 로딩 실패 후 재시도 성공', () => assert(failing.status === 'ready'));
  const invalid = new SampleBank(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  try { await invalid.load(); } catch { /* expected decode failure */ }
  check('손상된 음원도 로딩 실패로 처리', () => assert(invalid.status === 'error'));
  const blocked = new RhythmPlayer(() => { throw new Error('must not create context'); }, { status: 'loading' });
  let blockedError; try { await blocked.play([0], () => {}); } catch (error) { blockedError = error; }
  check('로딩 중 재생은 소스 생성 없이 거부', () => assert(blockedError && !blocked.playing));

  const frame = document.getElementById('app');
  if (frame.contentDocument.readyState !== 'complete') await new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  const w = frame.contentWindow, d = frame.contentDocument;
  const $ = id => d.getElementById(id);
  $('choose-a').click();
  async function until(condition) {
    for (let i = 0; i < 500; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('UI timeout');
  }
  await until(() => $('sound-status').textContent.includes('완료'));
  await d.fonts.ready;
  const dispatch = (type, letter, overrides = {}) => $('input-zone').dispatchEvent(new w.KeyboardEvent(type, { bubbles: true, cancelable: true, ...key(letter), ...overrides }));
  const type = letter => { dispatch('keydown', letter); dispatch('keyup', letter); };
  const start = () => { frame.focus(); $('start').click(); };
  const typedLetters = [...$('letters').querySelectorAll('.letter')];
  const defaults = Array.from({ length: 20 }, (_, i) => i % 5 === 0 ? '0px' : '12px');
  check('UI: 네 줄·20글자 · 시작 포커스 · 준비 상태', () => {
    assert(typedLetters.length === 20 && $('font-status').textContent === 'Bodoni Moda');
    start(); assert(d.activeElement === $('input-zone') && $('results').hidden);
  });
  check('UI: IME·붙여넣기·영역 밖 입력 무시', () => {
    $('input-zone').dispatchEvent(new w.Event('paste', { cancelable: true }));
    $('input-zone').dispatchEvent(new w.Event('compositionstart')); type('h');
    $('input-zone').dispatchEvent(new w.Event('compositionend'));
    d.body.dispatchEvent(new w.KeyboardEvent('keydown', key('h')));
    assert(!typedLetters[0].classList.contains('recorded'));
  });
  let now = 1000;
  Object.defineProperty(w.performance, 'now', { configurable: true, value: () => now++ });
  const uiPattern = [0,180,420,570,10000,10420];
  for (let bar = 0; bar < 4; bar++) {
    const origin = 1000 + bar * 20000;
    [...'hello'].forEach((letter, i) => { now = origin + uiPattern[i]; type(letter); });
    check(`UI: ${bar + 1}마디 o 뒤 Enter 전 결과·재생 차단 · 20글자 기본 자간`, () => {
      assert($('play').disabled && $('results').hidden && $('status').textContent === '입력 중');
      same(typedLetters.map(el => el.style.marginLeft), defaults);
    });
    now = origin + uiPattern[5]; type('Enter');
    if (bar < 3) check(`UI: ${bar + 1}마디 Enter 후 계속 입력 · 자동 포커스 유지`, () => {
      assert($('play').disabled && $('results').hidden && d.activeElement === $('input-zone'));
      assert($('bar-progress').textContent.includes(`완료 ${bar + 1}개`));
    });
  }
  check('UI: 네 번째 Enter 후만 완료 · 네 마디 수치·각 줄 개별 자간·긴 결과 스크롤', () => {
    assert($('status').textContent === '입력 완료' && !$('play').disabled && !$('results').hidden);
    assert($('bar-metrics').children.length === 4 && $('total').textContent === '41680.0 ms');
    for (let bar = 0; bar < 4; bar++) same(typedLetters.slice(bar * 5, bar * 5 + 5).map(el => Math.round(parseFloat(el.style.marginLeft))), [0,34,41,30,1144]);
    assert($('word-scroll').scrollWidth > $('word-scroll').clientWidth);
  });
  const uiAudio = fakeAudio(); w.AudioContext = function () { return uiAudio.context; };
  $('play').click(); await Promise.resolve(); await Promise.resolve();
  check('UI: 20타격·네 번의 악기 순서 · 중복 재생 차단 · 강조 시 위치 불변', () => {
    assert(uiAudio.sources.length === 20 && $('play').disabled && !$('stop').disabled);
    $('play').click(); assert(uiAudio.sources.length === 20);
    const before = typedLetters.map(el => el.getBoundingClientRect().width);
    typedLetters[17].classList.add('sounding'); same(typedLetters.map(el => el.getBoundingClientRect().width), before);
    assert(uiAudio.sources[5].startAt - uiAudio.sources[4].startAt > .4199);
  });
  $('stop').click();
  check('UI: 정지 후 20소스와 강조 취소 · 기록 보존', () => {
    assert(uiAudio.sources.every(source => source.disconnected && source.stops.at(-1) === 10));
    assert(typedLetters.every(el => !el.classList.contains('sounding')) && !$('play').disabled);
  });
  $('play').click(); await Promise.resolve(); $('reset').click();
  check('UI: 재생 중 재입력은 네 마디 기록·예약·강조 전부 초기화', () => {
    assert(uiAudio.sources.length === 40 && uiAudio.sources.every(source => source.disconnected));
    assert($('results').hidden && $('bar-progress').textContent.includes('완료 0개'));
    same(typedLetters.map(el => el.style.marginLeft), defaults);
  });
  for (let bar = 0; bar < 4; bar++) { [...'hello'].forEach(type); type('Enter'); }
  $('play').click(); await Promise.resolve();
  uiAudio.sources.slice(-20).forEach(source => source.onended());
  check('UI: 네 마디 전체가 끝나도 반복 재생 유지 · 재재생 · 포커스 이탈 취소', () => {
    assert($('status').textContent === '재생 중' && $('play').disabled);
    $('stop').click(); $('play').click(); $('stop').click(); $('reset').click(); type('h');
    w.dispatchEvent(new w.Event('blur')); assert($('status').textContent === '대기' && $('results').hidden);
  });
  // A second real app instance: inject only resource failures, then recover fetch.
  const markup = await (await fetch('index.html')).text();
  const css = await (await fetch('styles.css')).text();
  const failureFrame = document.createElement('iframe');
  const injected = `<base href="${location.href}"><script>window.originalFetch=window.fetch;window.fetch=async()=>({ok:false,status:503});<\/script>`;
  failureFrame.srcdoc = markup.replace('<head>', `<head>${injected}`).replace('<link rel="stylesheet" href="styles.css">', `<style>${css.replace('assets/fonts/BodoniModa.ttf', 'assets/fonts/missing.ttf')}</style>`);
  document.body.append(failureFrame);
  await new Promise(resolve => failureFrame.addEventListener('load', resolve, { once: true }));
  const fw = failureFrame.contentWindow, fd = failureFrame.contentDocument;
  fd.getElementById('choose-a').click();
  await until(() => !fd.getElementById('retry-sounds').hidden && fd.getElementById('font-status').textContent.includes('실패'));
  check('UI: 실제 음원 실패 안내·재시도 표시 · 폰트 404 시 대체 세리프', () => {
    assert(fd.getElementById('sound-status').textContent.includes('503'));
    assert(fd.getElementById('play').disabled);
    assert(fw.getComputedStyle(fd.querySelector('#letters .letter')).fontFamily.includes('Georgia'));
  });
  fw.fetch = fw.originalFetch; fd.getElementById('retry-sounds').click();
  await until(() => fd.getElementById('sound-status').textContent.includes('완료'));
  check('UI: 로딩 재시도 성공 후 오류와 재시도 버튼 해제', () => assert(fd.getElementById('retry-sounds').hidden));
  failureFrame.remove();
  await runHandwritingTests({ check, assert, same, realBank, fakeAudio, frame, uiAudio, type });
  await runWavTests({ check, assert, same, realBank, fourRecord, fakeAudio, frame, uiAudio, type });
  await runRecordingTests({ check, assert, same, fourRecord });
  await runModeTests({ check, assert, same, fourRecord, frame, uiAudio, type });
  report.textContent = `${lines.join('\n')}\n\n${lines.length - failed}/${lines.length} passed`;
  report.dataset.result = failed ? 'fail' : 'pass';
})().catch(error => {
  document.getElementById('report').textContent += `\nERROR ${error.stack}`;
  document.getElementById('report').dataset.result = 'fail';
});
