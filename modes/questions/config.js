/* Change question wording here, increasing its version when wording changes. */
(() => {
  'use strict';
  globalThis.HelloQuestionConfig = Object.freeze({
    schemaVersion:2, recordingVersion:'dom-typing-v2', transformVersion:1,
    storageKey:'hello.three-questions.v2', maxParticipants:20, maxCharacters:120,
    maxFileBytes:16*1024*1024, unitMs:80, unitPx:4, pixelsPerMs:.018,
    questionGapMs:800, dotDurationMs:80,
    questions:Object.freeze([
      {id:'Q1',version:1,ko:'지금 입고 있는 옷은 무슨 색인가요?',en:'What color are the clothes you are wearing?'},
      {id:'Q2',version:1,ko:'최근 고마웠던 순간은 언제였나요?',en:'What is a recent moment you felt grateful for?'},
      {id:'Q3',version:1,ko:'누군가에게 아직 전하지 못한 말이 있다면, 무엇인가요?',en:'What is something you have not yet been able to say to someone?'}
    ])
  });
})();
