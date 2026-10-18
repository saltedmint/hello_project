(() => {
  'use strict';
  const C=HelloQuestionConfig;
  function buildPlan(records,{questionId='all',speed=1,expression='morse'}={}) {
    if(![.5,1,2,4].includes(speed))throw Error('공통 재생 배율이 올바르지 않습니다.');
    if(!['morse','dots'].includes(expression))throw Error('표현 모드를 확인해 주세요.');
    const score=answer=>expression==='dots'?HelloQuestionDots.compile(answer):answer.morse;
    const groups=[],events=[];let offset=0;
    const questions=C.questions.filter(q=>questionId==='all'||q.id===questionId);
    for(const question of questions){
      const answers=records.map(record=>({record,answer:record.answers.find(a=>a.questionId===question.id)})).filter(x=>x.answer);
      const durationMs=Math.max(0,...answers.map(x=>score(x.answer).durationMs))/speed;
      groups.push({questionId:question.id,atMs:offset,durationMs});
      for(const {record,answer} of answers)for(const event of score(answer).events)events.push({participantId:record.id,questionId:question.id,activityIndex:event.activityIndex,charIndex:event.charIndex,jamoIndex:event.jamoIndex,symbolIndex:event.symbolIndex,
        symbol:event.symbol,atMs:offset+event.atMs/speed,durationMs:event.durationMs/speed,midi:record.sound.midi,pan:record.sound.pan});
      offset+=durationMs+C.questionGapMs/speed;
    }
    return {events:events.sort((a,b)=>a.atMs-b.atMs),groups,durationMs:Math.max(0,offset-(groups.length?C.questionGapMs/speed:0)),speed,expression,layers:records.length};
  }
  class Player {
    constructor(){this.context=null;this.voices=new Set();this.panners=new Map();this.running=false;this.timer=null;this.plan=null;this.generation=0;this.volume=.65;}
    setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)));if(this.master)this.master.gain.setTargetAtTime(this.volume*.6,this.context.currentTime,.05);}
    connectOutput(layers){
      this.master=this.context.createGain();this.master.gain.value=this.volume*.6;
      this.compressor=this.context.createDynamicsCompressor();this.compressor.threshold.value=-16;this.compressor.knee.value=18;this.compressor.ratio.value=8;
      this.master.connect(this.compressor).connect(this.context.destination);this.layerGain=.45/Math.sqrt(Math.max(1,layers));
    }
    schedule(event,when,duration){
      let pan=this.panners.get(event.participantId);
      if(!pan){pan=this.context.createStereoPanner();pan.pan.value=event.pan;pan.connect(this.master);this.panners.set(event.participantId,pan);}
      const source=this.context.createOscillator(),gain=this.context.createGain();source.type='sine';source.frequency.value=440*2**((event.midi-69)/12);
      const attack=Math.min(.008,duration*.2),release=Math.min(.012,duration*.25),peak=.3*this.layerGain;
      gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(peak,when+attack);gain.gain.setValueAtTime(peak,when+duration-release);gain.gain.linearRampToValueAtTime(0,when+duration);
      source.connect(gain).connect(pan);const voice={source,gain};this.voices.add(voice);
      source.onended=()=>{source.disconnect();gain.disconnect();this.voices.delete(voice);};source.start(when);source.stop(when+duration);
    }
    async start(plan,onEnd=()=>{}) {
      this.stop();const generation=this.generation;if(!plan.layers)throw Error('먼저 세 질문을 마치거나 합성 예시를 불러와 주세요.');
      this.context ||= HelloAudio.createContext();await HelloAudio.ensureRunning(this.context);if(generation!==this.generation)return;
      this.plan=plan;this.onEnd=onEnd;this.startedAt=this.context.currentTime+.06;this.cursor=0;this.connectOutput(plan.layers);this.running=true;
      this.tick();this.timer=setInterval(()=>this.tick(),25);
    }
    tick(){
      if(!this.running)return;const now=this.context.currentTime,elapsed=(now-this.startedAt)*1000;
      while(this.cursor<this.plan.events.length&&this.plan.events[this.cursor].atMs<=elapsed+180){const event=this.plan.events[this.cursor++];if(event.atMs>=elapsed-30)this.schedule(event,Math.max(now,this.startedAt+event.atMs/1000),event.durationMs/1000);}
      if(elapsed>=this.plan.durationMs+30){const done=this.onEnd;this.stop();done();}
    }
    position(){return this.running?Math.max(0,(this.context.currentTime-this.startedAt)*1000):null;}
    stop(){
      this.generation++;this.running=false;clearInterval(this.timer);this.timer=null;
      if(this.context)HelloAudio.stopVoices(this.voices,this.context);
      this.panners.forEach(p=>p.disconnect());this.panners.clear();this.master?.disconnect();this.compressor?.disconnect();this.master=null;this.compressor=null;this.plan=null;
    }
  }
  globalThis.HelloQuestionAudio={buildPlan,Player};
})();
