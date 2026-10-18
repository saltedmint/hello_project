/* Scripted, reproducible demonstrations, NOT an inference about real people.
   They use the same recorder, edits and converter as participant sessions. */
(() => {
  'use strict';
  const C=HelloQuestionConfig;
  const TEXTS=[['파란색','친구가 기다려 준 날','고맙다는 말을 하고 싶어'],['black','a friend brought tea','i miss you'],['흰색 white','어제 함께 걸었을 때','다시 만나고 싶어'],['초록색','지하철에서 길을 알려준 순간','미안해'],['navy blue','this morning','thank you'],['회색','엄마와 통화했을 때','괜찮아']];
  function examples(){return TEXTS.map((answers,p)=>{
    const results=answers.map((text,q)=>{
      const r=new HelloQuestionInput.Recorder(0);
      // Exceptions are deliberate: P4 pauses on Q1; P5 answers Q3 promptly.
      const first=p===3&&q===0?6500:p===4&&q===2?350:[500,1800,5200][q]+p*130;
      let now=first;
      Array.from(text).forEach((char,i)=>{
        if(i)now+=170+((i*73+p*41)%180);
        if(q===1&&i===Math.floor(text.length/2))now+=1400;
        if(q===2&&p!==4&&i===Math.floor(text.length/2))now+=3600;
        if(p===0&&q===1&&i===0){r.input('x','insertText',now);now+=420;r.input('','deleteContentBackward',now);now+=650;}
        if(/[가-힣]/.test(char)){
          r.compositionStart(now);r.compositionUpdate(HelloQuestionMorse.decompose(char)[0],now+50);
          r.input(r.text+char,'insertCompositionText',now+100,true);
          now+=150;r.compositionEnd(r.text+char,char,now);r.input(r.text,'insertText',now+1);
        }else r.input(r.text+char,'insertText',now);
      });
      if(p===2&&q===1){r.loseFocus(now+100,'window');r.gainFocus(now+800);now+=800;}
      const result=r.finish(C.questions[q],now+700+(p*211)%650);result.morse=HelloQuestionMorse.compile(result);return result;
    });
    return HelloQuestionData.participant(`questions-example-v1-${p+1}`,'synthetic',results);
  });}
  globalThis.HelloQuestionExamples={examples};
})();
