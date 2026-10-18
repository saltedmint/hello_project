(() => {
  'use strict';
  const C=HelloQuestionConfig,K=HelloTypeConfig,D=HelloQuestionData;
  function questionScore(question){
    let at=0,space=0;const events=[];
    for(const char of Array.from(question.ko)){
      if(/\s/u.test(char)){space+=K.questionSpaceMs;continue;}
      if(events.length)at+=K.questionStepMs+space;space=0;
      events.push({atMs:at,durationMs:K.questionToneMs,activityIndex:events.length});
    }
    return {kind:'generated-question-dots',source:'question-rule-v1',questionId:question.id,
      events,durationMs:events.length?at+K.questionToneMs:0};
  }
  function build(own,records,{expression,includeDemo}){
    if(!['dots','morse'].includes(expression))throw Error('답변 표현을 확인해 주세요.');
    const current=D.validate(own),unique=new Map();
    for(const value of records){const record=D.validate(value);if(includeDemo||record.source!=='synthetic')unique.set(record.id,record);}
    unique.set(current.id,current); // The current audience is always present exactly once.
    const snapshot=D.clone([...unique.values()]),segments=[],events=[];let offset=0;
    function append(kind,question,rows,plan){
      const durationMs=plan.events.reduce((end,e)=>Math.max(end,e.atMs+e.durationMs),plan.durationMs)+K.tailMs;
      const segment={kind,questionId:question.id,atMs:offset,durationMs,rows,plan};segments.push(segment);
      for(const event of plan.events)events.push({...event,layerCount:plan.layers,atMs:offset+event.atMs});
      offset+=durationMs+K.transitionMs;
    }
    for(const question of C.questions){
      const score=questionScore(question),id=`generated-${question.id}`;
      append('question',question,[{id,score,expression:'dots'}],{durationMs:score.durationMs,events:score.events.map(e=>({...e,participantId:id,questionId:question.id,midi:72,pan:0})),layers:1});
      for(const [kind,people] of [['own',[current]],['together',snapshot]]){
        const scoreFor=answer=>HelloTypeTrim.compile(answer,expression);
        const plan=HelloQuestionAudio.buildPlan(people,{questionId:question.id,speed:1,expression,scoreFor});
        const rows=people.map(record=>{const answer=record.answers.find(a=>a.questionId===question.id);return {id:record.id,record,answer,score:scoreFor(answer),expression};});
        append(kind,question,rows,plan);
      }
    }
    return {segments,snapshot,expression,events:events.sort((a,b)=>a.atMs-b.atMs),groups:[],speed:1,
      layers:Math.max(1,snapshot.length),durationMs:offset-K.transitionMs};
  }
  function locate(sequence,elapsed){
    for(let i=0;i<sequence.segments.length;i++){
      const segment=sequence.segments[i],end=segment.atMs+segment.durationMs;
      if(elapsed<end)return {index:i,segment,position:Math.max(0,elapsed-segment.atMs),opacity:1};
      if(i<sequence.segments.length-1&&elapsed<sequence.segments[i+1].atMs){
        const progress=(elapsed-end)/K.transitionMs,next=progress>=.5;
        return {index:i+(next?1:0),segment:sequence.segments[i+(next?1:0)],position:next?0:segment.durationMs,opacity:Math.abs(progress*2-1),transition:true};
      }
    }
    return {index:8,segment:sequence.segments[8],position:sequence.segments[8].durationMs,opacity:1,ended:true};
  }
  globalThis.HelloTypeSequence={questionScore,build,locate};
})();
