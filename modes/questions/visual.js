(() => {
  'use strict';
  const C=HelloQuestionConfig;
  const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
  function row(record,answer,{original=false,current=false,reveal=false,index=0,expression='morse',zoom=1,score:overrideScore=null}={}) {
    const item=element('div',`q-row${current?' q-current':''}`);item.dataset.participant=record.id;item.dataset.question=answer.questionId;
    const label=element('span','q-row-label',`${String(index+1).padStart(2,'0')} ${record.source==='synthetic'?'합성':current?'나':'관객'}`);
    label.title=`${record.source==='synthetic'?'발표용 합성 예시 · 실제 관객 아님':`관객 ${index+1}`} · ${answer.questionId} v${answer.questionVersion} · ${answer.question.ko}`;
    const dots=expression==='dots',score=overrideScore||(dots?HelloQuestionDots.compile(answer):answer.morse);
    const scroll=element('div','q-row-scroll'),track=element('div','q-track');track.style.width=`${Math.max(1,dots?score.durationMs*C.pixelsPerMs*zoom:original?answer.submittedAtMs*C.pixelsPerMs:score.width)}px`;
    track.setAttribute('aria-label',`${answer.questionId} ${record.source==='synthetic'?'발표용 합성 예시':'관객 응답'} ${dots?'타이핑 점':'모스'}와 침묵`);
    if(dots){
      for(const event of score.events){const point=element('i','q-typing-dot');point.style.left=`${event.atMs*C.pixelsPerMs*zoom}px`;point.dataset.activity=event.activityIndex;point.dataset.at=event.atMs;track.append(point);}
    }else if(original){
      for(const char of answer.characters){const point=element('i','q-original-point');point.style.left=`${char.atMs*C.pixelsPerMs}px`;point.dataset.char=char.index;track.append(point);}
      for(const focus of answer.focusLoss){const band=element('span','q-focus-band');band.style.left=`${focus.fromMs*C.pixelsPerMs}px`;band.style.width=`${Math.max(2,(focus.toMs-focus.fromMs)*C.pixelsPerMs)}px`;band.title=`포커스 이탈 ${(focus.toMs-focus.fromMs).toFixed(0)}ms · ${focus.reason}`;track.append(band);}
    }else for(const segment of score.segments){
      const mark=element('span',`q-segment q-${segment.kind}`);mark.style.left=`${segment.x}px`;mark.style.width=`${segment.width}px`;
      if(segment.kind==='tone'){mark.classList.add(segment.symbol==='.'?'q-dot':'q-dash');mark.dataset.char=segment.charIndex;mark.dataset.at=segment.atMs;}
      if(segment.kind==='unsupported'){mark.textContent='◇';mark.title=`미지원 문자: ${segment.char}`;}
      if(segment.kind.endsWith('silence'))mark.title=`${segment.kind}: ${segment.durationMs.toFixed(0)}ms`;
      track.append(mark);
    }
    const cursor=element('i','q-playhead');cursor.hidden=true;track.append(cursor);scroll.append(track);item.append(label,scroll);
    if(dots)item.append(element('small','q-timing-source',score.label));
    if(reveal){const text=element('p','q-revealed',answer.text);item.append(text);}
    return item;
  }
  function review(record) {
    const details=element('details','q-review-details'),summary=element('summary','','내 원문과 기록 확인');details.append(summary);
    for(const answer of record.answers){
      const article=element('article','');article.append(element('h3','',`${answer.questionId} · 질문 v${answer.questionVersion}`),element('p','q-review-meta',answer.question.ko),element('p','q-review-meta',answer.question.en),element('p','q-own-text',answer.text));
      const info=`첫 텍스트 활동 ${(answer.firstActivityMs/1000).toFixed(2)}초 · 마지막 활동 ${(answer.lastTextInputMs/1000).toFixed(2)}초 · 제출 ${(answer.submittedAtMs/1000).toFixed(2)}초 · 원본 ${(answer.submittedAtMs/1000).toFixed(2)}초 / 모스 ${(answer.morse.durationMs/1000).toFixed(2)}초 · 포커스 이탈 ${answer.focusLoss.length}구간`;
      article.append(element('p','q-review-meta',info));
      const log=element('details',''),logSummary=element('summary','','문자 시각 · 수정 · 포커스 로그');log.append(logSummary,element('pre','',JSON.stringify({recordingVersion:answer.recordingVersion,typingActivities:answer.typingActivities,characters:answer.characters,events:answer.events,focusLoss:answer.focusLoss},null,2)));article.append(log);details.append(article);
    }
    return details;
  }
  globalThis.HelloQuestionVisual={row,review,element};
})();
