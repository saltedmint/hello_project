globalThis.runWavTests = async ({ check, assert, same, realBank, fourRecord, fakeAudio, frame, uiAudio, type }) => {
  const { planExport, renderExport, encodeWav, SETTINGS } = HelloWav;
  const relative = fourRecord.relative;
  const melody = HelloHandwriting.convert([
    [{x:.1,y:.9,time:0,kind:'down'},{x:.8,y:.9,time:2000,kind:'up'}],
    [{x:.8,y:.1,time:3000,kind:'down'},{x:.1,y:.1,time:4000,kind:'up'}]
  ],relative.at(-1));
  const options = { relative, bank:realBank, melody, melodyVolume:.04 };
  const originalPlan = planExport(options), repeatedPlan = planExport({...options,repeated:true});
  check('WAV 계획: 원본 1회 · 반복 주기 T+0.5초 · 전체 타격과 선율 포함',()=>{
    assert(originalPlan.count===1 && Math.abs(repeatedPlan.period-3.4)<1e-8);
    assert(originalPlan.events.filter(event=>event.kind==='drum').length===20 && originalPlan.events.filter(event=>event.kind==='melody').length===2);
    assert(repeatedPlan.contentSeconds>=15 && repeatedPlan.contentSeconds<=20);
  });
  check('WAV 계획: 잔향 끝+여유 · 마지막 타격과 다음 첫 타격 시작 분리',()=>{
    assert(originalPlan.durationSeconds>=originalPlan.unitEnd+.0999);
    assert(originalPlan.unitEnd>=relative.at(-1)/1000+realBank.buffers.get('o').duration);
    assert(Math.abs(repeatedPlan.period-relative.at(-1)/1000-.5)<1e-8);
  });
  check('WAV 계획: 20초 초과 단위는 한 번 · 완전한 단위가 범위에 안 맞으면 자르지 않음',()=>{
    assert(planExport({relative:[0,5000,10000,15000,21000],bank:realBank,repeated:true}).count===1);
    const whole=planExport({relative:[0,2000,4000,8000,11000],bank:realBank,repeated:true});
    assert(whole.count===1 && whole.outsideTarget && whole.durationSeconds>12);
  });
  check('WAV 계획: 손글씨 생략 · 미준비/누락 샘플 · 비정상 타이밍 안내',()=>{
    assert(!planExport({...options,melody:null}).hasMelody);
    const invalid=[()=>planExport({...options,bank:{status:'loading'}}),
      ()=>planExport({...options,bank:{status:'ready',buffers:new Map()}}),
      ()=>planExport({...options,relative:[0,NaN]}),()=>planExport({...options,relative:[0,10000000]})];
    assert(invalid.every(fn=>{try{fn();return false;}catch{return true;}}));
  });
  const original = await renderExport(options);
  const header = bytes => {
    const view=new DataView(bytes), text=(offset,length)=>String.fromCharCode(...new Uint8Array(bytes,offset,length));
    return { view, riff:text(0,4), wave:text(8,4), fmt:text(12,4), data:text(36,4), channels:view.getUint16(22,true),
      rate:view.getUint32(24,true), bits:view.getUint16(34,true), size:view.getUint32(40,true) };
  };
  const h=header(original.wav);
  check('WAV 헤더: RIFF/WAVE · PCM16 · 44100Hz · 스테레오 · 데이터 크기/길이 일치',()=>{
    assert(h.riff==='RIFF'&&h.wave==='WAVE'&&h.fmt==='fmt '&&h.data==='data');
    assert(h.view.getUint16(20,true)===1 && h.rate===44100 && h.bits===16 && h.channels===2);
    assert(h.view.getUint32(4,true)+8===original.wav.byteLength && h.size===original.plan.frames*4);
    assert(h.view.getUint32(28,true)===176400 && h.view.getUint16(32,true)===4);
    assert(h.size/176400===original.plan.durationSeconds);
  });
  const decoder = new OfflineAudioContext(2,1,44100);
  const decoded = await decoder.decodeAudioData(original.wav.slice(0));
  check('실제 WAV 디코딩: 채널/프레임 수 정상 · 마지막 80ms 무음 여유 · 클리핑 없음',()=>{
    assert(decoded.numberOfChannels===2 && decoded.length===original.plan.frames && decoded.sampleRate===44100);
    for(let ch=0;ch<2;ch++){
      const values=decoded.getChannelData(ch);assert(values.some(value=>Math.abs(value)>.1));
      assert(values.slice(-Math.floor(.08*44100)).every(value=>value===0));
      assert(values.every(value=>Math.abs(value)<=1));
    }
  });
  const liveOffline=new OfflineAudioContext(2,original.plan.frames,44100);
  const liveAdapter={state:'running',currentTime:0,destination:liveOffline.destination,
    createGain:()=>liveOffline.createGain(),createBufferSource:()=>liveOffline.createBufferSource(),createOscillator:()=>liveOffline.createOscillator()};
  const live=new HelloRhythm.RhythmPlayer(()=>liveAdapter,realBank);live.setMelodyVolume(.04);
  await live.play(relative,()=>{},{melody});
  const livePcm=(await liveOffline.startRendering()).getChannelData(0), wavPcm=decoded.getChannelData(0);
  check('실제 파형: 재생 공통 로직과 원본 WAV의 타이밍·음색·음량 일치',()=>{
    let error=0,power=0;
    for(let i=0;i<wavPcm.length;i++){
      const difference=wavPcm[i]-livePcm[i]*original.gain;error=Math.max(error,Math.abs(difference));power+=difference*difference;
    }
    assert(error<.004 && Math.sqrt(power/wavPcm.length)<.0002,`peak error ${error}`);
  });
  const starts=[];
  const repeated=await renderExport({...options,repeated:true},(channels,frames,rate)=>{
    const context=new OfflineAudioContext(channels,frames,rate);
    const originalFactory=context.createBufferSource.bind(context);
    context.createBufferSource=()=>{
      const source=originalFactory(),start=source.start.bind(source);
      source.start=at=>{starts.push({at,buffer:source.buffer});start(at);};return source;
    };
    return context;
  });
  check('반복 WAV: 모든 반복에 20타격 · 같은 시작 간격 · 악기 버퍼 동일 · 완전한 파일 길이',()=>{
    assert(starts.length===repeated.plan.count*20);
    for(let cycle=0;cycle<repeated.plan.count;cycle++)for(let i=0;i<20;i++){
      const event=starts[cycle*20+i];
      assert(Math.abs(event.at-SETTINGS.leadSeconds-cycle*repeated.plan.period-relative[i]/1000)<1e-8);
      assert(event.buffer===realBank.buffers.get('hello'[i%5]));
    }
    assert(header(repeated.wav).size/176400===repeated.plan.durationSeconds);
  });
  const rhythmOnly=await renderExport({...options,melody:null});
  check('리듬만 WAV: 선율 없이 정상 렌더 · 저음량은 증폭하거나 보정하지 않음',()=>{
    assert(!rhythmOnly.plan.hasMelody && rhythmOnly.gain===1 && original.gain===1);
    assert(rhythmOnly.wav.byteLength>44 && rhythmOnly.peak>0);
  });
  const fakeBuffer=channels=>({ numberOfChannels:channels.length,length:channels[0].length,sampleRate:44100,getChannelData:ch=>Float32Array.from(channels[ch]) });
  const clipped=encodeWav(fakeBuffer([[2,-2,.2,0],[1,-.5,.1,0]]));
  check('PCM 인코딩: 클리핑일 때만 동일 감쇠 · 스테레오 인터리빙 · 원본 비율 유지',()=>{
    assert(Math.abs(clipped.gain-.4995)<1e-8 && clipped.peak===2);
    const view=new DataView(clipped.wav);
    assert(Math.abs(view.getInt16(44,true)/32767-.999)<.0001);
    assert(Math.abs(view.getInt16(46,true)/32767-.4995)<.0001);
    assert(view.getInt16(48,true)<-32700);
    assert(encodeWav(fakeBuffer([[.1,-.2,0]])).gain===1);
  });
  let renderError;
  try{await renderExport(options,()=>{throw new Error('render failure');});}catch(error){renderError=error;}
  check('렌더 실패는 명확한 예외로 전달',()=>assert(renderError?.message==='render failure'));

  const w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id);
  frame.focus();$('reset').click();
  check('UI: 입력 완료 전 다운로드 영역 숨김',()=>assert($('export-panel').hidden));
  let time=1000;Object.defineProperty(w.performance,'now',{configurable:true,value:()=>time});
  for(let bar=0;bar<4;bar++)[...'hello','Enter'].forEach((key,i)=>{time=1000+bar*2000+[0,100,200,300,400,600][i];type(key);});
  check('UI: 완료 후 포함 내용·예상 길이와 두 다운로드 버튼 표시',()=>{
    assert(!$('export-panel').hidden && !$('download-original').disabled && !$('download-repeated').disabled);
    assert($('original-estimate').textContent.includes('리듬만') && $('repeated-estimate').textContent.includes('초'));
  });
  const realRender=w.HelloWav.renderExport,realDownload=w.HelloWav.download;let calls=0,resolveRender,capturedOptions;
  const downloads=[];
  w.HelloWav.renderExport=options=>{calls++;capturedOptions=options;return new Promise(resolve=>{resolveRender=resolve;});};
  w.HelloWav.download=(wav,filename)=>downloads.push({wav,filename});
  const waitFor=async predicate=>{for(let i=0;i<300;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('export UI timeout');};
  try{
    $('play').click();await Promise.resolve();$('download-original').click();$('download-original').click();$('download-repeated').click();
    check('UI: 렌더 중 실시간 스피커 재생 정지 · 중복 클릭·입력 변경 차단',()=>{
      assert(calls===1 && $('play').disabled && $('reset').disabled && $('download-original').disabled && $('download-repeated').disabled);
      assert($('status').textContent==='입력 완료' && capturedOptions.melody===null);
      assert(capturedOptions.melodyVolume===.03);
    });
    resolveRender({...original,plan:{...original.plan,count:1}});
    await waitFor(()=>$('export-status').textContent.includes('준비 완료'));
    check('UI: 성공 후 원본 파일명 전달 · 버튼 복구 · 재시도 가능',()=>{
      assert(downloads.length===1 && downloads[0].filename==='greeting-original.wav');
      assert(!$('download-original').disabled && !$('download-repeated').disabled && !$('play').disabled);
    });
    w.HelloWav.renderExport=async()=>{throw new Error('테스트 렌더 실패');};
    $('download-repeated').click();await waitFor(()=>$('export-status').textContent.includes('실패'));
    check('UI: 렌더 실패 안내와 버튼 복구',()=>assert($('export-status').textContent.includes('테스트 렌더 실패')&&!$('download-repeated').disabled));
    w.HelloWav.renderExport=realRender;
    $('download-repeated').click();await waitFor(()=>$('export-status').textContent.includes('준비 완료'));
    check('UI: 실패 후 실제 반복 렌더 재시도 · 파일명/헤더 정상',()=>{
      const item=downloads.at(-1);assert(item.filename==='greeting-repeated.wav'&&header(item.wav).rate===44100);
    });
    const click=w.HTMLAnchorElement.prototype.click;let anchor;
    w.HTMLAnchorElement.prototype.click=function(){anchor={href:this.href,name:this.download};};
    try{realDownload(original.wav,'greeting-original.wav');}finally{w.HTMLAnchorElement.prototype.click=click;}
    check('다운로드 연결: WAV Blob URL과 download 파일명 생성',()=>assert(anchor.href.startsWith('blob:')&&anchor.name==='greeting-original.wav'));
  }finally{w.HelloWav.renderExport=realRender;w.HelloWav.download=realDownload;}
};
