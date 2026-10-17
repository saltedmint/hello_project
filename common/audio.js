(() => {
  'use strict';
  const createContext = () => new (window.AudioContext || window.webkitAudioContext)();
  function ensureRunning(context) {
    const check = () => { if (context.state !== 'running') throw new Error('오디오 장치를 사용할 수 없습니다.'); };
    if (context.state === 'suspended') return context.resume().then(check);
    check(); return null;
  }
  function stopVoices(voices, context) {
    for (const { source, gain } of voices) {
      source.onended = null; gain.disconnect();
      try { source.stop(context.currentTime); }
      catch (error) { if (error.name !== 'InvalidStateError') throw error; }
      source.disconnect();
    }
    voices.clear();
  }
  globalThis.HelloAudio = { createContext, ensureRunning, stopVoices };
})();
