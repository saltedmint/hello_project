/* Shared timing logic: no DOM, no sound during recording. */
(() => {
  'use strict';
  class Recorder {
    constructor() { this.reset(); }
    reset() { this.times = []; this.held = new Set(); this.active = false; }
    start() { this.reset(); this.active = true; }
    release(code) { this.held.delete(code); }
    keydown(event, now) {
      if (!this.active) return 'inactive';
      if (event.repeat || this.held.has(event.code)) return 'repeat';
      this.held.add(event.code);
      if (event.isComposing || event.keyCode === 229) return 'composition';
      if (event.ctrlKey || event.metaKey || event.altKey || event.key !== 'hello'[this.times.length]) return 'wrong';
      this.times.push(now);
      if (this.times.length === 5) this.active = false;
      return this.active ? 'accepted' : 'complete';
    }
    get relative() { return this.times.map(t => t - this.times[0]); }
    get gaps() { return this.times.slice(1).map((t, i) => t - this.times[i]); }
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
    constructor(makeContext = () => new (window.AudioContext || window.webkitAudioContext)(), bank = new SampleBank()) {
      this.makeContext = makeContext;
      this.bank = bank;
      this.context = null;
      this.voices = new Set();
      this.events = [];
      this.generation = 0;
      this.playing = false;
    }
    async play(relative, onComplete) {
      this.stop();
      const generation = this.generation;
      if (this.bank.status !== 'ready') throw new Error('음원 준비가 완료되지 않았습니다.');
      this.playing = true;
      try {
        // Called synchronously from the user's click, before any await.
        this.context ||= this.makeContext();
        if (this.context.state === 'suspended') await this.context.resume();
        if (generation !== this.generation) return;
        if (this.context.state !== 'running') throw new Error('오디오 장치를 사용할 수 없습니다.');
        const start = this.context.currentTime + 0.06;
        for (const [index, ms] of relative.entries()) {
          const letter = 'hello'[index];
          const source = this.context.createBufferSource();
          const gain = this.context.createGain();
          const at = start + ms / 1000;
          source.buffer = this.bank.buffers.get(letter);
          const voice = { source, gain };
          this.voices.add(voice);
          this.events.push({ index, letter, at });
          gain.gain.setValueAtTime(INSTRUMENTS[letter].gain, at);
          source.connect(gain);
          gain.connect(this.context.destination);
          source.onended = () => {
            source.disconnect(); gain.disconnect(); this.voices.delete(voice);
            if (this.voices.size === 0 && generation === this.generation) {
              this.playing = false;
              this.events = [];
              onComplete();
            }
          };
          // Every hit has its own source; never choke previous hits (including l).
          source.start(at);
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
      this.events = [];
      for (const { source, gain } of this.voices) {
        source.onended = null;
        gain.disconnect();
        source.stop(this.context.currentTime);
        source.disconnect();
      }
      this.voices.clear();
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
  globalThis.HelloRhythm = { Recorder, RhythmPlayer, SampleBank, PlaybackVisual, SPACING, INSTRUMENTS, spacingFor, activeIndices, embeddedBytes };
})();
