(() => {
  'use strict';
  const SCHEMA_VERSION = 1, MAX_FILE_BYTES = 2 * 1024 * 1024;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const near = (a, b) => Math.abs(a - b) <= .00001;
  const fail = message => { throw new Error(`기록 JSON: ${message}`); };
  function times(value, count, label) {
    if (!Array.isArray(value) || value.length !== count) fail(`${label}의 글자 수와 이벤트 수가 맞지 않습니다.`);
    for (let i = 0; i < value.length; i++) {
      if (!Number.isFinite(value[i]) || value[i] < 0 || value[i] > Number.MAX_SAFE_INTEGER || (i && value[i] < value[i - 1])) fail(`${label}은 유한한 숫자의 오름차순이어야 합니다.`);
    }
    return [...value];
  }
  function validate(value) {
    if (!object(value) || value.schemaVersion !== SCHEMA_VERSION) fail('지원하는 schemaVersion은 1입니다.');
    if (typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.id)) fail('id가 올바르지 않습니다.');
    if (typeof value.text !== 'string' || !value.text.length || Array.from(value.text).length > 256 || /[\u0000-\u001f]/.test(value.text)) fail('text가 올바르지 않습니다.');
    const relativeTimesMs = times(value.relativeTimesMs, Array.from(value.text).length, 'relativeTimesMs');
    if (relativeTimesMs[0] !== 0 || relativeTimesMs.at(-1) > 3600000) fail('첫 입력은 0ms이며 전체 기록은 1시간 이내여야 합니다.');
    if (!Number.isFinite(value.durationMs) || value.durationMs < 0 || !near(value.durationMs, relativeTimesMs.at(-1))) fail('durationMs는 마지막 글자의 상대 시각과 같아야 합니다.');
    const source = value.source ?? 'imported';
    if (!['local', 'imported', 'example'].includes(source)) fail('source가 올바르지 않습니다.');
    const result = { schemaVersion: SCHEMA_VERSION, id: value.id, text: value.text, relativeTimesMs, durationMs: value.durationMs, source };
    if (value.raw !== undefined) {
      if (!object(value.raw) || value.raw.clock !== 'performance.now') fail('raw.clock이 올바르지 않습니다.');
      const keyDownTimesMs = times(value.raw.keyDownTimesMs, relativeTimesMs.length, 'raw.keyDownTimesMs');
      if (keyDownTimesMs.some((time, i) => !near(time - keyDownTimesMs[0], relativeTimesMs[i]))) fail('원본 시각과 상대 시각이 일치하지 않습니다.');
      result.raw = { clock: 'performance.now', keyDownTimesMs };
      if (value.raw.enterTimesMs !== undefined) {
        if (!Array.isArray(value.raw.enterTimesMs) || value.raw.enterTimesMs.length > 256) fail('Enter 시각이 올바르지 않습니다.');
        result.raw.enterTimesMs = times(value.raw.enterTimesMs, value.raw.enterTimesMs.length, 'raw.enterTimesMs');
      }
    }
    // Mode-specific extensions are checked by that mode's data adapter before
    // application. Never spread untrusted JSON into live controller objects.
    if (value.a !== undefined) {
      if (!object(value.a)) fail('a 확장은 객체여야 합니다.');
      result.a = JSON.parse(JSON.stringify(value.a));
    }
    if (value.b !== undefined) {
      if (!object(value.b)) fail('b 확장은 객체여야 합니다.');
      result.b = JSON.parse(JSON.stringify(value.b));
    }
    return result;
  }
  function parse(text) {
    if (typeof text !== 'string' || new Blob([text]).size > MAX_FILE_BYTES) fail('파일은 2MB 이내여야 합니다.');
    let value;
    try { value = JSON.parse(text); } catch { fail('올바른 JSON 파일이 아닙니다.'); }
    return validate(value);
  }
  function newId() { return globalThis.crypto?.randomUUID?.() || `greeting-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
  function download(record) {
    const checked = validate(record);
    const url = URL.createObjectURL(new Blob([JSON.stringify(checked, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${checked.id}.json`; document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  }
  globalThis.HelloRecording = { SCHEMA_VERSION, MAX_FILE_BYTES, validate, parse, newId, download, near };
})();
