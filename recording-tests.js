globalThis.runRecordingTests = async ({ check, assert, same, fourRecord }) => {
  const capture = HelloOrchestraData.capture(fourRecord, 'test-raw-record', { melody: null }, .07);
  const copy = value => JSON.parse(JSON.stringify(value));
  const invalid = value => { try { HelloRecording.validate(value); return false; } catch { return true; } };
  check('공통 JSON: 버전·ID·문자·글자별 원본 상대 시각·원본 길이', () => {
    assert(capture.schemaVersion === 1 && capture.text === 'hello'.repeat(4));
    same(capture.relativeTimesMs, fourRecord.times.map(time => time - fourRecord.times[0]));
    assert(capture.durationMs === capture.relativeTimesMs.at(-1));
    assert(capture.durationMs !== fourRecord.durationMs);
    same(capture.raw.keyDownTimesMs, fourRecord.times);
  });
  check('공통 JSON: 저장/파싱/복원은 원본 시각·Enter와 A 재생 타이밍 모두 보존', () => {
    const parsed = HelloRecording.parse(JSON.stringify(capture));
    const restored = HelloOrchestraData.prepare(parsed);
    same(restored.recorder.times, fourRecord.times); same(restored.recorder.relative, fourRecord.relative);
    same(restored.recorder.bars.map(bar => bar.enterTime), fourRecord.bars.map(bar => bar.enterTime));
  });
  check('공통 JSON: 소수점 원본 시각과 Enter를 재계산으로 덮어쓰지 않음', () => {
    const fractional = copy(capture);
    fractional.raw.keyDownTimesMs = fractional.raw.keyDownTimesMs.map(time => time + .1234567);
    fractional.raw.enterTimesMs = fractional.raw.enterTimesMs.map(time => time + .1234567);
    const restored = HelloOrchestraData.prepare(fractional).recorder;
    same(restored.times, fractional.raw.keyDownTimesMs);
    same(restored.bars.map(bar => bar.enterTime), fractional.raw.enterTimesMs);
  });
  check('공통 JSON: 최소 필드의 한 hello는 B에서 재사용 가능 · A 전용 메타는 요구하지 않음', () => {
    const basic = { schemaVersion:1, id:'single-hello', text:'hello', relativeTimesMs:[0,180,420,570,900], durationMs:900 };
    assert(HelloRecording.validate(basic).source === 'imported');
    let unsupported = false; try { HelloOrchestraData.prepare(basic); } catch { unsupported = true; }
    assert(unsupported);
  });
  check('공통 JSON: 형식·버전·ID·글자/이벤트 수 검증', () => {
    const bad = [null, [], { ...capture, schemaVersion:2 }, { ...capture, id:'' }, { ...capture, text:'' },
      { ...capture, relativeTimesMs:[0] }, { ...capture, text:'hello\n' }];
    assert(bad.every(invalid));
  });
  check('공통 JSON: 유한한 숫자·순서·첫 0·마지막 길이 검증 · 숫자 문자열 거부', () => {
    const badTimes = [[1,2,3,4,5], [0,1,Infinity,3,4], [0,1,NaN,3,4], [0,3,2,4,5], [0,1,'2',3,4], [0,-1,2,3,4]];
    const basic = { schemaVersion:1,id:'bad-times',text:'hello',durationMs:4 };
    assert(badTimes.every(relativeTimesMs => invalid({ ...basic,relativeTimesMs })));
    assert(invalid({ ...capture,durationMs:-1 }) && invalid({ ...capture,durationMs:NaN }));
  });
  check('공통 JSON: 원본 시각/상대 시각 불일치 검증 · 원본 입력 불변', () => {
    const bad = copy(capture); bad.raw.keyDownTimesMs[1] += 20;
    assert(invalid(bad));
    const snapshot = JSON.stringify(capture); HelloRecording.validate(capture); assert(snapshot === JSON.stringify(capture));
  });
  check('공통 JSON: 잘못된 JSON과 과도한 크기 거부', () => {
    for (const value of ['{', 'null', 'x'.repeat(HelloRecording.MAX_FILE_BYTES + 1)]) {
      let rejected = false; try { HelloRecording.parse(value); } catch { rejected = true; } assert(rejected);
    }
  });
  check('A 데이터: Enter가 o 이전/다음 마디 이후이거나 원본과 다르면 거부', () => {
    const bad1 = copy(capture); bad1.a.bars[0].endMs = 1;
    const bad2 = copy(capture); bad2.a.bars[0].endMs = 50000;
    const bad3 = copy(capture); bad3.raw.enterTimesMs[0] += 1;
    for (const value of [bad1,bad2,bad3]) {
      let rejected = false; try { HelloOrchestraData.prepare(value); } catch { rejected = true; } assert(rejected);
    }
  });
  check('A 데이터: 선택 손글씨 원본·음량 JSON 왕복과 선율 재생성', () => {
    const withInk = copy(capture); withInk.a.handwriting = { volume:.03,strokes:[
      [{x:.1,y:.9,time:100,kind:'down'},{x:.8,y:.9,time:500,kind:'up'}],
      [{x:.8,y:.1,time:700,kind:'down'},{x:.1,y:.1,time:1100,kind:'up'}]
    ] };
    const prepared = HelloOrchestraData.prepare(HelloRecording.parse(JSON.stringify(withInk)));
    assert(prepared.volume === .03 && prepared.melody.notes.length === 2);
    same(prepared.strokes, withInk.a.handwriting.strokes);
    assert(prepared.melody.targetMs === fourRecord.relative.at(-1));
  });
  check('A 데이터: 잘못된 선택 손글씨도 적용 전에 거부', () => {
    const bad = copy(capture); bad.a.handwriting = { volume:Infinity,strokes:[] };
    let rejected = false; try { HelloOrchestraData.prepare(bad); } catch { rejected = true; } assert(rejected);
  });
  const example = HelloRecording.parse(await (await fetch('examples/typing-example.json')).text());
  check('예시 파일: 실제 참여자 아님을 선언 · 공통/A 스키마 모두 유효', () => {
    assert(example.source === 'example' && example.id.includes('not-a-participant'));
    assert(HelloOrchestraData.prepare(example).recorder.durationMs === 4800);
  });
};
