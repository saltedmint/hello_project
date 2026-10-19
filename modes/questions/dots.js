/* Raw question-relative activity times. Never reconstruct missing IME keys. */
(() => {
  'use strict';
  function compile(answer){
    const modern=['dom-typing-v2','dom-activity-v3'].includes(answer.recordingVersion);
    const source=modern?answer.typingActivities:answer.characters.slice().sort((a,b)=>a.atMs-b.atMs);
    const events=source.map((event,index)=>({atMs:event.atMs,durationMs:HelloQuestionConfig.dotDurationMs,activityIndex:index}));
    return {events,durationMs:Math.max(answer.submittedAtMs,...events.map(e=>e.atMs+e.durationMs)),
      originalDurationMs:answer.submittedAtMs,label:modern?'입력 활동 기록 사용':'문자 단위 기록 사용'};
  }
  globalThis.HelloQuestionDots={compile};
})();
