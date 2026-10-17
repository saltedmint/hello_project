(() => {
  'use strict';
  const SETTINGS = Object.freeze({ sampleRate: 44100, channels: 2, repeatGapSeconds: .5,
    tailPaddingSeconds: .1, leadSeconds: HelloRhythm.PLAYBACK_LEAD_SECONDS,
    targetSeconds: 17.5, minSeconds: 15, maxSeconds: 20, maxRenderSeconds: 600 });

  function planExport({ relative, melody = null, bank, repeated = false }) {
    if (bank?.status !== 'ready') throw new Error('음원 준비가 끝난 뒤 다운로드해 주세요.');
    const events = HelloRhythm.buildEvents(relative, melody);
    let unitEnd = 0;
    for (const event of events) {
      if (event.kind === 'drum') {
        const buffer = bank.buffers.get(event.letter);
        if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error(`${event.letter} 샘플을 다시 불러와 주세요.`);
        unitEnd = Math.max(unitEnd, event.atMs / 1000 + buffer.duration);
      } else unitEnd = Math.max(unitEnd, event.endMs / 1000 + HelloRhythm.SYNTH.release);
    }
    const T = relative.at(-1) / 1000, period = T + SETTINGS.repeatGapSeconds;
    let count = 1;
    if (repeated && unitEnd <= SETTINGS.maxSeconds) {
      const low = Math.max(1, Math.ceil((SETTINGS.minSeconds - unitEnd) / period - 1e-9) + 1);
      const high = Math.max(1, Math.floor((SETTINGS.maxSeconds - unitEnd) / period + 1e-9) + 1);
      if (low <= high) {
        count = Math.max(low, Math.min(high, Math.round((SETTINGS.targetSeconds - unitEnd) / period) + 1));
      } else {
        // When whole units cannot fit the interval, choose the nearest length.
        const distance = n => Math.max(0, SETTINGS.minSeconds - ((n - 1) * period + unitEnd), (n - 1) * period + unitEnd - SETTINGS.maxSeconds);
        count = distance(high) <= distance(low) ? high : low;
      }
    }
    const contentSeconds = (count - 1) * period + unitEnd;
    const frames = Math.ceil((SETTINGS.leadSeconds + contentSeconds + SETTINGS.tailPaddingSeconds) * SETTINGS.sampleRate);
    if (!Number.isSafeInteger(frames) || frames <= 0 || frames > SETTINGS.sampleRate * SETTINGS.maxRenderSeconds) {
      throw new Error('브라우저 메모리를 위해 WAV는 10분 이내로 지원합니다. 더 짧게 입력해 주세요.');
    }
    return { events, count, period, T, unitEnd, contentSeconds, frames,
      durationSeconds: frames / SETTINGS.sampleRate, hasMelody: !!melody?.notes?.length,
      outsideTarget: repeated && (contentSeconds < SETTINGS.minSeconds || contentSeconds > SETTINGS.maxSeconds) };
  }

  function encodeWav(buffer) {
    const channels = buffer.numberOfChannels, frames = buffer.length, sampleRate = buffer.sampleRate;
    const size = frames * channels * 2;
    if (size > 0xffffffff - 36) throw new Error('WAV 파일 크기가 너무 큽니다.');
    const output = new ArrayBuffer(44 + size), view = new DataView(output);
    const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    write(0,'RIFF'); view.setUint32(4,36+size,true); write(8,'WAVE'); write(12,'fmt ');
    view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels,true);
    view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*channels*2,true);
    view.setUint16(32,channels*2,true); view.setUint16(34,16,true); write(36,'data'); view.setUint32(40,size,true);
    const data = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
    let peak = 0;
    for (const channel of data) for (const value of channel) {
      if (!Number.isFinite(value)) throw new Error('오디오 렌더 결과가 올바르지 않습니다. 다시 시도해 주세요.');
      peak = Math.max(peak, Math.abs(value));
    }
    const gain = peak > 1 ? .999 / peak : 1;
    let offset = 44;
    for (let i = 0; i < frames; i++) for (const channel of data) {
      const value = Math.max(-1, Math.min(1, channel[i] * gain));
      view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true); offset += 2;
    }
    return { wav: output, peak, gain };
  }

  async function renderExport(options, makeContext = (channels, frames, rate) => new OfflineAudioContext(channels, frames, rate)) {
    const plan = planExport(options);
    const volume = options.melodyVolume ?? .07;
    if (!Number.isFinite(volume) || volume < 0 || volume > .15) throw new Error('선율 음량이 올바르지 않습니다.');
    const context = makeContext(SETTINGS.channels, plan.frames, SETTINGS.sampleRate);
    let melodyDestination = null;
    if (plan.hasMelody) {
      melodyDestination = context.createGain(); melodyDestination.gain.setValueAtTime(volume, 0); melodyDestination.connect(context.destination);
    }
    for (let cycle = 0; cycle < plan.count; cycle++) {
      HelloRhythm.scheduleEvents(context, options.bank, plan.events, SETTINGS.leadSeconds + cycle * plan.period, { melodyDestination });
    }
    const buffer = await context.startRendering();
    return { ...encodeWav(buffer), plan };
  }

  function download(wav, filename) {
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  }
  globalThis.HelloWav = { SETTINGS, planExport, encodeWav, renderExport, download };
})();
