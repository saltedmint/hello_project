(() => {
  'use strict';
  function capture(recorder, id, handwriting, volume) {
    if (!recorder.complete) return null;
    const original = [...recorder.times], origin = original[0];
    const result = { schemaVersion: 1, id, text: 'hello'.repeat(4), source: 'local',
      relativeTimesMs: original.map(time => time - origin), durationMs: original.at(-1) - origin,
      raw: { clock: 'performance.now', keyDownTimesMs: original, enterTimesMs: recorder.bars.map(bar => bar.enterTime) },
      a: { bars: recorder.bars.map(bar => ({ endMs: bar.durationMs })) } };
    if (handwriting.melody) result.a.handwriting = { strokes: JSON.parse(JSON.stringify(handwriting.recorder.strokes)), volume };
    return HelloRecording.validate(result);
  }
  function prepare(value) {
    const record = HelloRecording.validate(value);
    if (record.text !== 'hello'.repeat(4) || !Array.isArray(record.a?.bars) || record.a.bars.length !== 4) {
      throw new Error('A에서는 네 마디 hello와 a.bars의 Enter 정보가 있는 기록을 사용합니다. 공통 기록은 B 화면에서 확인할 수 있습니다.');
    }
    const recorder = new HelloTyping.Recorder();
    const original = record.raw?.keyDownTimesMs || record.relativeTimesMs;
    for (let index = 0; index < 4; index++) {
      const bar = recorder.bars[index], offset = index * 5, end = record.a.bars[index]?.endMs;
      bar.times = original.slice(offset, offset + 5);
      const wordLength = bar.times[4] - bar.times[0];
      if (!Number.isFinite(end) || end < wordLength || end > 3600000) throw new Error('마디의 Enter 시각은 마지막 o 뒤여야 합니다.');
      bar.enterTime = bar.times[0] + end;
      if (index < 3 && bar.enterTime > original[offset + 5]) throw new Error('마디 종료는 다음 마디 첫 h보다 늦을 수 없습니다.');
      if (record.raw?.enterTimesMs && (record.raw.enterTimesMs.length !== 4 || !HelloRecording.near(bar.enterTime, record.raw.enterTimesMs[index]))) throw new Error('Enter 원본 시각과 마디 정보가 다릅니다.');
    }
    recorder.completedBars = 4;
    let strokes = [], melody = null, volume = .07;
    if (record.a.handwriting !== undefined) {
      const data = record.a.handwriting;
      if (!data || !Array.isArray(data.strokes) || !data.strokes.length || data.strokes.length > 1000 || !Number.isFinite(data.volume) || data.volume < 0 || data.volume > .15) throw new Error('손글씨 정보가 올바르지 않습니다.');
      let count = 0;
      strokes = data.strokes.map(stroke => {
        if (!Array.isArray(stroke) || stroke.length < 2) throw new Error('손글씨 획이 올바르지 않습니다.');
        return stroke.map((point, index) => {
          count++;
          const expected = index === 0 ? 'down' : index === stroke.length - 1 ? 'up' : 'move';
          if (!point || point.kind !== expected || ![point.x, point.y, point.time].every(Number.isFinite) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 || point.time < 0 || count > 50000) throw new Error('손글씨 좌표·시각·이벤트가 올바르지 않습니다.');
          return { x: point.x, y: point.y, time: point.time, kind: point.kind };
        });
      });
      melody = HelloHandwriting.convert(strokes, recorder.relative.at(-1)); volume = data.volume;
    }
    return { record, recorder, strokes, melody, volume };
  }
  globalThis.HelloOrchestraData = { capture, prepare };
})();
