"""Native headless Chrome: progressive questions, typing feedback, real 5-second
preparation and black ending, all nine stages, enabled
audio over HTTP and silent fallback over file://. Isolated disposable profiles.
Uses the existing native JSON download validator, including old+new demo batches.
"""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import importlib.util
import threading

spec=importlib.util.spec_from_file_location('question_verifier',Path(__file__).with_name('verify-questions.py'))
q=importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
q.SCRIPT=r'''<script>window.addEventListener('load',async()=>{
const $=id=>document.getElementById(id),T=HelloTypeExperience,Q=HelloQuestions,D=HelloQuestionData;
const assert=(value,message)=>{if(!value)throw Error(message);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async test=>{for(let i=0;i<6000;i++){if(test())return;await delay(10);}throw Error('state timeout '+T.diagnostics().state+' / '+$('yt-feedback').textContent);};
const enter=(release=true,extra={})=>{const target=/^Q/.test(T.diagnostics().state)?$('yt-answer'):document;target.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,...extra}));if(release)target.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true}));};
const input=(value,type='insertText',isComposing=false)=>{const area=$('yt-answer');area.value=value;area.setSelectionRange(value.length,value.length);area.dispatchEvent(new InputEvent('input',{inputType:type,isComposing,bubbles:true}));};
const type=async (char,keepComposing=false)=>{
 const area=$('yt-answer'),base=area.value,steps=HelloQuestionDemo.compositionSteps(char);
 if(steps){area.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));for(const value of steps){area.dispatchEvent(new CompositionEvent('compositionupdate',{data:value,bubbles:true}));input(base+value,'insertCompositionText',true);await delay(20);}if(!keepComposing){area.dispatchEvent(new CompositionEvent('compositionend',{data:char,bubbles:true}));input(base+char);}}
 else {area.dispatchEvent(new KeyboardEvent('keydown',{key:char,code:'Key'+char.toUpperCase(),bubbles:true}));input(base+char);area.dispatchEvent(new KeyboardEvent('keyup',{key:char,bubbles:true}));}
 await delay(20);
};
try{
 assert(HelloExperiments.getMode()==='b'&&T.diagnostics().state==='main','direct Your Type entry');
 assert(getComputedStyle(document.body).backgroundColor==='rgb(0, 0, 0)','black main');
 assert(!T.sound.context&&!T.sound.enabled,'first visit without automatic audio');
 $('yt-expression').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(T.diagnostics().state==='main','settings Enter isolated');
 $('yt-seed').click();$('yt-seed').click();Q.store.add(HelloQuestionExamples.examples());
 assert(Q.store.records.length===16,'old six and new ten demo IDs retained once');$('yt-include-demo').checked=false;
 const audible=location.protocol!=='file:';
 if(audible){$('yt-sound-enable').click();await wait(()=>T.sound.enabled);assert(T.sound.context.state==='running','real AudioContext activation');}
 const ambientStarts=T.sound.ambientStarts,bindingCount=T.diagnostics().bindings;
 enter(false);enter(false,{repeat:true});document.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
 for(let index=0;index<3;index++){
   await wait(()=>T.diagnostics().state==='Q'+(index+1));
   assert(T.diagnostics().locked&&$('yt-answer').disabled&&$('yt-prompt-en').textContent==='','reveal locks input and hides translation');
   enter();await delay(100);assert($('yt-answer').disabled&&$('yt-prompt-ko').textContent.length>0&&$('yt-prompt-ko').textContent.length<HelloQuestionConfig.questions[index].ko.length,'progressive question, Enter cannot skip');
   await wait(()=>T.diagnostics().state==='Q'+(index+1)&&!T.diagnostics().locked);
   assert($('yt-prompt-ko').textContent===HelloQuestionConfig.questions[index].ko&&$('yt-prompt-en').textContent===HelloQuestionConfig.questions[index].en,'full question then translation');
   assert(document.activeElement===$('yt-answer')&&T.diagnostics().decorTimer===null,'focus/main sound stopped');
   assert($('yt-main').hidden&&$('yt-result').hidden,'no result while answering');await delay(70);
   const answer=Array.from(['red','감사','hi'][index]);
   for(const [i,char] of answer.entries())await type(char,index===1&&i===answer.length-1);
   await delay(90);
   if(index===1){
     enter(false,{isComposing:true,keyCode:229});
     assert(T.diagnostics().state==='Q2','wait for native composition completion');
     await delay(20);$('yt-answer').dispatchEvent(new CompositionEvent('compositionend',{data:'사',bubbles:true}));input('감사');
     document.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true}));
     await wait(()=>T.diagnostics().state!=='Q2');
   }else enter();
 }
 await wait(()=>T.diagnostics().state==='processing'&&Q.store.records.length===17);const processingStart=T.diagnostics().processingStartedAt;
 assert(Q.store.records.length===17&&Q.store.records.filter(r=>r.source==='participant').length===1,'Q3 auto-save exactly once');
 const own=T.getSession().record,activityCount=own.answers.reduce((n,a)=>n+a.typingActivities.length,0);
 assert(own.answers[1].text==='감사'&&own.answers[1].typingActivities.length===5,'one Enter submits final Korean syllable without duplicate activity');
 assert(own.answers.every(a=>a.firstActivityMs<400&&a.firstActivityMs>=50),'reveal excluded from recorded first silence');
 assert(T.sound.typingStarts===(audible?activityCount:0)&&T.sound.typing.size===0,'one live sound per activity, no duplicate IME, stopped at transition');
 enter();await delay(4500);assert(T.diagnostics().state==='processing','cannot skip five seconds');
 await wait(()=>T.diagnostics().state==='playing');const duration=performance.now()-processingStart;
 assert(duration>=4950,'normal preparation lasts five real seconds: '+duration);
 const plan=T.getSequence();assert(plan.segments.length===9&&plan.snapshot.length===1,'nine frozen segments; demo setting applied');
 $('yt-include-demo').checked=true;assert(T.getSequence().snapshot.length===1,'session settings frozen');
 assert($('yt-result').innerText.trim()===''&&!$('yt-result').querySelector('button,.q-row-label'),'graphics only');
 const order=[],observed=setInterval(()=>{const i=T.diagnostics().segmentIndex;if(T.diagnostics().state==='playing'&&order.at(-1)!==i)order.push(i);},10);
 order.push(0);await wait(()=>T.diagnostics().segmentIndex===8);enter(false);await wait(()=>T.diagnostics().state==='blackout');clearInterval(observed);
 assert(order.join(',')==='0,1,2,3,4,5,6,7,8','exact stage order: '+order);
 const endingStart=T.diagnostics().blackoutStartedAt;
 assert($('yt-graphics').children.length===0&&$('yt-result').hidden&&$('yt-ending').innerText.trim()===''&&$('yt-return-prompt').hidden,'empty black ending');
 document.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));enter(false);assert(T.diagnostics().state==='blackout','fresh Enter before prompt ignored');
 await delay(4500);assert(T.diagnostics().state==='blackout'&&$('yt-return-prompt').hidden,'no prompt before five seconds');
 await wait(()=>T.diagnostics().state==='ended');assert(performance.now()-endingStart>=4995&&!$('yt-return-prompt').hidden,'real five-second ending wait');
 enter(false);assert(T.diagnostics().state==='ended','held Enter cannot return after end');
 document.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));enter();
 assert(T.diagnostics().state==='main'&&T.sound.ambientStarts===ambientStarts,'home without ambient restart');
 assert(T.player.timer===null&&T.player.voices.size===0&&T.diagnostics().bindings===bindingCount,'result cleanup, no duplicate bindings');
 if(audible)assert($('yt-sound-enable').hidden&&T.sound.ambient.size===3&&T.diagnostics().decorTimer!==null,'one persistent ambient and one main scheduler');
 else assert(!T.sound.context,'silent experience never constructed AudioContext');
 enter();await wait(()=>T.diagnostics().state==='Q1'&&!T.diagnostics().locked);assert(T.getSession().answers.length===0,'next audience begins cleanly');
 HelloExperiments.selectMode('a');assert(!T.diagnostics().active&&T.diagnostics().bindings===0&&T.sound.ambient.size===0&&HelloOrchestra.diagnostics().active,'A mode and complete teardown');
 $('q-download').click();navigator.sendBeacon('ENDPOINT','PASS Your Type: progressive questions/input origin, '+activityCount+' input activities without duplicate feedback, real processing '+duration.toFixed(0)+'ms, nine stages, real black ending 5s, '+(audible?'live four audio buses':'silent without AudioContext')+', held/fresh Enter, persistent ambience, auto-save, A cleanup');
}catch(error){navigator.sendBeacon('ENDPOINT','ERROR '+error.stack+' / '+$('yt-feedback').textContent);}
});</script>'''

if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(q.Handler,directory=str(q.ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        for protocol in ['http','file']:
            q.run(server,protocol,timeout=60)
    finally:
        server.shutdown()
        server.server_close()
