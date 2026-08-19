"use strict";
/* PsySynthPro Engine - Phase 7
   AudioWorklet DSP: PolyBLEP + wavetable, ZDF SVF, analog envelopes, FM,
   per-note pitch bend, sample-accurate event queue for tight sequencing.  */

const WORKLET_SOURCE = `class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { wave:0, detune:0, unison:3, spread:12, sub:25, noise:0,
      fmRatio:2, fmDepth:12, fm2Ratio:3, fm2Depth:0, fm3Ratio:4, fm3Depth:0, fm4Ratio:5, fm4Depth:0, fm5Ratio:6, fm5Depth:0, fm6Ratio:7, fm6Depth:0,
      filterType:0, cutoff:2600, res:2, filterEnv:55, wtPos:0,
      attack:12, decay:260, sustain:70, release:650, fAttack:5, fDecay:300, fSustain:40, fRelease:400, fEnvAmt:60,
      lfoWave:0, lfoTarget:0, lfoRate:2.2, lfoDepth:35, lfo2Rate:5, lfo2Wave:0,
      lfoCutoff:0, lfoPitch:0, lfoAmp:0, lfoFM:0, envPitch:0, envFM:0,
      m0s:0,m0a:0,m0d:0,m1s:0,m1a:0,m1d:0,m2s:0,m2a:0,m2d:0,m3s:0,m3a:0,m3d:0,
      m4s:0,m4a:0,m4d:0,m5s:0,m5a:0,m5d:0,m6s:0,m6a:0,m6d:0,m7s:0,m7a:0,m7d:0,
      glideTime:0, fxDist:0, fxChorus:0, fxCrush:0, chRate:0.8, master:80, reverb:35, delay:22 };
    this.voices = [];
    for (let i=0;i<12;i++) this.voices.push(this.newVoice());
    this.lfoPhase=0; this.lfo2Phase=0; this.queue=[]; this.tick=0;
    this.wtable=this.defaultTable(); this.wtLen=this.wtable.length; this.wtMips=null;
    this.port.onmessage=(e)=>this.onMsg(e.data);
  }
  newVoice(){ return { active:false, note:-1, vel:0, bend:0, bendMul:1, baseFreq:440, targetBaseFreq:0, glideRate:0,
    subPhase:0, triInt:0, modPh:[0,0,0,0,0,0], uniPhase:[Math.random(),Math.random(),Math.random(),Math.random(),Math.random(),Math.random(),Math.random()],
    amp:0, stage:0, fAmp:0, fStage:0, ic1eq:0, ic2eq:0, smoothFc:0, z1:0,z2:0,z3:0,z4:0, coefTick:0, a1:0,a2:0,a3:0, resCached:-1 }; }
  defaultTable(){ const L=2048; const t=new Float32Array(L); let s; for(let i=0;i<L;i++){ s=0; for(let h=1;h<=16;h++) s+=Math.sin(6.28318530718*h*i/L)/h; t[i]=s; }
    let mx=0; for(let i=0;i<L;i++) mx=Math.max(mx,Math.abs(t[i])); for(let i=0;i<L;i++) t[i]=(t[i]/(mx||1))*0.9; return t; }
  buildMips(t){ const L=t.length; const m=[t]; let c=t; for(let k=0;k<5;k++){ const n=new Float32Array(L); for(let i=0;i<L;i++) n[i]=(c[(i-1+L)%L]+2*c[i]+c[(i+1)%L])*0.25; m.push(n); c=n; } return m; }
  num(v,lo,hi,fb){ return (typeof v==='number'&&isFinite(v))?Math.max(lo,Math.min(hi,v)):fb; }
  setParams(o){ Object.assign(this.p,o||{}); const p=this.p;
    p.cutoff=this.num(p.cutoff,40,16000,2600); p.res=this.num(p.res,0.1,20,2); p.unison=this.num(p.unison,1,7,3);
    p.master=this.num(p.master,10,100,80); p.attack=this.num(p.attack,1,3000,12); p.decay=this.num(p.decay,10,3000,260);
    p.release=this.num(p.release,30,5000,650); p.fAttack=this.num(p.fAttack,1,3000,5); p.fDecay=this.num(p.fDecay,10,3000,300);
    p.fRelease=this.num(p.fRelease,30,5000,400); p.wtPos=this.num(p.wtPos,0,100,0); p.spread=this.num(p.spread,0,50,12); }
  onMsg(m){ if(!m) return;
    if(m.type==='params') this.setParams(m.values);
    else if(m.type==='noteOn') this.noteOn(m.note,m.vel);
    else if(m.type==='noteOff') this.noteOff(m.note);
    else if(m.type==='noteOnAt'){ if(m.when<=currentTime) this.noteOn(m.note,m.vel); else this.queue.push({t:m.when,a:1,n:m.note,v:m.vel}); }
    else if(m.type==='noteOffAt'){ if(m.when<=currentTime) this.noteOff(m.note); else this.queue.push({t:m.when,a:0,n:m.note}); }
    else if(m.type==='noteBend'){ const v=this.find(m.note); if(v){ v.bend=m.bend||0; v.bendMul=Math.pow(2,v.bend/12); } }
    else if(m.type==='wavetable'){ if(m.table&&m.table.length){ this.wtable=m.table; this.wtLen=m.table.length; this.wtMips=null; } }
    else if(m.type==='panic'){ this.queue=[]; for(const v of this.voices){ v.active=false; v.stage=0; v.amp=0; } } }
  find(n){ for(const v of this.voices) if(v.note===n&&v.active) return v; return null; }
  freeVoice(){ for(const v of this.voices) if(!v.active) return v; let b=this.voices[0]; for(const v of this.voices) if(v.amp<b.amp) b=v; return b; }
  noteOn(n,vel){ const p=this.p;
    if(p.glideTime>0){ let c=0,l=null; for(const v of this.voices) if(v.active){c++;l=v;}
      if(c===1&&l){ const nb=440*Math.pow(2,(n-69)/12); l.glideRate=(nb-l.baseFreq)/Math.max(0.001,p.glideTime/1000); l.targetBaseFreq=nb; l.note=n; return; } }
    const v=this.freeVoice(); const f=this.newVoice(); for(const k in f) v[k]=f[k];
    v.active=true; v.note=n; v.vel=Math.max(0.05,this.num(vel,0,1,0.8));
    v.baseFreq=440*Math.pow(2,(n-69)/12); v.stage=1; v.amp=0; v.fStage=1; v.fAmp=0; v.smoothFc=0; }
  noteOff(n){ for(const v of this.voices) if(v.note===n&&v.active&&v.stage!==4) v.stage=4; }
  drain(){ if(!this.queue.length) return; this.queue.sort((a,b)=>a.t-b.t);
    while(this.queue.length&&this.queue[0].t<=currentTime){ const e=this.queue.shift(); if(e.a) this.noteOn(e.n,e.v); else this.noteOff(e.n); } }
  polyblep(t,dt){ if(t<dt){ t/=dt; return t+t-t*t-1; } if(t>1-dt){ t=(t-1)/dt; return t*t+t+t+1; } return 0; }
  readWT(ph,inc){ if(!this.wtMips) this.wtMips=this.buildMips(this.wtable); const m=this.wtMips;
    if(!isFinite(inc)||inc<=0) inc=0.01; if(!isFinite(ph)) ph=0;
    const maxH=0.5/Math.max(inc,0.00001); const half=this.wtLen/2;
    let aa=Math.floor(Math.log2(Math.max(1,half/Math.max(1,maxH)))); aa=Math.max(0,Math.min(m.length-1,aa));
    const scan=(this.num(this.p.wtPos,0,100,0)/100)*(m.length-1);
    let bl=Math.max(aa,Math.min(m.length-1,Math.floor(scan))); if(!isFinite(bl)) bl=0; bl=Math.max(0,Math.min(m.length-1,bl|0));
    const nl=Math.min(m.length-1,bl+1); const fr=scan-Math.floor(scan);
    const A=m[bl]||this.wtable, B=m[nl]||this.wtable;
    const wp=ph*this.wtLen; const w0=Math.floor(wp)%this.wtLen; const w1=(w0+1)%this.wtLen; const wf=wp-Math.floor(wp);
    const a=A[w0]+(A[w1]-A[w0])*wf, b=B[w0]+(B[w1]-B[w0])*wf; return a+(b-a)*fr; }
  osc(ph,inc,wave,v){ const TP=6.28318530718;
    if(wave===4) return this.readWT(ph,inc);
    if(wave===3) return Math.sin(TP*ph);
    if(wave===0) return (2*ph-1)-this.polyblep(ph,inc);
    if(wave===1){ const s=ph<0.5?1:-1; return s+this.polyblep(ph,inc)-this.polyblep((ph+0.5)%1,inc); }
    const s=ph<0.5?1:-1; const c=s+this.polyblep(ph,inc)-this.polyblep((ph+0.5)%1,inc);
    v.triInt+=c*inc*4; v.triInt-=v.triInt*0.0005; return Math.max(-1,Math.min(1,v.triInt)); }
  process(inputs,outputs){ try{
    const out=outputs[0]; const nCh=out.length; const N=out[0].length; const p=this.p; const sr=sampleRate; const TP=6.28318530718;
    this.drain();
    const aC=1-Math.exp(-1/(Math.max(1,p.attack)/1000*sr));
    const dC=1-Math.exp(-1/(Math.max(10,p.decay)/1000*sr));
    const rC=1-Math.exp(-1/(Math.max(30,p.release)/1000*sr));
    const fAC=1-Math.exp(-1/(Math.max(1,p.fAttack)/1000*sr));
    const fDC=1-Math.exp(-1/(Math.max(10,p.fDecay)/1000*sr));
    const fRC=1-Math.exp(-1/(Math.max(30,p.fRelease)/1000*sr));
    const sus=this.num(p.sustain,0,100,70)/100;
    const un=Math.max(1,Math.min(7,Math.round(p.unison)));
    const lfoI=this.num(p.lfoRate,0,50,2)/sr; const lfo2I=this.num(p.lfo2Rate,0,50,5)/sr;
    const uniM=[]; for(let u=0;u<un;u++){ const off=un===1?0:((u-(un-1)/2)/((un-1)/2))*p.spread; uniM.push(Math.pow(2,(p.detune+off)/1200)); }
    for(let i=0;i<N;i++){
      this.lfoPhase+=lfoI; if(this.lfoPhase>=1)this.lfoPhase-=1;
      const ls=Math.sin(TP*this.lfoPhase); const lfoV=p.lfoWave===1?(ls>=0?1:-1):ls;
      this.lfo2Phase+=lfo2I; if(this.lfo2Phase>=1)this.lfo2Phase-=1;
      const l2=Math.sin(TP*this.lfo2Phase); const lfo2V=p.lfo2Wave===1?(l2>=0?1:-1):l2;
      let acc=0;
      for(const v of this.voices){ if(!v.active) continue;
        let tgt=0,cf=0;
        if(v.stage===1){tgt=v.vel;cf=aC;if(v.amp>=v.vel*0.995)v.stage=2;}
        else if(v.stage===2){tgt=v.vel*sus;cf=dC;if(Math.abs(v.amp-tgt)<0.002)v.stage=3;}
        else if(v.stage===3){tgt=v.vel*sus;cf=dC*0.2;}
        else if(v.stage===4){tgt=0;cf=rC;if(v.amp<0.0004){v.active=false;v.stage=0;}}
        v.amp+=(tgt-v.amp)*cf; if(!v.active) continue;
        if(v.targetBaseFreq!==0){ v.baseFreq+=v.glideRate/sr;
          if((v.glideRate>=0&&v.baseFreq>=v.targetBaseFreq)||(v.glideRate<0&&v.baseFreq<=v.targetBaseFreq)){ v.baseFreq=v.targetBaseFreq; v.targetBaseFreq=0; v.glideRate=0; } }
        const envN=v.vel>0?Math.min(1,v.amp/v.vel):0;
        let fT=0,fC=0;
        if(v.fStage===1){fT=1;fC=fAC;if(v.fAmp>=0.995)v.fStage=2;}
        else if(v.fStage===2){fT=this.num(p.fSustain,0,100,40)/100;fC=fDC;if(Math.abs(v.fAmp-fT)<0.002)v.fStage=3;}
        else if(v.fStage===3){fT=this.num(p.fSustain,0,100,40)/100;fC=fDC*0.2;}
        else if(v.fStage===4){fT=0;fC=fRC;}
        v.fAmp+=(fT-v.fAmp)*fC; const fEnvN=v.fAmp;
        let mCut=0,mPit=0,mAmp=0,mFm=0,mRes=0;
        const src=[0,lfoV,lfo2V,envN,fEnvN,(v.vel-0.5)*2];
        for(let mi=0;mi<8;mi++){ const ms=p['m'+mi+'s'],ma=p['m'+mi+'a']/100,md=p['m'+mi+'d'];
          if(!ms||!ma||!md) continue; const mv=src[ms]*ma;
          if(md===1)mCut+=mv*4000; else if(md===2)mPit+=mv*12; else if(md===3)mAmp+=mv; else if(md===4)mFm+=mv; else if(md===5)mRes+=mv*10; }
        let pe=0;
        if(p.lfoTarget===1) pe+=(lfoV*(this.num(p.lfoDepth,0,100,0)/100)*80)/1200;
        pe+=lfoV*(p.lfoPitch/100)+envN*(p.envPitch/100)*2+mPit/100;
        const pMod=Math.pow(2,pe);
        let sig=0;
        for(let u=0;u<un;u++){
          let f=v.baseFreq*v.bendMul*pMod*uniM[u]; if(!isFinite(f)||f<=0)f=220;
          const fde=(p.fmDepth/100)*f*2 + lfoV*(p.lfoFM/100)*f*2 + envN*(p.envFM/100)*f*2 + mFm*f*2;
          let fmSum=0;
          if(fde!==0){ v.modPh[0]+=(f*p.fmRatio)/sr; if(v.modPh[0]>=1)v.modPh[0]-=1; fmSum+=Math.sin(TP*v.modPh[0])*fde; }
          if(p.fm2Depth>0){ v.modPh[1]+=(f*p.fm2Ratio)/sr; if(v.modPh[1]>=1)v.modPh[1]-=1; fmSum+=Math.sin(TP*v.modPh[1])*(p.fm2Depth/100)*f*2; }
          if(p.fm3Depth>0){ v.modPh[2]+=(f*p.fm3Ratio)/sr; if(v.modPh[2]>=1)v.modPh[2]-=1; fmSum+=Math.sin(TP*v.modPh[2])*(p.fm3Depth/100)*f*2; }
          if(p.fm4Depth>0){ v.modPh[3]+=(f*p.fm4Ratio)/sr; if(v.modPh[3]>=1)v.modPh[3]-=1; fmSum+=Math.sin(TP*v.modPh[3])*(p.fm4Depth/100)*f*2; }
          if(p.fm5Depth>0){ v.modPh[4]+=(f*p.fm5Ratio)/sr; if(v.modPh[4]>=1)v.modPh[4]-=1; fmSum+=Math.sin(TP*v.modPh[4])*(p.fm5Depth/100)*f*2; }
          if(p.fm6Depth>0){ v.modPh[5]+=(f*p.fm6Ratio)/sr; if(v.modPh[5]>=1)v.modPh[5]-=1; fmSum+=Math.sin(TP*v.modPh[5])*(p.fm6Depth/100)*f*2; }
          const inc=Math.max(0.00001,(f+fmSum)/sr);
          v.uniPhase[u]+=inc; if(v.uniPhase[u]>=1)v.uniPhase[u]-=1;
          sig+=this.osc(v.uniPhase[u],Math.min(inc,0.49),p.wave,v);
        }
        sig/=un;
        if(p.sub>0){ v.subPhase+=(v.baseFreq*v.bendMul/2)/sr; if(v.subPhase>=1)v.subPhase-=1; sig+=(p.sub/100)*Math.sin(TP*v.subPhase); }
        if(p.noise>0){ sig+=(Math.random()*2-1)*(p.noise/100); }
        let fc=p.cutoff+(p.filterEnv/100)*9000*envN;
        if(p.lfoTarget===0) fc+=lfoV*(this.num(p.lfoDepth,0,100,0)/100)*3500;
        fc+=lfoV*(p.lfoCutoff/100)*4000 + mCut + fEnvN*(p.fEnvAmt/100)*6000;
        fc=Math.min(18000,Math.max(40,fc));
        v.smoothFc = v.smoothFc===0 ? fc : v.smoothFc+(fc-v.smoothFc)*0.0015;
        const resEff=Math.max(0.1,Math.min(25,p.res+mRes));
        if(v.coefTick<=0||Math.abs(resEff-v.resCached)>0.05){
          const g=Math.tan(3.14159265359*v.smoothFc/sr); const k=Math.max(0.02,2-(resEff/10));
          v.a1=1/(1+g*(g+k)); v.a2=g*v.a1; v.a3=g*v.a2; v.coefTick=16; v.resCached=resEff; }
        v.coefTick--;
        const a1=v.a1,a2=v.a2,a3=v.a3;
        const v3=sig-v.ic2eq; const v1=a1*v.ic1eq+a2*v3; const v2=v.ic2eq+a2*v.ic1eq+a3*v3;
        v.ic1eq=2*v1-v.ic1eq; v.ic2eq=2*v2-v.ic2eq;
        let fsig;
        if(p.filterType===4){ const g=Math.min(1,Math.max(0.001,v.smoothFc/18000)); const kk=Math.min(3.8,Math.max(0,(p.res/20)*3.8));
          const inp=sig-kk*v.z4;
          v.z1+=g*(Math.tanh(inp*0.6)-Math.tanh(v.z1)); v.z2+=g*(Math.tanh(v.z1)-Math.tanh(v.z2));
          v.z3+=g*(Math.tanh(v.z2)-Math.tanh(v.z3)); v.z4+=g*(Math.tanh(v.z3)-Math.tanh(v.z4)); fsig=v.z4; }
        else if(p.filterType===0) fsig=v2;
        else if(p.filterType===1){ const k=Math.max(0.02,2-(resEff/10)); fsig=sig-k*v1-v2; }
        else if(p.filterType===2) fsig=v1;
        else fsig=sig-v1;
        let ampMod=1;
        if(p.lfoTarget===2) ampMod=1-(this.num(p.lfoDepth,0,100,0)/200)+lfoV*(this.num(p.lfoDepth,0,100,0)/200);
        ampMod*=1-(p.lfoAmp/200)+lfoV*(p.lfoAmp/200);
        ampMod*=Math.max(0,1+mAmp);
        acc+=fsig*v.amp*ampMod;
      }
      const master=this.num(p.master,10,100,80)/100;
      let s=Math.tanh(acc*master*0.8); if(!isFinite(s)) s=0;
      for(let c=0;c<nCh;c++) out[c][i]=s;
    }
    this.tick+=N;
    if(this.tick>=2048){ this.tick=0; let c=0; for(const v of this.voices) if(v.active) c++; this.port.postMessage({type:'voices',count:c}); }
    return true;
  } catch(e){ this.port.postMessage({type:'error',msg:String(e&&e.message?e.message:e)}); return true; } }
}
registerProcessor('psysynth-processor', SynthProcessor);
`;

var PsySynth = (window.PsySynth = window.PsySynth || {});

class SynthEngine {
  constructor() {
    this.ctx = null;
    this._fin = function (v, fb) { return (typeof v === 'number' && isFinite(v)) ? v : fb; };
    this.node = null;
    this.analyser = null;
    this.ready = false;
    this.onVoices = null;
    this.params = Object.assign({}, PsySynth.DEFAULT);
  }

  boot() {
    if (this.ready) return Promise.resolve();
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const self = this;
    return this.ctx.audioWorklet.addModule(url).then(function () {
      self.node = new AudioWorkletNode(self.ctx, 'psysynth-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]
      });
      self.node.port.onmessage = function (e) {
        if (e.data && e.data.type === 'voices' && self.onVoices) self.onVoices(e.data.count);
        else if (e.data && e.data.type === 'error') {
          var es = document.getElementById('psyErrStrip');
          if (es) { es.style.display = 'block'; es.textContent = 'WORKLET ERROR: ' + e.data.msg; }
        }
      };

      self.fxInput = self.ctx.createGain();
      self.node.connect(self.fxInput);

      self.master = self.ctx.createGain();
      self.master.gain.value = self._fin(self.params.master, 80) / 100;

      self.dry = self.ctx.createGain();
      self.dry.gain.value = 0.9;
      self.fxInput.connect(self.dry);
      self.dry.connect(self.master);

      self.delSend = self.ctx.createGain();
      self.delSend.gain.value = (self._fin(self.params.delay, 22) / 100) * 0.55;
      self.delay = self.ctx.createDelay(2);
      self.delay.delayTime.value = 0.32;
      self.delFb = self.ctx.createGain();
      self.delFb.gain.value = 0.38;
      self.fxInput.connect(self.delSend);
      self.delSend.connect(self.delay);
      self.delay.connect(self.delFb);
      self.delFb.connect(self.delay);
      self.delay.connect(self.master);

      self.revSend = self.ctx.createGain();
      self.revSend.gain.value = (self._fin(self.params.reverb, 35) / 100) * 0.85;
      self.conv = self.ctx.createConvolver();
      self.conv.buffer = self.makeIR(2.6, 3.1);
      self.fxInput.connect(self.revSend);
      self.revSend.connect(self.conv);
      self.conv.connect(self.master);

      /* FX RACK: distortion / chorus / bitcrush as parallel sends */
      self.distSend = self.ctx.createGain();
      self.distSend.gain.value = (self._fin(self.params.fxDist, 0) / 100) * 0.6;
      self.waveshaper = self.ctx.createWaveShaper();
      self.waveshaper.curve = self.makeDistCurve(60);
      self.waveshaper.oversample = '2x';
      self.fxInput.connect(self.distSend);
      self.distSend.connect(self.waveshaper);
      self.waveshaper.connect(self.master);
      self.chSend = self.ctx.createGain();
      self.chSend.gain.value = (self._fin(self.params.fxChorus, 0) / 100) * 0.5;
      self.chDelay = self.ctx.createDelay(1);
      self.chDelay.delayTime.value = 0.02;
      self.chLfo = self.ctx.createOscillator();
      self.chLfo.frequency.value = self._fin(self.params.chRate, 0.8);
      self.chLfoDepth = self.ctx.createGain();
      self.chLfoDepth.gain.value = 0.004;
      self.chLfo.connect(self.chLfoDepth);
      self.chLfoDepth.connect(self.chDelay.delayTime);
      self.chLfo.start();
      self.fxInput.connect(self.chSend);
      self.chSend.connect(self.chDelay);
      self.chDelay.connect(self.master);
      self.crSend = self.ctx.createGain();
      self.crSend.gain.value = (self._fin(self.params.fxCrush, 0) / 100) * 0.5;
      self.crusher = self.ctx.createWaveShaper();
      self.crusher.curve = self.makeCrushCurve(6);
      self.fxInput.connect(self.crSend);
      self.crSend.connect(self.crusher);
      self.crusher.connect(self.master);
      self.analyser = self.ctx.createAnalyser();
      self.analyser.fftSize = 2048;
      self.master.connect(self.analyser);
      self.analyser.connect(self.ctx.destination);

      self.ready = true;
      self.sendParams();
      URL.revokeObjectURL(url);
      return self.ctx.resume();
    }).catch(function (e) {
      var es = document.getElementById('psyErrStrip');
      if (es) { es.style.display = 'block'; es.textContent = 'BOOT ERROR: ' + (e && e.message ? e.message : e); }
      throw e;
    });
  }

  makeDistCurve(amount) {
    const n = 1024; const c = new Float32Array(n);
    for (let i=0;i<n;i++){ const x = (i/(n-1))*2-1; c[i] = Math.tanh(x*(1+amount*0.05)); }
    return c;
  }
  makeCrushCurve(bits) {
    const n = 1024; const c = new Float32Array(n);
    const steps = Math.pow(2, bits);
    for (let i=0;i<n;i++){ const x=(i/(n-1))*2-1; c[i]=Math.round(x*steps)/steps; }
    return c;
  }
  makeIR(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  sendParams() { if (this.node) this.node.port.postMessage({ type: 'params', values: this.params }); }
  setWavetable(table) { if (this.node) this.node.port.postMessage({ type: 'wavetable', table: table }); }

  set(key, value) {
    this.params[key] = value;
    if (key === 'delay' && this.delSend) this.delSend.gain.value = (value / 100) * 0.55;
    else if (key === 'reverb' && this.revSend) this.revSend.gain.value = (value / 100) * 0.85;
      if (this.distSend) this.distSend.gain.value = (this._fin(this.params.fxDist,0) / 100) * 0.6;
      if (this.chSend) this.chSend.gain.value = (this._fin(this.params.fxChorus,0) / 100) * 0.5;
      if (this.crSend) this.crSend.gain.value = (this._fin(this.params.fxCrush,0) / 100) * 0.5;
      if (this.chLfo) this.chLfo.frequency.value = this._fin(this.params.chRate,0.8);
    else if (key === 'master' && this.master) this.master.gain.value = value / 100;
    else this.sendParams();
  }
  setAll(obj) {
    Object.assign(this.params, PsySynth.DEFAULT);
    Object.assign(this.params, obj);
    if (this.delSend) this.delSend.gain.value = (this.params.delay / 100) * 0.55;
    if (this.revSend) this.revSend.gain.value = (this.params.reverb / 100) * 0.85;
    if (this.master) this.master.gain.value = this.params.master / 100;
    this.sendParams();
  }
  noteOn(note, vel) { if (this.node) this.node.port.postMessage({ type: 'noteOn', note: note, vel: vel }); }
  noteOff(note) { if (this.node) this.node.port.postMessage({ type: 'noteOff', note: note }); }
  noteOnAt(note, vel, when) { if (this.node) this.node.port.postMessage({ type: 'noteOnAt', note: note, vel: vel, when: when }); }
  noteOffAt(note, when) { if (this.node) this.node.port.postMessage({ type: 'noteOffAt', note: note, when: when }); }
  noteBend(note, semis) { if (this.node) this.node.port.postMessage({ type: 'noteBend', note: note, bend: semis }); }
  panic() { if (this.node) this.node.port.postMessage({ type: 'panic' }); }
  latencyMs() {
    if (!this.ctx) return 0;
    return ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000;
  }
}

PsySynth.SynthEngine = SynthEngine;
