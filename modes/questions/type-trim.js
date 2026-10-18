/* Presentation-only edge silence policy. Source records and interior gaps stay
   intact. One derived score feeds both the audio plan and the visual renderer. */
(() => {
  'use strict';
  const C=HelloQuestionConfig,K=HelloTypeConfig;
  function compile(answer,expression){
    const raw=expression==='dots'?HelloQuestionDots.compile(answer):answer.morse;
    const active=expression==='dots'?raw.events:raw.segments.filter(s=>!s.kind.endsWith('silence'));
    const first=active.reduce((value,e)=>Math.min(value,e.atMs),Infinity);
    const last=active.reduce((value,e)=>Math.max(value,e.atMs+e.durationMs),0);
    const leadingRemovedMs=active.length?Math.max(0,first-K.edgeLeadingMaxMs):0;
    const trailingRemovedMs=Math.max(0,raw.durationMs-last-K.edgeTrailingMaxMs);
    const end=raw.durationMs-trailingRemovedMs;
    const events=raw.events.map(e=>({...e,atMs:e.atMs-leadingRemovedMs,
      ...(expression==='morse'?{x:e.x-leadingRemovedMs*C.pixelsPerMs}:{})}));
    const result={...raw,events,durationMs:Math.max(0,end-leadingRemovedMs),
      edgeTrim:{policy:'edge-silence-v1',leadingRemovedMs,trailingRemovedMs,originalDurationMs:raw.durationMs}};
    if(expression==='morse'){
      result.segments=raw.segments.flatMap(s=>{
        const from=Math.max(s.atMs,leadingRemovedMs),to=Math.min(s.atMs+s.durationMs,end);
        if(to<=from)return [];
        const ratio=s.width/s.durationMs;
        return [{...s,atMs:from-leadingRemovedMs,durationMs:to-from,
          x:s.x+(from-s.atMs)*ratio-leadingRemovedMs*C.pixelsPerMs,width:(to-from)*ratio}];
      });
      result.width=Math.max(0,raw.width-(leadingRemovedMs+trailingRemovedMs)*C.pixelsPerMs);
    }
    return result;
  }
  globalThis.HelloTypeTrim={compile};
})();
