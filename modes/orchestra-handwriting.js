(() => {
  'use strict';
  const NOTES = Object.freeze([
    { name: 'C4', midi: 60 }, { name: 'D4', midi: 62 }, { name: 'E4', midi: 64 },
    { name: 'G4', midi: 67 }, { name: 'A4', midi: 69 }, { name: 'C5', midi: 72 }
  ]);
  const clamp = value => Math.max(0, Math.min(1, value));
  const zoneFor = y => Math.min(5, Math.floor((1 - clamp(y)) * 6));
  const frequencyFor = midi => 440 * 2 ** ((midi - 69) / 12);

  class HandwritingRecorder {
    constructor() { this.clear(); }
    clear() { this.strokes = []; this.active = null; }
    point(x, y, time, kind) { return { x: clamp(x), y: clamp(y), time, kind }; }
    down(x, y, time) {
      if (this.active) return;
      this.active = [this.point(x, y, time, 'down')];
      this.strokes.push(this.active);
    }
    move(x, y, time) { if (this.active) this.active.push(this.point(x, y, time, 'move')); }
    up(x, y, time) {
      if (!this.active) return;
      this.active.push(this.point(x, y, time, 'up')); this.active = null;
    }
    cancel() { if (this.active) this.strokes.pop(); this.active = null; }
  }

  function convert(strokes, targetMs) {
    if (!Number.isFinite(targetMs) || targetMs <= 0) throw new Error('타이핑 길이가 0이거나 올바르지 않습니다. 다시 입력해 주세요.');
    if (!strokes.length || strokes.some(stroke => stroke.length < 2 || stroke.at(-1).kind !== 'up')) {
      throw new Error('드래그로 글씨를 쓴 뒤 펜을 떼고 완료해 주세요.');
    }
    const points = strokes.flat(), origin = points[0].time, duration = points.at(-1).time - origin;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('필기 시간이 너무 짧습니다. 드래그로 다시 써 주세요.');
    let previous = -Infinity;
    for (const point of points) {
      if (![point.x, point.y, point.time].every(Number.isFinite) || point.time < previous) throw new Error('필기 시각이나 좌표가 올바르지 않습니다. 다시 써 주세요.');
      previous = point.time;
    }
    const moved = strokes.some(stroke => stroke.some(point => Math.hypot(point.x - stroke[0].x, point.y - stroke[0].y) > .005));
    if (!moved) throw new Error('점만 찍은 입력은 선율로 만들 수 없습니다. 드래그로 선을 그려 주세요.');
    const scale = targetMs / duration, notes = [], paths = [];
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('필기와 타이핑 시간 비율이 올바르지 않습니다. 다시 입력해 주세요.');
    for (const [strokeIndex, stroke] of strokes.entries()) {
      let smoothY = stroke[0].y, zone = zoneFor(smoothY), started = stroke[0].time;
      let lastTime = started;
      const path = [];
      const finishNote = end => {
        if (end > started) notes.push({ midi: NOTES[zone].midi, name: NOTES[zone].name,
          startMs: (started - origin) * scale, endMs: (end - origin) * scale, strokeIndex });
      };
      for (const [index, point] of stroke.entries()) {
        // Time-based low-pass avoids dependence on pointer event frequency.
        const alpha = 1 - Math.exp(-(point.time - lastTime) / 25);
        smoothY += alpha * (point.y - smoothY); lastTime = point.time;
        path.push({ x: point.x, y: point.y, atMs: (point.time - origin) * scale });
        if (index === 0 || point.kind === 'up') continue;
        // 2% canvas-height hysteresis beyond the current band's boundary.
        const pitchPosition = 1 - smoothY;
        if (pitchPosition > (zone + 1) / 6 + .02 || pitchPosition < zone / 6 - .02) {
          const nextZone = zoneFor(smoothY);
          if (nextZone !== zone) { finishNote(point.time); started = point.time; zone = nextZone; }
        }
      }
      finishNote(stroke.at(-1).time);
      paths.push(path);
    }
    if (!notes.length) throw new Error('들을 수 있는 획이 없습니다. 조금 더 천천히 써 주세요.');
    return { notes, paths, targetMs, handwritingMs: duration, scale, short: targetMs < 500 };
  }

  function cursorAt(paths, timeMs) {
    for (const path of paths) {
      if (timeMs < path[0].atMs || timeMs > path.at(-1).atMs) continue;
      for (let i = 1; i < path.length; i++) {
        if (path[i].atMs < timeMs) continue;
        const a = path[i - 1], b = path[i], span = b.atMs - a.atMs;
        const fraction = span > 0 ? (timeMs - a.atMs) / span : 0;
        return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
      }
      return path.at(-1);
    }
    return null;
  }

  class HandwritingCanvas {
    constructor(canvas, onEdit) {
      this.canvas = canvas; this.onEdit = onEdit; this.recorder = new HandwritingRecorder();
      this.pointerId = null; this.locked = false; this.melody = null; this.frame = null;
      this.generation = 0;
      const position = event => {
        const rect = canvas.getBoundingClientRect();
        return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, performance.now()];
      };
      canvas.addEventListener('pointerdown', event => {
        if (this.locked || this.pointerId !== null || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); this.onEdit(); this.melody = null;
        this.pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId);
        this.recorder.down(...position(event)); this.draw();
      });
      canvas.addEventListener('pointermove', event => {
        if (event.pointerId !== this.pointerId) return;
        event.preventDefault(); this.recorder.move(...position(event)); this.draw();
      });
      canvas.addEventListener('pointerup', event => {
        if (event.pointerId !== this.pointerId) return;
        this.recorder.up(...position(event)); this.pointerId = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        this.draw();
      });
      const cancel = () => { if (this.pointerId !== null) { this.recorder.cancel(); this.pointerId = null; this.draw(); } };
      canvas.addEventListener('pointercancel', cancel);
      canvas.addEventListener('lostpointercapture', cancel);
      this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(canvas);
      this.draw();
    }
    draw(cursor = null) {
      const rect = this.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
      const dpr = devicePixelRatio || 1;
      const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
      const context = this.canvas.getContext('2d'); context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      context.font = '11px sans-serif'; context.fillStyle = '#869086'; context.strokeStyle = '#e0e5db'; context.lineWidth = 1;
      for (let band = 0; band < 6; band++) {
        const y = band * rect.height / 6;
        if (band > 0) { context.beginPath(); context.moveTo(0, y); context.lineTo(rect.width, y); context.stroke(); }
        context.fillText(NOTES[5 - band].name, 10, y + 19);
      }
      context.strokeStyle = '#315f47'; context.lineWidth = 2.5; context.lineCap = 'round'; context.lineJoin = 'round';
      for (const stroke of this.recorder.strokes) {
        context.beginPath(); stroke.forEach((point, i) => {
          context[i === 0 ? 'moveTo' : 'lineTo'](point.x * rect.width, point.y * rect.height);
        }); context.stroke();
      }
      if (cursor) {
        context.fillStyle = '#bb4d27'; context.beginPath(); context.arc(cursor.x * rect.width, cursor.y * rect.height, 5, 0, Math.PI * 2); context.fill();
      }
    }
    clear() {
      this.stop();
      const pointer = this.pointerId; this.pointerId = null;
      if (pointer !== null && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
      this.recorder.clear(); this.locked = false; this.melody = null; this.draw();
    }
    cancelActive() {
      if (this.pointerId === null) return;
      const pointer = this.pointerId; this.pointerId = null; this.recorder.cancel();
      if (this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
      this.draw();
    }
    finish(targetMs) {
      if (this.pointerId !== null) throw new Error('드래그를 마치고 펜을 떼어 주세요.');
      const melody = convert(this.recorder.strokes, targetMs);
      this.melody = melody; this.locked = true; this.draw(); return melody;
    }
    start(player) {
      this.stop(); const generation = this.generation;
      const tick = () => {
        if (generation !== this.generation) return;
        if (!player.playing) { this.stop(); return; }
        let time = player.context.currentTime - player.startTime;
        if (time >= 0 && player.looping) time %= player.loopPeriod;
        this.draw(this.melody && time >= 0 ? cursorAt(this.melody.paths, time * 1000) : null);
        this.frame = requestAnimationFrame(tick);
      };
      tick();
    }
    stop() { this.generation++; if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.draw(); }
  }
  globalThis.HelloHandwriting = { NOTES, zoneFor, frequencyFor, HandwritingRecorder, convert, cursorAt, HandwritingCanvas };
})();
