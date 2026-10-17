/* Shared timing logic: no DOM, no sound during recording. */
(() => {
  'use strict';
  class BarRecorder {
    constructor() { this.reset(); }
    reset() { this.times = []; this.enterTime = null; this.held = new Set(); this.active = false; }
    start() { this.reset(); this.active = true; }
    release(code) { this.held.delete(code); }
    keydown(event, now) {
      if (!this.active) return 'inactive';
      if (event.repeat || this.held.has(event.code)) return 'repeat';
      this.held.add(event.code);
      if (event.isComposing || event.keyCode === 229) return 'composition';
      const expected = this.times.length === 5 ? 'Enter' : 'hello'[this.times.length];
      if (event.ctrlKey || event.metaKey || event.altKey || event.key !== expected) return 'wrong';
      if (expected === 'Enter') {
        this.enterTime = now;
        this.active = false;
        return 'complete';
      }
      this.times.push(now);
      return this.times.length === 5 ? 'awaiting-enter' : 'accepted';
    }
    get relative() { return this.times.map(t => t - this.times[0]); }
    get gaps() { return this.times.slice(1).map((t, i) => t - this.times[i]); }
    get complete() { return this.enterTime !== null; }
    get loopGapMs() { return this.complete ? this.enterTime - this.times[4] : null; }
    get durationMs() { return this.complete ? this.enterTime - this.times[0] : null; }
  }

  class Recorder {
    constructor() { this.reset(); }
    reset() {
      this.bars = Array.from({ length: 4 }, () => new BarRecorder());
      this.completedBars = 0;
      this.held = new Set();
      this.active = false;
    }
    start() {
      this.reset();
      this.active = true;
      this.bars.forEach(bar => { bar.start(); bar.held = this.held; });
    }
    get current() { return this.bars[Math.min(this.completedBars, 3)]; }
    release(code) { this.held.delete(code); }
    keydown(event, now) {
      if (!this.active) return 'inactive';
      const result = this.current.keydown(event, now);
      if (result !== 'complete') return result;
      this.completedBars++;
      this.active = this.completedBars < 4;
      return this.active ? 'bar-complete' : 'complete';
    }
    get complete() { return this.completedBars === 4; }
    get times() { return this.bars.flatMap(bar => bar.times); }
    get relative() {
      if (!this.complete) return [];
      let offset = 0;
      return this.bars.flatMap(bar => {
        const times = bar.relative.map(time => offset + time);
        offset += bar.durationMs;
        return times;
      });
    }
    get loopGapMs() { return this.complete ? this.bars[3].loopGapMs : null; }
    get durationMs() { return this.complete ? this.bars.reduce((total, bar) => total + bar.durationMs, 0) : null; }
  }

  // One shared scale for every recording. Never normalize to available width.
  const SPACING = Object.freeze({ minimumPx: 12, pixelsPerMs: 0.12 });
  const INSTRUMENTS = Object.freeze({
    h: { name: '킥', file: 'assets/drums/kick.wav', gain: 0.22 },
    e: { name: '스네어', file: 'assets/drums/snare.wav', gain: 0.18 },
    l: { name: '닫힌 하이햇', file: 'assets/drums/hat.wav', gain: 0.12 },
    o: { name: '톰', file: 'assets/drums/tom.wav', gain: 0.20 }
  });
  const spacingFor = gap => SPACING.minimumPx + gap * SPACING.pixelsPerMs;
  const activeIndices = (events, time) => events.filter(event => time >= event.at && time < event.at + 0.12).map(event => event.index);
  const SYNTH = Object.freeze({ type: 'triangle', attack: .008, release: .02 });
  const PLAYBACK_LEAD_SECONDS = .06;

  function buildEvents(relative, melody = null) {
    if (!relative.length || relative[0] !== 0 || relative.some((time, i) => !Number.isFinite(time) || time < 0 || (i && time < relative[i - 1]))) {
      throw new Error('타이핑 시간 기록이 올바르지 않습니다. 다시 입력해 주세요.');
    }
    const events = relative.map((atMs, index) => {
      const letter = 'hello'[index % 5];
      return { kind: 'drum', atMs, index, letter, level: INSTRUMENTS[letter].gain };
    });
    for (const note of melody?.notes || []) {
      if (![note.startMs, note.endMs, note.midi].every(Number.isFinite) || note.startMs < 0 || note.endMs <= note.startMs || note.midi < 0 || note.midi > 127) {
        throw new Error('손글씨 선율 기록이 올바르지 않습니다. 다시 써 주세요.');
      }
      events.push({ kind: 'melody', atMs: note.startMs, endMs: note.endMs, midi: note.midi });
    }
    return events;
  }

  // Live playback and WAV export both use this event list and node scheduler.
  function scheduleEvents(context, bank, events, start, { melodyDestination = null, onVoice = () => {}, onDrum = () => {} } = {}) {
    for (const event of events) {
      const at = start + event.atMs / 1000;
      const gain = context.createGain();
      const source = event.kind === 'drum' ? context.createBufferSource() : context.createOscillator();
      onVoice(source, gain);
      if (event.kind === 'drum') {
        source.buffer = bank.buffers.get(event.letter);
        if (!source.buffer) throw new Error(`${event.letter} 타악기 샘플이 준비되지 않았습니다.`);
        gain.gain.setValueAtTime(event.level, at);
        source.connect(gain); gain.connect(context.destination);
        onDrum({ index: event.index, letter: event.letter, at });
        source.start(at);
      } else {
        const end = start + event.endMs / 1000;
        source.type = SYNTH.type;
        source.frequency.setValueAtTime(440 * 2 ** ((event.midi - 69) / 12), at);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(1, at + Math.min(SYNTH.attack, (end - at) * .2));
        gain.gain.setValueAtTime(1, end);
        gain.gain.linearRampToValueAtTime(0, end + SYNTH.release);
        source.connect(gain); gain.connect(melodyDestination);
        source.start(at); source.stop(end + SYNTH.release);
      }
    }
  }

  function embeddedBytes(file) {
    const encoded = globalThis.HelloDrumSamples?.[file];
    if (!encoded) throw new Error('내장 음원 데이터가 없습니다. assets/drums/embedded.js 파일을 확인해 주세요.');
    // decodeAudioData may detach its input; return a fresh buffer on every load/retry.
    return Uint8Array.from(atob(encoded), character => character.charCodeAt(0)).buffer;
  }

  function fetchSample(file, options) {
    // file:// fetch is blocked by browser origin rules. Classic local scripts can
    // provide these exact same WAV bytes without a network request or server.
    if (globalThis.location?.protocol === 'file:') {
      return Promise.resolve({ ok: true, arrayBuffer: async () => embeddedBytes(file) });
    }
    return fetch(file, options);
  }

  class SampleBank {
    constructor(fetcher = fetchSample, makeDecoder = () => new OfflineAudioContext(1, 1, 44100)) {
      this.fetcher = fetcher;
      this.makeDecoder = makeDecoder;
      this.buffers = new Map();
      this.status = 'idle';
      this.pending = null;
    }
    load() {
      if (this.status === 'ready') return Promise.resolve();
      if (this.pending) return this.pending;
      this.status = 'loading';
      this.pending = this.loadAll().finally(() => { this.pending = null; });
      return this.pending;
    }
    async loadAll() {
      try {
        const decoder = this.makeDecoder();
        const entries = await Promise.all(Object.entries(INSTRUMENTS).map(async ([letter, instrument]) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          try {
            const response = await this.fetcher(instrument.file, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
            // Peak-normalize once, then apply fixed per-instrument gains at playback.
            let peak = 0;
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
              for (const value of buffer.getChannelData(ch)) peak = Math.max(peak, Math.abs(value));
            }
            if (!peak) throw new Error('빈 음원');
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
              const channel = buffer.getChannelData(ch);
              for (let i = 0; i < channel.length; i++) channel[i] /= peak;
            }
            return [letter, buffer];
          } catch (error) {
            throw new Error(`${instrument.name} (${instrument.file}): ${error.name === 'AbortError' ? '10초 로딩 시간 초과' : error.message}`);
          } finally { clearTimeout(timeout); }
        }));
        this.buffers = new Map(entries);
        this.status = 'ready';
      } catch (error) {
        this.buffers.clear();
        this.status = 'error';
        throw error;
      }
    }
  }

  class RhythmPlayer {
    constructor(makeContext = () => new (window.AudioContext || window.webkitAudioContext)(), bank = new SampleBank(), timers = globalThis) {
      this.makeContext = makeContext;
      this.bank = bank;
      this.context = null;
      this.voices = new Set();
      this.events = [];
      this.generation = 0;
      this.playing = false;
      this.timers = timers;
      this.loopTimer = null;
      this.looping = false;
      this.melodyGain = null;
      this.melodyVolume = 0.07;
    }
    setMelodyVolume(value) {
      this.melodyVolume = Math.max(0, Math.min(.15, value));
      if (this.melodyGain) this.melodyGain.gain.setTargetAtTime(this.melodyVolume, this.context.currentTime, .01);
    }
    async play(relative, onComplete, { loop = false, loopGapMs, melody = null } = {}) {
      this.stop();
      const generation = this.generation;
      if (this.bank.status !== 'ready') throw new Error('음원 준비가 완료되지 않았습니다.');
      if (loop && (!Number.isFinite(loopGapMs) || loopGapMs < 0 || relative.at(-1) + loopGapMs <= 0)) {
        throw new Error('Enter까지의 입력 시간이 필요합니다. 다시 입력해 주세요.');
      }
      this.playing = true;
      try {
        // Called synchronously from the user's click, before any await.
        this.context ||= this.makeContext();
        if (this.context.state === 'suspended') await this.context.resume();
        if (generation !== this.generation) return;
        if (this.context.state !== 'running') throw new Error('오디오 장치를 사용할 수 없습니다.');
        const eventList = buildEvents(relative, melody);
        const start = this.context.currentTime + PLAYBACK_LEAD_SECONDS;
        this.startTime = start;
        this.looping = loop;
        if (melody) {
          this.melodyGain = this.context.createGain();
          this.melodyGain.gain.setValueAtTime(this.melodyVolume, this.context.currentTime);
          this.melodyGain.connect(this.context.destination);
        }
        const watchVoice = (source, gain) => {
          const voice = { source, gain }; this.voices.add(voice);
          source.onended = () => {
            source.disconnect(); gain.disconnect(); this.voices.delete(voice);
            if (!this.looping && this.voices.size === 0 && generation === this.generation) {
              this.playing = false; this.events = [];
              if (this.melodyGain) this.melodyGain.disconnect(); this.melodyGain = null;
              onComplete();
            }
          };
        };
        const scheduleCycle = cycleStart => {
          scheduleEvents(this.context, this.bank, eventList, cycleStart, {
            melodyDestination: this.melodyGain, onVoice: watchVoice,
            onDrum: event => this.events.push(event)
          });
        };
        scheduleCycle(start);
        if (loop) {
          this.loopPeriod = (relative.at(-1) + loopGapMs) / 1000;
          let nextCycle = 1;
          const queue = () => {
            if (generation !== this.generation || !this.playing) return;
            const now = this.context.currentTime;
            this.events = this.events.filter(event => event.at + 0.12 > now);
            // A delayed/background timer must not burst overdue patterns or
            // move the grid: recover at the next cycle on the original clock.
            nextCycle = Math.max(nextCycle, Math.ceil((now + 0.01 - start) / this.loopPeriod));
            while (start + nextCycle * this.loopPeriod < now + 0.2) {
              scheduleCycle(start + nextCycle * this.loopPeriod);
              nextCycle++;
            }
          };
          this.loopTimer = this.timers.setInterval(queue, 25);
        }
      } catch (error) {
        if (generation !== this.generation) return;
        this.stop();
        throw error;
      }
    }
    stop() {
      this.generation++;
      this.playing = false;
      this.looping = false;
      if (this.loopTimer !== null) this.timers.clearInterval(this.loopTimer);
      this.loopTimer = null;
      this.events = [];
      for (const { source, gain } of this.voices) {
        source.onended = null;
        gain.disconnect();
        source.stop(this.context.currentTime);
        source.disconnect();
      }
      this.voices.clear();
      if (this.melodyGain) this.melodyGain.disconnect(); this.melodyGain = null;
    }
  }

  class PlaybackVisual {
    constructor(elements, request = callback => requestAnimationFrame(callback), cancel = id => cancelAnimationFrame(id)) {
      this.elements = elements;
      this.request = request;
      this.cancel = cancel;
      this.frame = null;
      this.generation = 0;
    }
    start(player) {
      this.stop();
      const generation = this.generation;
      const tick = () => {
        if (generation !== this.generation) return;
        if (!player.playing) { this.stop(); return; }
        const indices = activeIndices(player.events, player.context.currentTime);
        this.elements.forEach((element, index) => element.classList.toggle('sounding', indices.includes(index)));
        this.frame = this.request(tick);
      };
      tick();
    }
    stop() {
      this.generation++;
      if (this.frame !== null) this.cancel(this.frame);
      this.frame = null;
      this.elements.forEach(element => element.classList.remove('sounding'));
    }
  }
  globalThis.HelloRhythm = { Recorder, BarRecorder, RhythmPlayer, SampleBank, PlaybackVisual, SPACING, INSTRUMENTS, spacingFor, activeIndices, embeddedBytes, buildEvents, scheduleEvents, SYNTH, PLAYBACK_LEAD_SECONDS };
})();
