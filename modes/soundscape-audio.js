/* Shared audio clock, bounded lookahead, cycle-boundary changes. */
(() => {
  'use strict';
  const SETTINGS = Object.freeze({attack:.03,release:.5,minimumPeriod:12,tailGap:2,lookahead:.15,tickMs:25,joinFade:.8,masterMax:.65,defaultVolume:.65,layerGain:.4,notePeak:.32});
  const periodFor = records => Math.max(SETTINGS.minimumPeriod,...records.map(r => r.durationMs/1000+SETTINGS.tailGap));
  function plan(records, start = 0) {
    const period = periodFor(records);
    const events = records.flatMap(record => {
      const offset = record.b.startFraction * Math.max(0,period-record.durationMs/1000-SETTINGS.attack-SETTINGS.release-.01);
      return Array.from(record.text).flatMap((letter,index) => letter === ' ' ? [] : [{id:record.id,index,time:start+offset+record.relativeTimesMs[index]/1000,midi:record.b.midi,pan:record.b.pan}]);
    }).sort((a,b) => a.time-b.time);
    return {start,end:start+period,period,records,events,cursor:0};
  }
  class Player {
    constructor() { this.context = null; this.running = false; this.desired = []; this.voices = new Set(); this.layers = new Map(); this.timer = null; this.current = null; this.next = null; this.generation = 0; this.volume = SETTINGS.defaultVolume; }
    setRecords(records) {
      this.desired = records.map(HelloSoundscapeData.validate);
      if (this.running && this.next && this.context.currentTime < this.next.start) {
        const boundary = this.next.start;
        for (const voice of [...this.voices]) if (voice.cycleStart === boundary) this.dispose(voice);
        for (const layer of this.layers.values()) layer.gain.gain.cancelScheduledValues(boundary);
        this.next = null;
      }
    }
    setVolume(value) {
      this.volume = Math.max(0,Math.min(1,Number(value)));
      if (this.master) this.master.gain.setTargetAtTime(this.volume*SETTINGS.masterMax,this.context.currentTime,.08);
    }
    async start(records) {
      this.stop(); const generation = this.generation;
      this.setRecords(records);
      if (!this.desired.length) throw new Error('먼저 기록을 풍경에 보태 주세요.');
      this.context ||= HelloAudio.createContext();
      await HelloAudio.ensureRunning(this.context);
      if (generation !== this.generation) return;
      this.connectOutput();
      this.running = true; this.current = plan(this.desired,this.context.currentTime+.06);
      this.configureLayers(this.current); this.tick();
      this.timer = setInterval(() => this.tick(),SETTINGS.tickMs);
    }
    connectOutput() {
      this.master = this.context.createGain(); this.master.gain.value = this.volume*SETTINGS.masterMax;
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -14; this.compressor.knee.value = 18; this.compressor.ratio.value = 6;
      this.compressor.attack.value = .003; this.compressor.release.value = .25;
      this.master.connect(this.compressor).connect(this.context.destination);
    }
    configureLayers(cycle) {
      const target = SETTINGS.layerGain/Math.sqrt(Math.max(1,cycle.records.length)), ids = new Set(cycle.records.map(r=>r.id));
      for (const record of cycle.records) {
        let layer = this.layers.get(record.id);
        if (!layer) {
          const gain = this.context.createGain(), pan = this.context.createStereoPanner();
          gain.gain.value = 0; pan.pan.value = record.b.pan; gain.connect(pan).connect(this.master);
          layer = {gain,pan}; this.layers.set(record.id,layer);
        }
        layer.pan.pan.setValueAtTime(record.b.pan,cycle.start);
        layer.gain.gain.setTargetAtTime(target,cycle.start,SETTINGS.joinFade/3);
      }
      for (const [id,layer] of this.layers) if (!ids.has(id)) layer.gain.gain.setTargetAtTime(0,cycle.start,.15);
    }
    dispose(voice) {
      voice.source.onended = null;
      try { voice.source.stop(); } catch(error) { if(error.name!=='InvalidStateError') throw error; }
      voice.source.disconnect(); voice.gain.disconnect(); this.voices.delete(voice);
    }
    schedule(event, cycleStart) {
      const source = this.context.createOscillator(), gain = this.context.createGain();
      source.type = 'sine'; source.frequency.value = 440 * 2 ** ((event.midi-69)/12);
      const start = Math.max(event.time,this.context.currentTime);
      gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(SETTINGS.notePeak,start+SETTINGS.attack);
      gain.gain.exponentialRampToValueAtTime(.0001,start+SETTINGS.attack+SETTINGS.release);
      source.connect(gain).connect(this.layers.get(event.id).gain);
      const voice = {source,gain,cycleStart,id:event.id}; this.voices.add(voice);
      source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(voice); };
      source.start(start); source.stop(start+SETTINGS.attack+SETTINGS.release+.01);
    }
    tick() {
      if (!this.running) return;
      const now = this.context.currentTime;
      if (now >= this.current.end) {
        this.current = this.next || plan(this.desired,this.current.end); this.next = null;
        if (now >= this.current.end) {
          const updated = plan(this.desired,this.current.start);
          const skipped = Math.floor((now-updated.start)/updated.period);
          this.current = plan(this.desired,updated.start+skipped*updated.period);
        }
        this.configureLayers(this.current);
      }
      if (!this.next && now+SETTINGS.lookahead >= this.current.end) {
        this.next = plan(this.desired,this.current.end); this.configureLayers(this.next);
      }
      for (const cycle of [this.current,this.next].filter(Boolean)) {
        while(cycle.cursor < cycle.events.length && cycle.events[cycle.cursor].time <= now+SETTINGS.lookahead) {
          const event = cycle.events[cycle.cursor++];
          if (event.time >= now-.035) this.schedule(event,cycle.start);
        }
      }
      const retained = new Set([this.current,this.next].filter(Boolean).flatMap(c=>c.records.map(r=>r.id)));
      for (const [id,layer] of this.layers) if (!retained.has(id) && ![...this.voices].some(v=>v.id===id)) {
        layer.gain.disconnect(); layer.pan.disconnect(); this.layers.delete(id);
      }
    }
    highlights() {
      if (!this.running) return [];
      const now = this.context.currentTime;
      return [this.current,this.next].filter(Boolean).flatMap(c=>c.events.filter(e=>now>=e.time&&now<e.time+.16));
    }
    stop() {
      this.generation++; this.running = false; clearInterval(this.timer); this.timer = null;
      for (const voice of [...this.voices]) this.dispose(voice);
      for (const layer of this.layers.values()) { layer.gain.disconnect(); layer.pan.disconnect(); }
      this.layers.clear(); this.master?.disconnect(); this.compressor?.disconnect(); this.master = null; this.compressor = null;
      this.current = null; this.next = null;
    }
    diagnostics() { return {running:this.running,voices:this.voices.size,timer:this.timer,period:this.current?.period,nextPeriod:this.next?.period,events:this.current?.events.length||0}; }
  }
  globalThis.HelloSoundscapeAudio = {SETTINGS,periodFor,plan,Player};
})();
