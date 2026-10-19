/* Explicit seed only: never called during app startup. Deterministic fictional
   responses and DOM composition sequences, not captured human keystrokes. */
(() => {
  'use strict';
  const batchId='presentation-10-v1',C=HelloQuestionConfig;
  const answers=[
    ['파란 셔츠','친구가 차를 준 아침','늘 내 편이라 고마워'],
    ['검은 옷','동생이 집에 온 날','그날은 내가 미안해'],
    ['노란 옷','비 오는 날 우산을 받은 때','보고 싶다는 말을 못 했어'],
    ['회색 셔츠','아빠가 저녁을 만든 날','조금 쉬어도 괜찮아'],
    ['초록 옷','친구가 내 말을 들은 날','다시 만나서 걷고 싶어'],
    ['a blue shirt','a friend saved me a seat','i wish i had stayed longer'],
    ['black jeans','my sister called yesterday','i am proud of you'],
    ['a green sweater','someone held the door','i still miss our walks'],
    ['a white shirt','dad made us dinner','thank you for waiting for me'],
    ['a grey coat','a kind note this morning','i was afraid to say sorry']
  ];
  const L=Array.from('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ');
  const compoundV={9:[8,9],10:[8,10],11:[8,11],14:[13,14],15:[13,15],16:[13,16],19:[18,19]};
  const compoundT={3:[1,3],5:[4,5],6:[4,6],9:[8,9],10:[8,10],11:[8,11],12:[8,12],13:[8,13],14:[8,14],15:[8,15],18:[17,18]};
  function compositionSteps(char){
    const n=char.charCodeAt(0)-0xac00;
    if(n<0||n>=11172)return null;
    const l=Math.floor(n/588),v=Math.floor(n/28)%21,t=n%28;
    const syllable=(vowel,final=0)=>String.fromCharCode(0xac00+l*588+vowel*28+final);
    return [L[l],...(compoundV[v]||[v]).map(vowel=>syllable(vowel)),...(t?(compoundT[t]||[t]).map(final=>syllable(v,final)):[])];
  }
  function buildBatch(){return answers.map((texts,p)=>{
    const results=texts.map((text,q)=>{
      const r=new HelloQuestionInput.Recorder(0);
      let time=[500+(p*137)%1501,2000+(p*313)%3001,5000+(p*719)%7001][q],step=0,paused=false;
      const chars=Array.from(text),middle=Math.floor(chars.length/2);
      const advance=()=>{const low=[100,150,200][q],spread=[201,351,501][q];time+=low+((p*71+step++*97+q*43)%spread);};
      chars.forEach((char,i)=>{
        const previousTime=time;
        if(i)advance();
        if(!paused&&i>=middle&&q>0){time=previousTime+(q===1?1000+(p*83)%1001:2000+(p*307)%3001);paused=true;}
        const steps=compositionSteps(char);
        if(steps){
          const base=r.text;r.compositionStart(time);
          steps.forEach((value,j)=>{if(j)advance();r.compositionUpdate(value,time);r.input(base+value,'insertCompositionText',time,true);});
          r.compositionEnd(base+char,char,time);r.input(r.text,'insertText',time);
        }else r.input(r.text+char,'insertText',time);
      });
      const result=r.finish(C.questions[q],time+450+q*350+(p*113)%700);result.morse=HelloQuestionMorse.compile(result);return result;
    });
    const record=HelloQuestionData.participant(`${batchId}-${String(p+1).padStart(2,'0')}`,'synthetic',results);
    return HelloQuestionData.validate({...record,isDemo:true,demoBatchId:batchId});
  });}
  function query(store){const records=store.getRecords().filter(r=>r.demoBatchId===batchId);return {participants:records.length,answers:records.reduce((n,r)=>n+r.answers.length,0)};}
  function seed(store){
    const added=store.add(buildBatch()),counts=query(store);let persisted=false;
    try{const saved=HelloQuestionData.parse(store.storage.getItem(C.storageKey));persisted=!store.warning&&saved.filter(r=>r.demoBatchId===batchId).length===10&&JSON.stringify(saved)===JSON.stringify(store.getRecords());}catch{}
    return {batchId,added,...counts,persisted};
  }
  const fiveBatchId='presentation-5-v1';
  function buildFive(){const ten=buildBatch();return [0,2,4,5,7].map((at,i)=>{
    const record=ten[at],id=`${fiveBatchId}-${String(i+1).padStart(2,'0')}`;
    return HelloQuestionData.validate({...record,id,demoBatchId:fiveBatchId,sound:HelloQuestionData.soundFor(id)});
  });}
  globalThis.HelloQuestionDemo={batchId,buildBatch,seed,query,compositionSteps,fiveBatchId,buildFive};
})();
