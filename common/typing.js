/* Shared hello keydown recording, independent of either sound mode. */
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

  globalThis.HelloTyping = { BarRecorder, Recorder };
})();
