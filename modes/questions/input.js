/* DOM edits and confirmed text-key activity are separate. IME raw notifications
   remain available; compositionend's following identical input adds no dot. */
(() => {
  'use strict';
  const C=HelloQuestionConfig;
  function editCharacters(previous,value,atMs,selection) {
    const next=Array.from(value), old=previous.map(c=>c.char);let prefix=0,suffix=0;
    if(selection){
      let {start,end,inputType}=selection;
      const removedCount=old.length-next.length;
      if(start===end&&removedCount>0){if(/Backward$/.test(inputType))start=Math.max(0,start-removedCount);else if(/Forward$/.test(inputType))end=Math.min(old.length,end+removedCount);}
      const addedCount=next.length-(old.length-(end-start));
      if(start>=0&&end>=start&&end<=old.length&&addedCount>=0&&old.slice(0,start).join('')===next.slice(0,start).join('')&&old.slice(end).join('')===next.slice(start+addedCount).join('')){
        const added=next.slice(start,start+addedCount),removed=old.slice(start,end);
        return {added,removed,characters:[...previous.slice(0,start),...added.map(char=>({char,atMs})),...previous.slice(end)].map((c,index)=>({...c,index}))};
      }
    }
    while(prefix<old.length&&prefix<next.length&&old[prefix]===next[prefix])prefix++;
    while(suffix<old.length-prefix&&suffix<next.length-prefix&&old.at(-1-suffix)===next.at(-1-suffix))suffix++;
    const added=next.slice(prefix,next.length-suffix), removed=old.slice(prefix,old.length-suffix);
    return {added,removed,characters:[...previous.slice(0,prefix),...added.map(char=>({char,atMs})),...(suffix?previous.slice(-suffix):[])].map((c,index)=>({...c,index}))};
  }
  // One canonical activity per observed insertion. Key timestamps are used only
  // after an input confirms that the key actually produced text.
  function collectTyping(events,{grouped=false}={}) {
    const result=[];let key=null,observed='';
    events.forEach((e,index)=>{
      if(e.type==='keydown'){key={...e,index};return;}
      if(e.type==='keyup'){key=null;return;}
      if(e.type==='blocked'){key=null;return;}
      if(!['input','compositionend',...(grouped?['compositionfinalize']:[])].includes(e.type)||typeof e.value!=='string')return;
      const type=e.inputType||'insertCompositionText';
      if(/delete/i.test(type)||['Backspace','Delete'].includes(key?.key)||['Backspace','Delete'].includes(key?.code)){observed=e.value;key=null;return;}
      if(!['input','insertText','insertCompositionText','insertFromComposition',...(grouped?['insertReplacementText']:[])].includes(type)){key=null;return;}
      const edit=editCharacters(Array.from(observed).map(char=>({char})),e.value,0);
      const blocked=events.slice(index+1,index+5).some(n=>n.atMs===e.atMs&&n.type==='blocked');
      const physical=key?.eligible&&!key.repeat&&key.atMs<=e.atMs&&edit.added.length<=1&&type!=='insertReplacementText';
      const insertion=(grouped?edit.added.length>0:edit.added.length===1)&&e.value!==observed;
      const sameValueHit=physical&&e.type==='input'&&e.value===observed;
      if((insertion||sameValueHit)&&!key?.repeat&&!blocked&&Array.from(e.value).length<=C.maxCharacters){
        result.push({atMs:physical?key.atMs:e.atMs,eventIndex:index,keyEventIndex:physical?key.index:null,unit:physical?'physical-key':'observed-input'});
      }
      // compositionend and its following input carry the same value: no double hit.
      if(!blocked&&(grouped||edit.added.length<=1))observed=e.value;
      key=null;
    });
    return result;
  }
  class Recorder {
    constructor(origin,{recordingVersion=C.recordingVersion}={}) { this.recordingVersion=recordingVersion;this.origin=origin;this.text='';this.characters=[];this.events=[];this.composing=false;this.firstActivityMs=null;this.lastTextInputMs=null;this.focusLoss=[];this.openFocus=null; }
    keyDown(event,now) {
      const key=event.key||'',code=event.code||'';
      const eligible=!event.ctrlKey&&!event.metaKey&&!event.altKey&&(Array.from(key).length===1||((key==='Process'||event.keyCode===229)&&/^(Key[A-Z]|Digit[0-9]|Space|Semicolon|Quote|Bracket|Backslash|Comma|Period|Slash|Minus|Equal)/.test(code)));
      this.log('keydown',now,{key,code,eligible,repeat:!!event.repeat});
    }
    keyUp(now){this.log('keyup',now);}
    elapsed(now) { return Math.max(0,now-this.origin); }
    log(type,now,fields={}) {
      const safe={...fields};
      // Oversized paste/autocomplete attempts must not poison later valid input.
      // Record the attempted length, not an unbounded clipboard payload.
      for(const key of ['data','value'])if(typeof safe[key]==='string'&&safe[key].length>500){safe[`${key}Length`]=safe[key].length;safe[key]=null;}
      const event={type,atMs:this.elapsed(now),...safe};this.events.push(event);return event;
    }
    activity(now,kind) { const event=this.log('activity',now,{kind});this.firstActivityMs??=event.atMs;this.lastTextInputMs=event.atMs; }
    blocked(now,kind) { this.log('blocked',now,{kind});if(!this.composing)this.pendingSelection=null; }
    before(type,data,now,selection) { this.log('beforeinput',now,{inputType:type,data:data??null,selection});if(!this.composing)this.pendingSelection=selection?{...selection,inputType:type}:null; }
    apply(value,now,kind) {
      if(value===this.text)return {changed:false};
      const selection=this.pendingSelection;this.pendingSelection=null;
      const edit=editCharacters(this.characters,value,this.elapsed(now),selection);
      if(Array.from(value).length>C.maxCharacters) {this.blocked(now,'answer-too-long');return {blocked:true,reason:'answer-too-long'};}
      if(edit.added.length>1&&this.recordingVersion!=='dom-activity-v3') {this.blocked(now,'bulk-text');return {blocked:true};}
      this.activity(now,kind);
      this.characters=edit.characters;this.text=value;
      this.log('commit',now,{value,added:edit.added.join(''),removed:edit.removed.join(''),kind,selection});
      return {changed:true};
    }
    input(value,type,now,isComposing=false) {
      this.log('input',now,{value,inputType:type,isComposing});
      if(['insertFromPaste','insertFromDrop','insertFromYank'].includes(type)||(type==='insertReplacementText'&&this.recordingVersion!=='dom-activity-v3')){this.blocked(now,type);return {blocked:true};}
      if(this.recordingVersion==='dom-activity-v3'&&isComposing)this.composing=true;
      if(this.composing||isComposing){this.activity(now,'composition-input');return {composing:true};}
      return this.apply(value,now,type||'input');
    }
    compositionStart(now,selection) {this.composing=true;this.pendingSelection=selection?{...selection,inputType:'insertCompositionText'}:null;this.log('compositionstart',now);this.activity(now,'compositionstart');}
    compositionUpdate(data,now) {this.log('compositionupdate',now,{data:data??''});if(data)this.activity(now,'compositionupdate');}
    compositionEnd(value,data,now) {this.composing=false;this.log('compositionend',now,{data:data??'',value});return this.apply(value,now,'compositionend');}
    finalizeComposition(value,now) {
      // Explicit observation after submit-triggered blur, not a fabricated IME
      // event or reconstructed key. Some mobile IMEs omit compositionend.
      if(this.recordingVersion!=='dom-activity-v3')return {blocked:true};
      this.composing=false;this.log('compositionfinalize',now,{value,reason:'submit-blur-snapshot'});
      return this.apply(value,now,'compositionfinalize');
    }
    loseFocus(now,reason) {if(this.openFocus)return;this.openFocus={fromMs:this.elapsed(now),reason};this.log('focusout',now,{reason});}
    gainFocus(now) {if(!this.openFocus)return;this.focusLoss.push({...this.openFocus,toMs:this.elapsed(now)});this.openFocus=null;this.log('focusin',now);}
    finish(question,now) {
      if(this.composing)throw Error('한글 조합을 확정한 뒤 제출해 주세요.');
      if(!this.text.trim())throw Error('한국어 또는 영어로 짧게 답해 주세요.');
      if(this.events.length>10000)throw Error('입력 기록이 너무 큽니다. 이 질문을 다시 시작해 주세요.');
      this.gainFocus(now);
      return {questionId:question.id,questionVersion:question.version,question:{ko:question.ko,en:question.en},recordingVersion:this.recordingVersion,
        ...(['dom-typing-v2','dom-activity-v3'].includes(this.recordingVersion)?{typingActivities:collectTyping(this.events,{grouped:this.recordingVersion==='dom-activity-v3'})}:{}),
        text:this.text,characters:this.characters.map(c=>({...c})),events:JSON.parse(JSON.stringify(this.events)),
        firstActivityMs:this.firstActivityMs,lastTextInputMs:this.lastTextInputMs,submittedAtMs:this.elapsed(now),focusLoss:this.focusLoss.map(x=>({...x}))};
    }
  }
  globalThis.HelloQuestionInput={Recorder,editCharacters,collectTyping};
})();
