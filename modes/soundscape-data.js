/* Data and persistence only: no DOM or audio dependencies. */
(() => {
  'use strict';
  const TEXT = 'hello stranger', LIMIT = 20, STORAGE_KEY = 'hello.soundscape.v1';
  const MIDI = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69];
  const TEST_SENTENCES = Object.freeze([
    'good morning','nice to meet you','hello from the other side','i hope you are doing well',
    'take your time and stay awhile','a quiet hello from me to you','welcome to this little place',
    'how has your day been','we are here together','there is room for you here',
    'sending you a little kindness','what a lovely day to begin','let us listen for a moment',
    'the city is waking up slowly','i am glad we crossed paths','good evening my friend',
    'may your journey be gentle','somewhere a new story begins','stay curious and keep going',
    'hello to everyone listening','it is nice to see you again','a small greeting travels far',
    'meet me where the light falls','this moment belongs to all of us'
  ]);
  const hash = text => Array.from(text).reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  function allocation(id) {
    const n = hash(id);
    return { midi: MIDI[n % MIDI.length], pan: ((n >>> 8) % 601 - 300) / 1000, startFraction: ((n >>> 16) % 1000) / 1000 };
  }
  function validate(value) {
    const record = HelloRecording.validate(value);
    if (!/^[a-z]+(?: [a-z]+)*$/.test(record.text) || record.text.length < 2 || record.text.length > 80 || record.durationMs <= 0 || record.durationMs > 120000) throw new Error('B 문장은 영문 소문자·단어 사이 공백, 2~80자, 0초 초과·120초 이하이어야 합니다.');
    const b = record.b;
    if (!b || !MIDI.includes(b.midi) || !Number.isFinite(b.pan) || Math.abs(b.pan) > .3 || !Number.isFinite(b.startFraction) || b.startFraction < 0 || b.startFraction > 1) throw new Error('B 음높이·좌우 위치·반복 시작 설정이 올바르지 않습니다.');
    record.b = { midi:b.midi, pan:b.pan, startFraction:b.startFraction };
    if (b.testKind !== undefined || b.seed !== undefined) {
      if (record.source !== 'example' || b.testKind !== 'random-sentence' || !Number.isInteger(b.seed) || b.seed < 0 || b.seed > 0xffffffff) throw new Error('임의 문장 테스트 표시 또는 seed가 올바르지 않습니다.');
      record.b.testKind=b.testKind; record.b.seed=b.seed;
    }
    return record;
  }
  function create(times, id = HelloRecording.newId(), source = 'local') {
    const relativeTimesMs = times.map(t => t - times[0]);
    return validate({ schemaVersion:1, id, text:TEXT, relativeTimesMs, durationMs:relativeTimesMs.at(-1), source,
      raw:{clock:'performance.now',keyDownTimesMs:[...times]}, b:allocation(id) });
  }
  function parse(text) {
    if (typeof text !== 'string' || new Blob([text]).size > HelloRecording.MAX_FILE_BYTES) throw new Error('JSON은 2MB 이하여야 합니다.');
    let value; try { value = JSON.parse(text); } catch { throw new Error('올바른 JSON이 아닙니다.'); }
    if (!value || value.schemaVersion !== 1 || value.mode !== 'soundscape-b' || !Array.isArray(value.records) || value.records.length > LIMIT) throw new Error('B 전체 기록 JSON 형식 또는 20개 한도를 확인해 주세요.');
    const records = value.records.map(validate);
    if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('파일 안에 중복 ID가 있습니다.');
    return records;
  }
  const serialize = records => JSON.stringify({schemaVersion:1,mode:'soundscape-b',records:records.map(validate)},null,2);
  function examples(count = 10) {
    if (![1,5,10,20].includes(count)) throw new Error('지원하지 않는 예시 수입니다.');
    return Array.from({length:count},(_,i) => {
      let time = 0;
      const times = Array.from(TEXT,(_,j) => { if (j) time += 95 + ((i * 83 + j * 137) % 620); return time; });
      return create(times, `soundscape-example-${i+1}`, 'example');
    });
  }
  function randomSentences(count = 5, seed) {
    if (![1,5,10,20].includes(count)) throw new Error('지원하지 않는 테스트 수입니다.');
    if (seed === undefined) seed = globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random()*0x100000000);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed는 32bit 양의 정수 또는 0이어야 합니다.');
    let state=seed;
    const random=()=>{state=(state+0x6d2b79f5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/0x100000000;};
    const sentences=[...TEST_SENTENCES];
    for(let i=sentences.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[sentences[i],sentences[j]]=[sentences[j],sentences[i]];}
    return sentences.slice(0,count).map((text,index)=>{
      const base=70+random()*220; let time=0;
      const relativeTimesMs=Array.from(text,(_,i)=>{
        if(i){let gap=base*(.45+random()*1.7);if(text[i-1]===' ')gap+=120+random()*650;if(random()<.08)gap+=300+random()*1000;time+=Math.round(gap);}
        return time;
      });
      const id=`soundscape-random-${seed.toString(16)}-${index+1}`;
      return validate({schemaVersion:1,id,text,relativeTimesMs,durationMs:relativeTimesMs.at(-1),source:'example',
        b:{...allocation(id),testKind:'random-sentence',seed}});
    });
  }
  class Store {
    constructor(storage) { this.storage = storage; this.records = []; this.warning = ''; }
    getRecords() { return this.records.map(validate); }
    save(next) {
      // Keep the accepted records in memory even when the browser denies storage.
      this.warning = '';
      try { this.storage.setItem(STORAGE_KEY,serialize(next)); }
      catch { this.warning = '로컬 저장을 사용할 수 없습니다. 새로고침 전 JSON을 다운로드해 주세요.'; }
      this.records = next;
    }
    restore() {
      try { const text = this.storage.getItem(STORAGE_KEY); if (text) this.records = parse(text); }
      catch { this.warning = '저장된 기록을 복원하지 못했습니다. 원본 저장값은 보존했습니다. JSON으로 복구해 주세요.'; }
      return this.getRecords();
    }
    addRecords(values) {
      const checked = values.map(validate), next = this.getRecords(), ids = new Set(next.map(r => r.id));
      for (const record of checked) if (!ids.has(record.id)) { next.push(record); ids.add(record.id); }
      if (next.length > LIMIT) throw new Error('최대 20개입니다. 기존 기록을 제거한 후 다시 보태 주세요.');
      const added = next.length - this.records.length; this.save(next); return added;
    }
    remove(id) { this.save(this.records.filter(record => record.id !== id)); }
    removeRandomTests() { this.save(this.records.filter(record=>record.b.testKind!=='random-sentence')); }
    clear() { this.save([]); }
  }
  globalThis.HelloSoundscapeData = { TEXT, LIMIT, MIDI, STORAGE_KEY, TEST_SENTENCES, allocation, validate, create, parse, serialize, examples, randomSentences, Store };
})();
