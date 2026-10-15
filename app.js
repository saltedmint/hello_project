(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const recorder = new HelloRhythm.Recorder();
  const player = new HelloRhythm.RhythmPlayer();
  const zone = $('input-zone');
  const letters = [...$('letters').children];
  const visual = new HelloRhythm.PlaybackVisual(letters);
  let state = 'waiting';
  let composing = false;
  let playbackRequest = 0;
  const labels = { waiting: '대기', recording: '입력 중', complete: '입력 완료', playing: '재생 중' };
  function render(message) {
    $('status').textContent = labels[state];
    $('start').disabled = state !== 'waiting';
    $('play').disabled = state !== 'complete' || player.bank.status !== 'ready';
    $('stop').disabled = state !== 'playing';
    zone.tabIndex = state === 'recording' ? 0 : -1;
    letters.forEach((letter, i) => {
      letter.classList.toggle('recorded', i < recorder.times.length);
      letter.style.marginLeft = i === 0 ? '0px' : `${recorder.times.length === 5 ? HelloRhythm.spacingFor(recorder.gaps[i - 1]) : HelloRhythm.SPACING.minimumPx}px`;
    });
    $('layout-caption').textContent = recorder.times.length === 5
      ? '긴 입력 간격은 넓은 여백으로. 넘치는 글자는 좌우로 스크롤해 보세요.'
      : '입력 중에는 같은 간격으로, 완료 후에는 당신의 간격으로.';
    $('letters').setAttribute('aria-label', `${recorder.times.length} / 5 글자 입력`);
    $('results').hidden = recorder.times.length !== 5;
    if (message) $('feedback').textContent = message;
    if (recorder.times.length === 5) {
      const number = ms => `${ms.toFixed(1)}<small>ms</small>`;
      recorder.gaps.forEach((gap, i) => { $(`gap-${i}`).innerHTML = number(gap); });
      $('total').innerHTML = number(recorder.relative[4]);
    }
  }
  function reset(message, start = false) {
    playbackRequest++;
    player.stop();
    visual.stop();
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
  $('start').addEventListener('click', () => reset('자연스러운 속도로 hello를 입력해 주세요.', true));
  $('reset').addEventListener('click', () => reset('새로운 리듬을 기록합니다. hello를 입력해 주세요.', true));
  zone.addEventListener('keydown', event => {
    if (state !== 'recording' || document.activeElement !== zone) return;
    // Tab retains native keyboard navigation; leaving the zone cancels this attempt.
    if (event.key === 'Tab') return;
    event.preventDefault();
    const result = recorder.keydown({ key: event.key, code: event.code, repeat: event.repeat,
      isComposing: composing || event.isComposing, keyCode: event.keyCode,
      ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey }, performance.now());
    if (result === 'complete') {
      state = 'complete';
      render('기록을 마쳤습니다. ‘리듬 듣기’로 당신의 간격을 들어보세요.');
    } else if (result === 'accepted') render('자연스러운 속도로 hello를 입력해 주세요.');
    else if (result === 'wrong') render(event.key === 'Backspace'
      ? 'Backspace 수정은 지원하지 않습니다. ‘다시 입력하기’를 눌러 주세요.'
      : `지금은 소문자 ‘${'hello'[recorder.times.length]}’를 입력해 주세요.`);
    else if (result === 'composition') render('조합 입력은 기록하지 않습니다. 영문 입력 모드로 전환해 주세요.');
  });
  zone.addEventListener('keyup', event => recorder.release(event.code));
  zone.addEventListener('compositionstart', () => { composing = true; });
  zone.addEventListener('compositionend', () => { composing = false; });
  zone.addEventListener('paste', event => {
    event.preventDefault();
    if (state === 'recording') render('붙여넣기는 기록하지 않습니다. 키보드로 직접 입력해 주세요.');
  });
  zone.addEventListener('beforeinput', event => event.preventDefault());
  zone.addEventListener('blur', cancelAttempt);
  window.addEventListener('blur', cancelAttempt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAttempt(); });
  $('play').addEventListener('click', async () => {
    if (state !== 'complete' || player.bank.status !== 'ready') return;
    const request = ++playbackRequest;
    state = 'playing';
    render('기록한 간격 그대로 다섯 번의 소리를 재생합니다.');
    try {
      await player.play(recorder.relative, () => {
        if (request !== playbackRequest) return;
        state = 'complete';
        visual.stop();
        render('재생을 마쳤습니다. 같은 리듬을 다시 들을 수 있습니다.');
      });
      if (request === playbackRequest && player.playing) visual.start(player);
    } catch (error) {
      if (request !== playbackRequest) return;
      state = 'complete';
      visual.stop();
      render(`오디오를 시작하지 못했습니다: ${error.message} 오디오 장치와 브라우저 설정을 확인해 주세요.`);
    }
  });
  $('stop').addEventListener('click', () => {
    playbackRequest++;
    player.stop();
    visual.stop();
    state = 'complete';
    render('재생을 정지했습니다. 기록한 리듬을 다시 들을 수 있습니다.');
  });
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
  document.fonts.load('500 116px "Bodoni Moda"', 'hello').then(faces => {
    $('font-status').textContent = faces.length ? 'Bodoni Moda' : '대체 세리프 폰트 사용 중';
  }).catch(() => { $('font-status').textContent = '폰트 로딩 실패 · 대체 세리프 폰트 사용 중'; });
  render();
  loadSounds();
})();
