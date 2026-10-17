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
    $('choose-a').click();
    await until(() => $('sound-status').textContent.includes('완료'));
    $('start').click();
    for (let bar = 0; bar < 4; bar++) {
      for (const letter of 'hello') {
        for (const type of ['keydown', 'keyup']) $('input-zone').dispatchEvent(new KeyboardEvent(type,
          { key: letter, code: `Key${letter.toUpperCase()}`, bubbles: true, cancelable: true }));
      }
      assert($('play').disabled && $('status').textContent === '입력 중');
      for (const type of ['keydown', 'keyup']) $('input-zone').dispatchEvent(new KeyboardEvent(type,
        { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      if (bar < 3) assert($('play').disabled && $('status').textContent === '입력 중');
    }
    assert(!$('play').disabled && $('status').textContent === '입력 완료');
    $('play').click(); await Promise.resolve(); await Promise.resolve();
    assert($('status').textContent === '재생 중' && !$('stop').disabled);
    assert(!$('feedback').textContent.includes('시작하지 못했습니다'));
    $('stop').click(); assert(!$('play').disabled);
    $('add-handwriting').click();
    const canvas=$('handwriting-canvas'),captured=new Set();
    canvas.setPointerCapture=id=>captured.add(id);canvas.hasPointerCapture=id=>captured.has(id);canvas.releasePointerCapture=id=>captured.delete(id);
    let writingTime=10000;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>writingTime});
    for(const [event,x,y,time] of [['pointerdown',.2,.8,10000],['pointermove',.5,.5,10500],['pointermove',.7,.2,11000],['pointerup',.8,.2,11500]]){
      const rect=canvas.getBoundingClientRect();writingTime=time;
      canvas.dispatchEvent(new PointerEvent(event,{pointerId:1,isPrimary:true,button:0,bubbles:true,cancelable:true,
        clientX:rect.left+x*rect.width,clientY:rect.top+y*rect.height}));
    }
    delete performance.now;
    $('finish-writing').click();assert(!$('play-together').disabled);
    $('play-together').click();await Promise.resolve();await Promise.resolve();
    assert($('status').textContent==='재생 중' && !$('feedback').textContent.includes('시작하지 못했습니다'));
    $('clear-writing').click();assert(!$('play').disabled && $('play-together').disabled);
    $('play').click(); await Promise.resolve(); $('reset').click();
    assert($('status').textContent === '입력 중' && $('results').hidden);
    assert([...$('letters').querySelectorAll('.letter')].every(el => !el.classList.contains('sounding')));
    report.textContent = 'PASS file://: no fetch, real audio, four bars, handwriting, together, clear, stop, replay, reset';
  } catch (error) { report.textContent = `FAIL file://: ${error.stack}`; }
});
