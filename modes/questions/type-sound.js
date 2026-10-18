/* Independent ambience, decoration, result and typing buses below one master. */
(() => {
  'use strict';
  const K=HelloTypeConfig;
  class Sound {
    constructor(){this.context=null;this.enabled=false;this.volume=.65;this.muted=false;this.ambient=new Set();this.decorations=new Set();this.typing=new Set();this.typingStarts=0;this.decorTimer=null;this.main=false;this.visuals=[];this.ambientStarts=0;this.token=0;}
    async enable(){
      const token=++this.token;this.context ||= HelloAudio.createContext();
      await HelloAudio.ensureRunning(this.context);if(token!==this.token)return false;
      this.enabled=true;this.ensureOutput();this.startAmbient();if(this.main)this.startMain();return true;
    }
    ensureOutput(){
      if(this.master)return;
      const c=this.context;this.master=c.createGain();this.master.gain.value=this.muted?0:this.volume;
      this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-16;this.compressor.knee.value=18;this.compressor.ratio.value=8;
      this.master.connect(this.compressor).connect(c.destination);
      this.ambientBus=c.createGain();this.ambientBus.gain.value=K.ambienceGain;this.ambientBus.connect(this.master);
      this.mainBus=c.createGain();this.mainBus.gain.value=K.decorationGain;this.mainBus.connect(this.master);
      this.resultBus=c.createGain();this.resultBus.gain.value=K.resultGain;this.resultBus.connect(this.master);
      this.typingBus=c.createGain();this.typingBus.gain.value=K.typingGain;this.typingBus.connect(this.master);
    }
    playTyping(){
      if(!this.enabled||this.muted||!this.context||this.context.state!=='running')return;
      this.ensureOutput();const c=this.context,when=c.currentTime,duration=K.typingToneMs/1000;
      const source=c.createOscillator(),gain=c.createGain();source.type='sine';source.frequency.value=K.typingHz;
      gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.35,when+.006);
      gain.gain.setValueAtTime(.35,when+duration-.012);gain.gain.linearRampToValueAtTime(0,when+duration);
      source.connect(gain).connect(this.typingBus);const voice={source,gain};this.typing.add(voice);
      this.typingStarts++;
      source.onended=()=>{source.disconnect();gain.disconnect();this.typing.delete(voice);};source.start(when);source.stop(when+duration);
    }
    stopTyping(){if(this.context)HelloAudio.stopVoices(this.typing,this.context);}
    setVolume(value,muted=this.muted){this.volume=Math.max(0,Math.min(1,Number(value)));this.muted=muted;if(this.master)this.master.gain.setTargetAtTime(muted?0:this.volume,this.context.currentTime,.04);}
    startAmbient(){
      if(!this.enabled||this.ambient.size)return;this.ensureOutput();this.ambientStarts++;
      // Slow, incommensurate gain modulation; no pulse, sample, or restart per screen.
      for(const [i,hz] of [130.81,196,261.63].entries()){
        const source=this.context.createOscillator(),gain=this.context.createGain(),lfo=this.context.createOscillator(),depth=this.context.createGain();
        source.type='sine';source.frequency.value=hz;gain.gain.value=.28;lfo.frequency.value=.037+i*.014;depth.gain.value=.08;
        lfo.connect(depth).connect(gain.gain);source.connect(gain).connect(this.ambientBus);source.start();lfo.start();
        this.ambient.add({source,gain,lfo,depth});
      }
    }
    setMain(value){this.main=value;if(value){if(this.enabled){this.startAmbient();this.startMain();}}else this.stopMain();}
    startMain(){
      if(!this.enabled||!this.main||this.decorTimer!==null)return;
      this.mainBus.gain.setTargetAtTime(K.decorationGain,this.context.currentTime,.05);this.nextDecoration=this.context.currentTime+.1;
      this.visuals=Array.from({length:8},(_,i)=>({when:this.context.currentTime-i*1.8-.5,dash:Math.random()>.5,y:12+Math.random()*76}));
      this.decorTimer=setInterval(()=>this.tick(),50);this.tick();
    }
    tick(){
      if(!this.main||!this.enabled)return;const c=this.context;
      if(this.nextDecoration<c.currentTime-.2)this.nextDecoration=c.currentTime+.1;
      while(this.nextDecoration<c.currentTime+.2){
        const dash=Math.random()>.5,when=this.nextDecoration,duration=dash ? .24 : .08;
        const source=c.createOscillator(),gain=c.createGain();source.frequency.value=[523.25,659.25,783.99][Math.floor(Math.random()*3)];
        gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.15,when+.015);gain.gain.linearRampToValueAtTime(0,when+duration);
        source.connect(gain).connect(this.mainBus);const voice={source,gain};this.decorations.add(voice);
        source.onended=()=>{source.disconnect();gain.disconnect();this.decorations.delete(voice);};source.start(when);source.stop(when+duration);
        this.visuals.push({when,duration,dash,y:12+Math.random()*76});this.visuals=this.visuals.filter(v=>v.when>c.currentTime-18);
        this.nextDecoration+=K.decorationStepMs/1000;
      }
    }
    stopMain(){
      clearInterval(this.decorTimer);this.decorTimer=null;this.visuals=[];
      if(!this.context||!this.mainBus)return;this.mainBus.gain.setTargetAtTime(0,this.context.currentTime,.05);
      for(const voice of this.decorations){try{voice.source.stop(this.context.currentTime+K.mainFadeMs/1000);}catch{}}
    }
    stopAll(){
      this.token++;this.main=false;this.stopMain();if(!this.context)return;
      HelloAudio.stopVoices(this.decorations,this.context);
      this.stopTyping();
      for(const voice of this.ambient){voice.source.stop();voice.lfo.stop();voice.source.disconnect();voice.lfo.disconnect();voice.gain.disconnect();voice.depth.disconnect();}this.ambient.clear();
      for(const key of ['ambientBus','mainBus','resultBus','typingBus','master','compressor']){this[key]?.disconnect();this[key]=null;}
    }
  }
  globalThis.HelloTypeSound={Sound};
})();
