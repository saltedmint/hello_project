/* Small mode host and in-memory JSON record handoff. No server or sound engine. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), records = new Map();
  let mode = 'home', selected = null, importGeneration = 0, routing = false;
  function status(message) { $('json-status').textContent = message; }
  function remember(record) {
    const checked = HelloRecording.validate(record);
    records.set(checked.id, checked); selected = checked;
    $('save-json').disabled = false;
    $('record-summary').textContent = `${checked.source === 'example' ? '예시 · 실제 참여자 아님' : '최근 완료 기록'} · ${checked.id} · ${checked.relativeTimesMs.length}개 입력`;
  }
  HelloOrchestra.subscribe(record => { if (!routing) remember(record); });
  function selectMode(next) {
    if (!['home', 'a', 'b', 'b-legacy'].includes(next) || next === mode) return;
    importGeneration++;
    if (mode === 'a') HelloOrchestra.leave();
    if (mode === 'b-legacy') HelloSoundscape.leave();
    if (mode === 'b') HelloQuestions.leave();
    mode = next;
    $('mode-home').hidden = mode !== 'home'; $('mode-a').hidden = mode !== 'a'; $('mode-b').hidden = mode !== 'b';
    $('mode-b-legacy').hidden = mode !== 'b-legacy';
    $('mode-nav').hidden = mode === 'home';
    document.querySelector('.record-tools').hidden = mode === 'b'||mode === 'b-legacy';
    document.body.classList.toggle('soundscape-open',mode === 'b-legacy');
    document.body.classList.toggle('questions-open',mode === 'b');
    $('nav-a').setAttribute('aria-current', mode === 'a' ? 'page' : 'false');
    $('nav-b').setAttribute('aria-current', mode === 'b' ? 'page' : 'false');
    $('nav-b-legacy').setAttribute('aria-current',mode === 'b-legacy'?'page':'false');
    if (mode === 'a') {
      routing = true;
      try {
        HelloOrchestra.enter();
        if (selected && HelloOrchestra.getRecord()?.id !== selected.id) {
          try { HelloOrchestra.applyRecord(HelloOrchestra.prepareImport(selected)); }
          catch (error) { status(error.message); }
        }
      } finally { routing = false; }
    }
    if (mode === 'b-legacy') HelloSoundscape.enter([...records.values()]);
    if (mode === 'b') HelloQuestions.enter();
  }
  function importText(text) {
    const checked = HelloRecording.parse(text);
    // Validate optional A data even when importing from the B entry screen.
    const prepared = checked.a ? HelloOrchestra.prepareImport(checked) : null;
    if (mode === 'a' && !prepared) throw new Error('A에는 네 마디와 Enter 정보가 있는 JSON이 필요합니다. B에서 공통 기록을 불러올 수 있습니다.');
    if (mode === 'a') HelloOrchestra.applyRecord(prepared);
    remember(checked);
    if (mode === 'b-legacy') HelloSoundscape.setRecords([...records.values()]);
    status(`${checked.source === 'example' ? '예시(실제 참여자 아님)' : 'JSON 기록'}를 불러왔습니다. 원본 시각을 보존합니다.`);
    return checked;
  }
  async function importFile(file) {
    if (!file) return;
    const generation = ++importGeneration;
    try {
      if (file.size > HelloRecording.MAX_FILE_BYTES) throw new Error('JSON 파일은 2MB 이내여야 합니다.');
      const text = await file.text();
      if (generation !== importGeneration) return;
      importText(text);
    } catch (error) { if (generation === importGeneration) status(`불러오기 실패: ${error.message} 기존 완료 기록은 유지했습니다.`); }
  }
  $('choose-a').addEventListener('click', () => selectMode('a'));
  $('choose-b').addEventListener('click', () => selectMode('b'));
  $('choose-b-legacy').addEventListener('click',()=>selectMode('b-legacy'));
  $('nav-a').addEventListener('click', () => selectMode('a'));
  $('nav-b').addEventListener('click', () => selectMode('b'));
  $('nav-b-legacy').addEventListener('click',()=>selectMode('b-legacy'));
  $('nav-home').addEventListener('click', () => selectMode('home'));
  $('load-json').addEventListener('click', () => $('json-file').click());
  $('json-file').addEventListener('change', async event => {
    await importFile(event.target.files?.[0]); event.target.value = '';
  });
  $('save-json').addEventListener('click', () => {
    try { if (selected) { HelloRecording.download(selected); status('JSON 다운로드를 준비했습니다. 원본 입력 시각과 선택 손글씨를 포함합니다.'); } }
    catch (error) { status(`JSON 저장 실패: ${error.message}`); }
  });
  globalThis.HelloExperiments = { selectMode, importText, importFile,
    getRecord: () => selected ? HelloRecording.validate(selected) : null,
    getRecords: () => [...records.values()].map(HelloRecording.validate), getMode: () => mode };
})();
