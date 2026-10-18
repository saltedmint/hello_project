/* Korean table: CRMS notice 2025-1, annex 1, page 1. Latin/punctuation:
   ITU-R M.1677-1. Compound jamo expansion and boundary sizes are our documented
   artistic conventions, not claims of a standard Korean on-air protocol. */
(() => {
  'use strict';
  const C=HelloQuestionConfig;
  const LATIN={...HelloSoundscapeVisual.MORSE,'0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
    '.':'.-.-.-',',':'--..--',':':'---...','?':'..--..',"'":'.----.','-':'-....-','/':'-..-.','(':'-.--.',')':'-.--.-','"':'.-..-.','=':'-...-','+':'.-.-.','@':'.--.-.'};
  const KOREAN={'ㄱ':'.-..','ㄴ':'..-.','ㄷ':'-...','ㄹ':'...-','ㅁ':'--','ㅂ':'.--','ㅅ':'--.','ㅇ':'-.-','ㅈ':'.--.','ㅊ':'-.-.','ㅋ':'-..-','ㅌ':'--..','ㅍ':'---','ㅎ':'.---',
    'ㅏ':'.','ㅑ':'..','ㅓ':'-','ㅕ':'...','ㅗ':'.-','ㅛ':'-.','ㅜ':'....','ㅠ':'.-.','ㅡ':'-..','ㅣ':'..-','ㅐ':'--.-','ㅔ':'-.--'};
  const EXPAND={'ㄲ':'ㄱㄱ','ㄸ':'ㄷㄷ','ㅃ':'ㅂㅂ','ㅆ':'ㅅㅅ','ㅉ':'ㅈㅈ','ㄳ':'ㄱㅅ','ㄵ':'ㄴㅈ','ㄶ':'ㄴㅎ','ㄺ':'ㄹㄱ','ㄻ':'ㄹㅁ','ㄼ':'ㄹㅂ','ㄽ':'ㄹㅅ','ㄾ':'ㄹㅌ','ㄿ':'ㄹㅍ','ㅀ':'ㄹㅎ','ㅒ':'ㅑㅣ','ㅖ':'ㅕㅣ','ㅘ':'ㅗㅏ','ㅙ':'ㅗㅐ','ㅚ':'ㅗㅣ','ㅝ':'ㅜㅓ','ㅞ':'ㅜㅔ','ㅟ':'ㅜㅣ','ㅢ':'ㅡㅣ'};
  const INITIAL=Array.from('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'), VOWEL=Array.from('ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'), FINAL=Array.from(' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ');
  EXPAND['ㅄ']='ㅂㅅ';
  function decompose(char) {
    const n=char.codePointAt(0);
    if(n>=0xac00&&n<=0xd7a3){const x=n-0xac00;return [INITIAL[Math.floor(x/588)],VOWEL[Math.floor(x/28)%21],FINAL[x%28]].filter(c=>c!==' ');}
    if(n>=0x1100&&n<=0x1112)return [INITIAL[n-0x1100]];
    if(n>=0x1161&&n<=0x1175)return [VOWEL[n-0x1161]];
    if(n>=0x11a8&&n<=0x11c2)return [FINAL[n-0x11a7]];
    return [char];
  }
  function encode(char) {
    if(/\s/u.test(char))return {kind:'space',parts:[]};
    const jamo=decompose(char).flatMap(c=>Array.from(EXPAND[c]||c));
    if(jamo.every(c=>KOREAN[c]))return {kind:'korean',parts:jamo.map(jamo=>({jamo,code:KOREAN[jamo]}))};
    const code=LATIN[char.toLowerCase()];
    return code?{kind:'latin',parts:[{jamo:char,code}]}:{kind:'unsupported',parts:[]};
  }
  function compile(answer) {
    const segments=[],events=[];let time=0,x=0,original=0,previousKind=null;
    const append=(kind,durationMs,width,fields={})=>{
      if(durationMs<=0&&width<=0)return;
      const segment={kind,atMs:time,durationMs,x,width,...fields};segments.push(segment);
      if(kind==='tone')events.push({...segment});time+=durationMs;x+=width;
    };
    const gap=(to,kind)=>{const durationMs=to-original;append(kind,durationMs,durationMs*C.pixelsPerMs,{originalFromMs:original,originalToMs:to});original=to;};
    const ordered=[...answer.characters].sort((a,b)=>a.atMs-b.atMs||a.index-b.index);
    ordered.forEach((character,position)=>{
      gap(character.atMs,position?'input-silence':'first-silence');
      const encoded=encode(character.char), fields={charIndex:character.index,originalFromMs:character.atMs,originalToMs:character.atMs};
      if(position&&encoded.kind!=='space'&&previousKind!=='space'){
        const units=encoded.kind==='korean'||previousKind==='korean'?5:3;
        append('character-boundary',units*C.unitMs,units*C.unitPx,fields);
      }
      if(encoded.kind==='space')append('word-boundary',7*C.unitMs,7*C.unitPx,fields);
      else if(encoded.kind==='unsupported')append('unsupported',3*C.unitMs,3*C.unitPx,{...fields,char:character.char});
      else encoded.parts.forEach((part,jamoIndex)=>{
        if(jamoIndex)append('jamo-boundary',3*C.unitMs,3*C.unitPx,fields);
        Array.from(part.code).forEach((symbol,symbolIndex)=>{
          if(symbolIndex)append('symbol-boundary',C.unitMs,C.unitPx,fields);
          const units=symbol==='.'?1:3;
          append('tone',units*C.unitMs,units*C.unitPx,{...fields,jamoIndex,symbolIndex,symbol});
        });
      });
      previousKind=encoded.kind;
    });
    gap(answer.lastTextInputMs,'revision-silence');gap(answer.submittedAtMs,'submit-silence');
    return {transformVersion:C.transformVersion,unitMs:C.unitMs,originalDurationMs:answer.submittedAtMs,durationMs:time,width:x,segments,events};
  }
  function position(compiled,atMs,originalView=false) {
    const segment=compiled.segments.find(s=>atMs>=s.atMs&&atMs<s.atMs+s.durationMs)||compiled.segments.at(-1);
    if(!segment)return 0;
    const fraction=Math.max(0,Math.min(1,(atMs-segment.atMs)/(segment.durationMs||1)));
    return originalView?(segment.originalFromMs+(segment.originalToMs-segment.originalFromMs)*fraction)*C.pixelsPerMs:segment.x+segment.width*fraction;
  }
  globalThis.HelloQuestionMorse={LATIN,KOREAN,EXPAND,decompose,encode,compile,position};
})();
