(() => {
  'use strict';
  let records = [], active = false;
  function setRecords(values) {
    const checked = values.map(HelloRecording.validate);
    records = checked;
    if (!active) return;
    const list = document.getElementById('b-records');
    list.replaceChildren(...records.map(record => {
      const item = document.createElement('li');
      item.textContent = `${record.source === 'example' ? '예시 · 실제 참여자 아님' : '개인 JSON 기록'} | ${record.id} | ${record.text} | ${record.relativeTimesMs.length}개 입력 | ${record.durationMs.toFixed(1)}ms`;
      return item;
    }));
    document.getElementById('b-record-count').textContent = `${records.length}개 기록 연결 · 오디오 엔진 준비 중`;
  }
  globalThis.HelloSoundscape = {
    enter(values) { active = true; setRecords(values); },
    leave() { active = false; }, setRecords,
    getRecords: () => records.map(HelloRecording.validate),
    diagnostics: () => ({ active, audioImplemented: false, inputBindings: 0 })
  };
})();
