// Loaded only by the file:// regression fixture generated during verification.
window.addEventListener('load', async () => {
  const report = document.createElement('pre');
  report.id = 'file-report';
  document.body.append(report);
  const assert = value => { if (!value) throw new Error('assertion failed'); };
  async function until(condition) {
    for (let i = 0; i < 300; i++) {
      if (condition()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('loading timeout');
  }
  try {
    assert(location.protocol === 'file:');
    // Any accidental fallback to fetch must fail this test.
    window.fetch = () => { throw new Error('file test must not use fetch'); };
    const bank = new HelloRhythm.SampleBank();
    await bank.load(); assert(bank.buffers.size === 4);
    const offline = new OfflineAudioContext(1, 44100 * 2, 44100);
    const context = { state: 'running', currentTime: 0, destination: offline.destination,
      createBufferSource: () => offline.createBufferSource(), createGain: () => offline.createGain() };
    const player = new HelloRhythm.RhythmPlayer(() => context, bank);
    await player.play([0, 180, 420, 570, 900], () => {});
    assert(player.events.map(e => e.letter).join('') === 'hello');
    const pcm = (await offline.startRendering()).getChannelData(0);
    assert(pcm.some(value => Math.abs(value) > .1));
    const $ = id => document.getElementById(id);
    await until(() => $('sound-status').textContent.includes('완료'));
    $('start').click();
    for (const letter of 'hello') {
      for (const type of ['keydown', 'keyup']) $('input-zone').dispatchEvent(new KeyboardEvent(type,
        { key: letter, code: `Key${letter.toUpperCase()}`, bubbles: true, cancelable: true }));
    }
    assert(!$('play').disabled && $('status').textContent === '입력 완료');
    $('play').click(); await Promise.resolve(); await Promise.resolve();
    assert($('status').textContent === '재생 중' && !$('stop').disabled);
    assert(!$('feedback').textContent.includes('시작하지 못했습니다'));
    $('stop').click(); assert(!$('play').disabled);
    $('play').click(); await Promise.resolve(); $('reset').click();
    assert($('status').textContent === '입력 중' && $('results').hidden);
    assert([...$('letters').children].every(el => !el.classList.contains('sounding')));
    report.textContent = 'PASS file://: no fetch, 4 decoded drums, real offline render, input, play, stop, replay, reset';
  } catch (error) { report.textContent = `FAIL file://: ${error.stack}`; }
});
