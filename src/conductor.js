var Psy = (window.PsySynth = window.PsySynth || {});
Psy.SCALES = { minor:[0,2,3,5,7,8,10], phrygian:[0,1,3,5,7,8,10], harmonic:[0,2,3,5,7,8,11], dorian:[0,2,3,5,7,9,10], major:[0,2,4,5,7,9,11] };
function euclid(n,k){var r=[],b=0;for(var i=0;i<n;i++){b+=k;if(b>=n){b-=n;r.push(1);}else r.push(0);}return r;}
class Conductor {
  constructor(e){this.engine=e;this.enabled=false;this.key=45;this.scale='minor';this.bpm=141;this.complexity=0.6;this.stepPos=0;this.bar=0;this.nextTime=0;this.timer=null;this.padHeld=[];this.leadDeg=0;this.seed=1;this.drumsOn=true;this.progOffset=0;this.wantFill=false;this.drums=null;}
  rnd(){this.seed=(this.seed*16807)%2147483647;return (this.seed-1)/2147483646;}
  reseed(s){this.seed=(s||12345)%2147483646+1;}
  deg2note(d,o){var sc=Psy.SCALES[this.scale]||Psy.SCALES.minor,L=sc.length,i=((d%L)+L)%L;return this.key+12*o+sc[i]+12*Math.floor(d/L);}
  arrange(){var b=this.bar%9;if(b<2)return 'intro';if(b===8)return 'break';return 'full';}
  mutate(){this.reseed(Math.floor(Math.random()*2147483646)+1);this.progOffset=(this.progOffset+1)%4;this.leadDeg=0;}
  fillNext(){this.wantFill=true;}
  setEnabled(on){this.enabled=on;if(on)this.startTimer();else{this.stopTimer();this.releasePad();if(this.engine&&this.engine.panic)this.engine.panic();}}
  startTimer(){if(this.timer)return;var s=this;this.nextTime=0;this.timer=setInterval(function(){s.tick();},25);}
  stopTimer(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
  releasePad(){for(var i=0;i<this.padHeld.length;i++)this.engine.noteOff(this.padHeld[i]);this.padHeld=[];}
  ensureDrums(){if(this.drums||!this.engine.ctx)return;var c=this.engine.ctx,sr=c.sampleRate;var sat=function(x){return Math.tanh(x*1.4)*0.85;};
    var kl=Math.floor(sr*0.5),kb=c.createBuffer(1,kl,sr),kd=kb.getChannelData(0),ph=0;
    for(var n=0;n<kl;n++){var t=n/sr;var f=40+160*Math.exp(-t*34);ph+=2*Math.PI*f/sr;kd[n]=sat(Math.sin(ph)*Math.exp(-t*7)*1.3+(Math.random()*2-1)*Math.exp(-t*300)*0.5);}
    function hb(dur,dec){var hl=Math.floor(sr*dur),b=c.createBuffer(1,hl,sr),d=b.getChannelData(0),pv=0;for(var n=0;n<hl;n++){var t=n/sr;var x=Math.random()*2-1;d[n]=(x-pv)*Math.exp(-t*dec)+Math.sin(2*Math.PI*6000*t)*Math.exp(-t*dec*1.4)*0.15;pv=x;}return b;}
    var sl=Math.floor(sr*0.25),sb=c.createBuffer(1,sl,sr),sd=sb.getChannelData(0);
    for(var n=0;n<sl;n++){var t=n/sr;var tp=(t<0.01?1:(t<0.02?0.7:(t<0.03?0.5:0.35)));sd[n]=sat(((Math.random()*2-1)*Math.exp(-t*22)+Math.sin(2*Math.PI*180*t)*Math.exp(-t*30)*0.5)*tp);}
    this.drums={ctx:c,kick:kb,hatC:hb(0.07,90),hatO:hb(0.3,26),snare:sb};}
  playBuf(buf,t,g,pan){if(!isFinite(t))return;var c=this.drums.ctx,s=c.createBufferSource();s.buffer=buf;var gn=c.createGain();gn.gain.value=g;var o=gn;if(pan&&c.createStereoPanner){var p=c.createStereoPanner();p.pan.value=pan;gn.connect(p);o=p;}s.connect(gn);o.connect(this.engine.master||this.engine.fxInput);s.start(t);}
  kick(t){this.playBuf(this.drums.kick,t,1.0,0);var fx=this.engine.fxInput;if(fx){fx.gain.cancelScheduledValues(t);fx.gain.setTargetAtTime(0.55,t,0.004);fx.gain.setTargetAtTime(1.0,t+0.02,0.12);}}
  hat(t,o){this.playBuf(o?this.drums.hatO:this.drums.hatC,t,o?0.3:0.24,0.25);}
  snare(t){this.playBuf(this.drums.snare,t,0.5,-0.15);}
  tick(){if(!this.enabled||!this.engine.ctx)return;var ctx=this.engine.ctx;if(this.nextTime<ctx.currentTime-0.05)this.nextTime=ctx.currentTime+0.05;var sd=(60/this.bpm)/4;while(this.nextTime<ctx.currentTime+0.12){this.playStep(this.stepPos,this.nextTime,sd);this.stepPos=(this.stepPos+1)%16;if(this.stepPos===0)this.bar++;this.nextTime+=sd;}}
    setLive(k,v){this.engine.set(k,v);var R=(window.Psy&&Psy.REG)||{};if(R[k])R[k].set(v,true);}
  automate(ARR){var tgt=ARR==='full'?0.9:(ARR==='intro'?0.4:0.15);this.energy=(this.energy==null)?tgt:this.energy+(tgt-this.energy)*0.35;var e=Math.min(1,this.energy*(0.5+this.complexity*0.6));
    this.setLive('cutoff',Math.round(300+e*6500));this.setLive('res',Math.round(2+e*8));this.setLive('reverb',Math.round(20+(1-e)*25));this.setLive('delay',Math.round(15+e*25));this.setLive('fmDepth',Math.round(e*45));this.setLive('lfoDepth',Math.round(e*60));}
playStep(i,t,sd){var PH=[[0,5,3,4],[0,6,5,4],[0,3,5,4],[0,2,5,4]];var root=PH[(Math.floor(this.bar/2)+this.progOffset)%PH.length][this.bar%4];var dr=this.complexity;var _ab = this.bar % 9; var ARR = _ab < 2 ? 'intro' : (_ab === 8 ? 'break' : 'full');this.ensureDrums();
    if(this.drumsOn&&this.drums&&ARR==='full'){if(i%4===0)this.kick(t);if(i%4===2)this.hat(t,false);if(i===4||i===12)this.snare(t);if(i===14&&dr>0.6)this.hat(t,true);}
    if((ARR==='break'||this.wantFill)&&i>=12&&this.drums&&this.drumsOn)this.hat(t,i===15);
    if(i===15)this.wantFill=false;
    var bp=euclid(16,dr>0.85?16:(dr>0.55?8:4));
    if(ARR!=='break'&&bp[i]){var bn=this.deg2note(root,0);this.engine.noteOnAt(bn,(i%4===0)?0.95:0.7,t);this.engine.noteOffAt(bn,t+sd*0.9);}
    var lp=euclid(16,Math.round(2+dr*6));
    if(ARR!=='intro'&&lp[i]&&this.rnd()<dr*0.7){this.leadDeg+=(this.rnd()<0.5?1:(this.rnd()<0.3?2:-1));if(this.leadDeg>7)this.leadDeg-=7;if(this.leadDeg<0)this.leadDeg+=7;var ln=this.deg2note(root+this.leadDeg,2);this.engine.noteOnAt(ln,0.6,t);this.engine.noteOffAt(ln,t+sd*(this.rnd()<0.3?3:1.5));}
    if(i===0&&(this.bar%2===0)){this.releasePad();var to=[root,root+4];for(var k=0;k<to.length;k++){var pn=this.deg2note(to[k],1);this.engine.noteOnAt(pn,0.35,t);this.padHeld.push(pn);}}
    if(i===0){this.automate(ARR);}}
}
Psy.Conductor = Conductor;
