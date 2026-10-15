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
  const { Recorder, RhythmPlayer, SampleBank, PlaybackVisual, spacingFor, activeIndices } = HelloRhythm;
  check('첫 글자까지의 대기 제외 · 상대 시각 · 간격 · 전체 시간', () => {
    const r = new Recorder(); r.start();
    [...'hello'].forEach((letter, i) => { r.keydown(key(letter), 9000 + [0, 180, 420, 570, 900][i]); r.release(key(letter).code); });
    same(r.relative, [0, 180, 420, 570, 900]); same(r.gaps, [180, 240, 150, 330]);
    assert(r.relative[4] === 900 && !r.active);
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
  function fakeAudio(state = 'running') {
    const sources = [], gains = [];
    const context = { state, currentTime: 10, destination: {},
      createBufferSource() {
        const source = { connect() {}, disconnect() { this.disconnected = true; },
          start(at) { this.startAt = at; }, stop(at) { (this.stops ||= []).push(at); } };
        sources.push(source); return source;
      },
      createGain() {
        const gain = { gain: { setValueAtTime(value) { gain.level = value; } },
          connect() {}, disconnect() { this.disconnected = true; } };
        gains.push(gain); return gain;
      }
    };
    return { context, sources, gains };
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
  async function until(condition) {
    for (let i = 0; i < 500; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('UI timeout');
  }
  await until(() => $('sound-status').textContent.includes('완료'));
  await d.fonts.ready;
  const dispatch = (type, letter, overrides = {}) => $('input-zone').dispatchEvent(new w.KeyboardEvent(type, { bubbles: true, cancelable: true, ...key(letter), ...overrides }));
  const type = letter => { dispatch('keydown', letter); dispatch('keyup', letter); };
  const start = () => { frame.focus(); $('start').click(); };
  const typedLetters = [...$('letters').children];
  check('UI: 실제 로컬 폰트 준비 · 시작 시 자동 포커스 · 수치 숨김', () => {
    assert($('font-status').textContent === 'Bodoni Moda');
    assert($('results').hidden); start(); assert(d.activeElement === $('input-zone'));
  });
  check('UI: 붙여넣기 · IME · 영역 밖 이벤트 무시 · 입력 중 고정 자간', () => {
    const before = typedLetters.map(el => el.style.marginLeft);
    $('input-zone').dispatchEvent(new w.Event('paste', { cancelable: true }));
    $('input-zone').dispatchEvent(new w.Event('compositionstart')); type('h');
    $('input-zone').dispatchEvent(new w.Event('compositionend'));
    d.body.dispatchEvent(new w.KeyboardEvent('keydown', key('h')));
    assert(!typedLetters[0].classList.contains('recorded'));
    type('h'); type('e'); same(typedLetters.map(el => el.style.marginLeft), before);
  });
  // Control performance.now only for a deterministic long-gap recording in the actual UI.
  $('reset').click(); let now = 5000;
  Object.defineProperty(w.performance, 'now', { configurable: true, value: () => now });
  [0, 180, 420, 570, 10000].forEach((ms, i) => { now = 5000 + ms; type('hello'[i]); });
  check('UI: 완료 후 개별 자간 적용 · 큰 간격 가로 스크롤 · 글자 폭 유지', () => {
    same(typedLetters.map(el => parseFloat(el.style.marginLeft)).map(Math.round), [0, 34, 41, 30, 1144]);
    assert($('word-scroll').scrollWidth > $('word-scroll').clientWidth);
    assert($('status').textContent === '입력 완료' && !$('results').hidden && !$('play').disabled);
  });
  const uiAudio = fakeAudio(); w.AudioContext = function () { return uiAudio.context; };
  $('play').click(); await Promise.resolve(); await Promise.resolve();
  const layout = () => typedLetters.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  check('UI: 재생 중복 방지 · 강조 전후 위치/크기/여백 불변', () => {
    assert($('play').disabled && !$('stop').disabled && uiAudio.sources.length === 5);
    $('play').click(); assert(uiAudio.sources.length === 5);
    const before = layout(); typedLetters[2].classList.add('sounding'); same(layout(), before);
  });
  $('stop').click();
  check('UI: 정지 후 음원 예약·강조 제거 · 기존 자간 유지', () => {
    assert(uiAudio.sources.every(s => s.disconnected && s.stops.at(-1) === 10));
    assert(typedLetters.every(el => !el.classList.contains('sounding')));
    assert(!$('play').disabled && parseFloat(typedLetters[4].style.marginLeft) > 1100);
  });
  $('play').click(); await Promise.resolve(); $('reset').click();
  check('UI: 재생 중 재입력 시 음원·시각 반응 취소 · 기본 자간 복구', () => {
    assert(uiAudio.sources.length === 10 && uiAudio.sources.every(s => s.disconnected));
    assert($('status').textContent === '입력 중' && $('results').hidden);
    same(typedLetters.map(el => el.style.marginLeft), ['0px', '12px', '12px', '12px', '12px']);
  });
  [...'hello'].forEach(type); $('play').click(); await Promise.resolve();
  uiAudio.sources.slice(-5).forEach(s => s.onended());
  check('UI: 반복 입력 · 완료 · 재재생 · 포커스 이탈 취소', () => {
    assert($('status').textContent === '입력 완료' && !$('play').disabled);
    $('play').click(); $('stop').click(); $('reset').click(); type('h');
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
  await until(() => !fd.getElementById('retry-sounds').hidden && fd.getElementById('font-status').textContent.includes('실패'));
  check('UI: 실제 음원 실패 안내·재시도 표시 · 폰트 404 시 대체 세리프', () => {
    assert(fd.getElementById('sound-status').textContent.includes('503'));
    assert(fd.getElementById('play').disabled);
    assert(fw.getComputedStyle(fd.querySelector('#letters span')).fontFamily.includes('Georgia'));
  });
  fw.fetch = fw.originalFetch; fd.getElementById('retry-sounds').click();
  await until(() => fd.getElementById('sound-status').textContent.includes('완료'));
  check('UI: 로딩 재시도 성공 후 오류와 재시도 버튼 해제', () => assert(fd.getElementById('retry-sounds').hidden));
  failureFrame.remove();
  report.textContent = `${lines.join('\n')}\n\n${lines.length - failed}/${lines.length} passed`;
  report.dataset.result = failed ? 'fail' : 'pass';
})().catch(error => {
  document.getElementById('report').textContent += `\nERROR ${error.stack}`;
  document.getElementById('report').dataset.result = 'fail';
});
