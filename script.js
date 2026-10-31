const $=id=>document.getElementById(id);
const ic=n=>`<svg class="i"><use href="#i-${n}"/></svg>`;
const store={get(k,d){try{return localStorage.getItem(k)??d}catch{return d}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
// deteksi perangkat mobile / layar sentuh: hanya dipakai untuk mode hemat tampilan (animasi)
const LITE=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Mac/i.test(navigator.platform))||(matchMedia('(pointer:coarse)').matches&&innerWidth<900);
let mode='video',file=null,segs=[],worker=null,duration=0,peaks=[],media=$('video'),job=0,running=false,playing=false,heroVis=true;
const W={key:'',base:null,on:null,last:-1}; // cache gambar gelombang suara

// ---------- tema, hero, reveal ----------
const root=document.documentElement;
// hentikan animasi dekoratif saat memproses / memutar media / hero tak terlihat (hemat CPU & GPU)
const updPD=()=>document.body.classList.toggle('pd',running||playing||!heroVis);
new IntersectionObserver(([e])=>{heroVis=e.isIntersecting;updPD()}).observe(document.querySelector('.hero'));
function setTheme(t){root.dataset.theme=t;$('themeIc').setAttribute('href',t==='dark'?'#i-sun':'#i-moon');store.set('sabda-theme',t);drawWave(true)}
setTheme(store.get('sabda-theme',matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
$('theme').onclick=()=>setTheme(root.dataset.theme==='dark'?'light':'dark');
$('dbar').innerHTML=Array.from({length:LITE?24:38},()=>`<span style="--h:${(.3+Math.random()*.7).toFixed(2)};--d:-${(Math.random()*1.3).toFixed(2)}s"></span>`).join('');
{const ps=[...document.querySelectorAll('.dcard p')];let k=0;setInterval(()=>{if(document.body.classList.contains('pd'))return;k=(k+1)%ps.length;ps.forEach((p,i)=>p.classList.toggle('on',i===k))},2400)}
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.15});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));

// ---------- util ----------
const fmt=s=>{s=Math.max(0,s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),c=Math.floor(s%60);return(h?h+':':'')+String(m).padStart(2,'0')+':'+String(c).padStart(2,'0')};
const ts=(s,sep)=>{const p=(n,l=2)=>String(n).padStart(l,'0');return`${p(Math.floor(s/3600))}:${p(Math.floor(s%3600/60))}:${p(Math.floor(s%60))}${sep}${p(Math.round((s%1)*1000),3)}`};
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(msg,bad,ms=2600){const t=document.createElement('div');t.className='toast'+(bad?' bad':'');t.innerHTML=ic(bad?'x':'ok')+esc(msg);$('toasts').append(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),320)},ms)}
function countUp(el,to,f=v=>Math.round(v)){const t0=performance.now();(function s(n){const p=Math.min(1,(n-t0)/900),e=1-Math.pow(1-p,3);el.textContent=f(to*e);if(p<1)requestAnimationFrame(s)})(t0)}
const frames=n=>new Promise(r=>{const f=()=>--n<=0?r():requestAnimationFrame(f);requestAnimationFrame(f)});

// ---------- mode & file ----------
const FM={video:['MP4','MOV','WEBM','MKV'],audio:['MP3','WAV','M4A','OGG']};
function setMode(m){
  if(running)return;
  mode=m;$('seg2').dataset.m=m;
  document.querySelectorAll('.seg2 button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  $('dT').textContent=m==='video'?'Jatuhkan video di sini':'Jatuhkan rekaman audio di sini';
  $('fmts').innerHTML=FM[m].map(x=>`<span>${x}</span>`).join('');
  $('chipIc').setAttribute('href',m==='video'?'#i-vid':'#i-aud');
  $('file').accept=m+'/*';
  if(file&&!file.type.startsWith(m))clearFile();
}
document.querySelectorAll('.seg2 button').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
const drop=$('drop');
drop.onclick=()=>$('file').click();
drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click()}};
$('chg').onclick=()=>$('file').click();
$('clr').onclick=clearFile;
$('file').onchange=e=>pick(e.target.files[0]);
let dd=0;
addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')&&!running){dd++;$('dragov').classList.add('on')}});
addEventListener('dragleave',()=>{if(--dd<=0){dd=0;$('dragov').classList.remove('on')}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dd=0;$('dragov').classList.remove('on');if(!running&&e.dataTransfer.files[0]){location.hash='#mulai';pick(e.dataTransfer.files[0])}});
function pick(f){
  if(!f)return;
  const ok=/^(video|audio)\//.test(f.type)||/\.(mp4|mov|mkv|webm|mp3|wav|m4a|ogg|aac|flac)$/i.test(f.name);
  if(!ok){toast('Format tidak didukung. Pilih file video atau audio.',true);return}
  mode!==(f.type.startsWith('audio')?'audio':'video')&&setMode(f.type.startsWith('audio')?'audio':'video');
  file=f;
  $('drop').hidden=true;$('chip').hidden=false;
  $('cN').textContent=f.name;$('cM').textContent=(f.size/1048576).toFixed(1)+' MB';
  const el=document.createElement(mode==='video'?'video':'audio');el.preload='metadata';const u=URL.createObjectURL(f);el.src=u;
  el.onloadedmetadata=()=>{if(isFinite(el.duration))$('cM').textContent=(f.size/1048576).toFixed(1)+' MB · '+fmt(el.duration);URL.revokeObjectURL(u);el.removeAttribute('src');el.load()};
  $('go').disabled=false;$('goHint').textContent='Siap. Klik mulai, dan kamu bisa membatalkan kapan saja.';
}
function clearFile(){file=null;$('file').value='';$('chip').hidden=true;$('drop').hidden=false;$('go').disabled=true;$('goHint').textContent='Pilih file dulu untuk memulai. Pertama kali, model diunduh sekali lalu tersimpan.'}
$('lang').value=store.get('sabda-lang','indonesian');
{const m=store.get('sabda-model','onnx-community/whisper-base');const r=document.querySelector(`[name=mdl][value="${m}"]`);if(r)r.checked=true}

// ---------- audio extraction ----------
// Decode langsung ke 16 kHz lewat OfflineAudioContext. Jauh lebih hemat memori
// dibanding decode 44,1/48 kHz stereo lalu resample (penyebab utama HP kehabisan RAM).
const decode=(ctx,b)=>new Promise((res,rej)=>{const p=ctx.decodeAudioData(b,res,rej);p&&p.then&&p.then(res,rej)});
async function extractAudio(f){
  const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  let buf=await f.arrayBuffer();
  let d;
  try{d=await decode(new OAC(1,1,16000),buf)}catch{throw new Error('Browser tidak bisa membaca suara dari file ini. Coba MP4, WebM, MP3, atau WAV.')}
  buf=null;duration=d.duration;
  let out;
  if(d.numberOfChannels===1&&d.sampleRate===16000)out=d.getChannelData(0).slice();
  else{ // downmix/resample dikerjakan engine audio (di luar thread utama)
    const off=new OAC(1,Math.ceil(d.duration*16000),16000);
    const s=off.createBufferSource();s.buffer=d;s.connect(off.destination);s.start();
    out=(await off.startRendering()).getChannelData(0).slice();
  }
  d=null;return out;
}
function calcPeaks(a,n=140){const st=Math.floor(a.length/n)||1,step=Math.max(1,Math.floor(st/256)),p=[];for(let i=0;i<n;i++){let m=0;for(let j=i*st;j<(i+1)*st&&j<a.length;j+=step){const v=Math.abs(a[j]);if(v>m)m=v}p.push(m)}let mx=0;for(const v of p)if(v>mx)mx=v;mx=mx||1;return p.map(v=>v/mx)}

// ---------- worker (pemotongan blok + transkripsi, semua di luar thread utama) ----------
const code=`
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
env.allowLocalModels=false;
function plan(a,sr,len){
  var n=a.length,out=[],st=0;
  while(st<n){
    var end=st+len*sr;
    if(end>=n-8*sr)end=n;
    else{
      var best=end,bv=Infinity,w=1600;
      for(var c=end-4*sr;c<=end+4*sr;c+=w){var s=0;for(var k=c;k<c+w&&k<n;k++)s+=a[k]*a[k];if(s<bv){bv=s;best=c+w/2}}
      end=Math.floor(best);
    }
    out.push({offset:st/sr,start:st,end:end});st=end;
  }
  return out;
}
self.onmessage=async({data})=>{
  const a=data.audio,blocks=plan(a,16000,60);
  self.postMessage({type:'plan',ends:blocks.map(b=>b.end/16000)});
  const tries=[];
  if(data.device==='webgpu')tries.push({dev:'webgpu',dtype:{encoder_model:'fp32',decoder_model_merged:'q4'}});
  tries.push({dev:'wasm',dtype:'q8'});
  for(let t=0;t<tries.length;t++){
    const cfg=tries[t];let asr=null;
    try{
      asr=await pipeline('automatic-speech-recognition',data.model,{
        device:cfg.dev,dtype:cfg.dtype,
        progress_callback:p=>self.postMessage({type:'progress',p})
      });
      self.postMessage({type:'ready',dev:cfg.dev});
      for(let i=0;i<blocks.length;i++){
        const b=blocks[i];
        const out=await asr(a.subarray(b.start,b.end),{language:data.lang==='auto'?null:data.lang,task:'transcribe',chunk_length_s:30,stride_length_s:5,return_timestamps:true});
        const ch=(out.chunks||[{text:out.text,timestamp:[0,null]}]).map(c=>({text:c.text,s:c.timestamp[0]+b.offset,e:c.timestamp[1]==null?null:c.timestamp[1]+b.offset}));
        self.postMessage({type:'part',chunks:ch,done:i+1,total:blocks.length});
      }
      try{await asr.dispose()}catch(e){}
      self.postMessage({type:'done'});return;
    }catch(e){
      try{if(asr)await asr.dispose()}catch(x){}
      if(t===tries.length-1){self.postMessage({type:'error',message:String(e&&e.message||e)});return}
      self.postMessage({type:'reset'});
    }
  }
};`;

// ---------- layar proses ----------
const PH={
  extract:['Mengambil suara','Membuka file dan memadatkan audio ke format yang dipahami model.',0],
  model:['Menyiapkan otak AI','Mengunduh model Whisper. Cukup sekali, berikutnya langsung siap.',1],
  write:['Sedang menulis','',2],
  done:['Merapikan hasil','Menyusun segmen dan stempel waktu.',3]
};
const TIPS=['Klik teks di hasil untuk mengoreksi. File unduhan memakai versi editanmu.','Unduh format SRT untuk dipakai sebagai subtitle di YouTube atau CapCut.','Pilih bahasa yang tepat. Deteksi otomatis lebih lambat dan kadang keliru.','File kamu tidak pernah keluar dari perangkat. Semuanya diproses lokal.','Klik gelombang suara di hasil untuk lompat ke bagian mana saja.','Tekan spasi di halaman hasil untuk memutar dan menjeda.'];
let ph='extract',target=0,shown=0,wT=0,wS=0,wEnd=1,dl=false,tStart=0,tWrite=0,rafId=0,tipI=0,timers=[],cols={},nParts=0,nTotal=0,ends=[],lastT=0,lastPct=-1,lastViz=0,wl=null;
let vz={w:0,h:0,d:1,g:null,x:null};
// jaga layar tetap menyala selama proses (HP yang tidur membuat proses ditahan/dimatikan)
async function lockScreen(){try{if('wakeLock'in navigator){wl=await navigator.wakeLock.request('screen');wl.onrelease=()=>{wl=null}}}catch{}}
function unlockScreen(){try{wl&&wl.release()}catch{}wl=null}
document.addEventListener('visibilitychange',()=>{if(running&&document.visibilityState==='visible'&&!wl)lockScreen()});
function setPhase(p){
  ph=p;const [t,s,idx]=PH[p];
  $('phase').textContent=t;if(s)$('phsub').textContent=s;
  [...$('tl').children].forEach((li,k)=>{li.className=p==='done'||k<idx?'done':k===idx?'act':''});
}
function loop(now){
  if(!running)return;
  const dt=Math.min(3,(now-(lastT||now))/16.67);lastT=now; // berbasis waktu, tidak tergantung fps
  if(ph==='extract')target=Math.min(12,target+.03*dt);
  if(ph==='model'&&!dl)target=Math.max(target,Math.min(18,target+.02*dt));
  if(ph==='write'&&wT<wEnd*.97)wT+=.00012*dt;
  const k=1-Math.pow(.94,dt);
  shown+=(target-shown)*k;wS+=(wT-wS)*k;
  const p=Math.round(shown);
  if(p!==lastPct){lastPct=p;$('pct').textContent=p+'%'}
  $('pfill').style.transform='scaleX('+(shown/100).toFixed(4)+')'; // transform = tanpa layout ulang
  if(now-lastViz>=(LITE?40:16)){lastViz=now;drawViz(now/1000)}   // visualizer 25 fps di HP
  rafId=requestAnimationFrame(loop);
}
function readCols(){const cs=getComputedStyle(root);['pri','pri2','acc','mut','ink'].forEach(k=>cols[k]=cs.getPropertyValue('--'+k).trim())}
function drawViz(t){
  const c=$('viz'),w=c.clientWidth,h=c.clientHeight;if(!w)return;
  const d=Math.min(devicePixelRatio||1,LITE?1.5:2);
  if(vz.w!==w||vz.h!==h||vz.d!==d){vz={w,h,d,g:null,x:vz.x};c.width=Math.round(w*d);c.height=Math.round(h*d)}
  const x=vz.x||(vz.x=c.getContext('2d'));
  x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,w,h);
  if(!vz.g){const g=x.createLinearGradient(0,0,w,0);g.addColorStop(0,cols.pri);g.addColorStop(1,cols.pri2);vz.g=g}
  const N=Math.max(18,Math.floor(w/(LITE?14:9))),bw=w/N,wr=ph==='write'&&peaks.length;
  const bar=(X,Y,Wd,H)=>x.roundRect?x.roundRect(X,Y,Wd,H,Wd/2):x.rect(X,Y,Wd,H);
  if(wr){
    const hh=i=>{const f=i/N,p=peaks[Math.floor(f*peaks.length)];const a=Math.max(.07,p*.85)+Math.exp(-Math.pow((f-wS)*14,2))*.3*Math.abs(Math.sin(t*9+i));return Math.max(4,Math.min(1,a)*(h-10))};
    const pass=(played,fill,alpha)=>{ // satu path per warna, bukan satu path per batang
      x.beginPath();
      for(let i=0;i<N;i++){if((i/N<=wS)!==played)continue;const bh=hh(i);bar(i*bw+bw*.18,(h-bh)/2,bw*.64,bh)}
      x.globalAlpha=alpha;x.fillStyle=fill;x.fill();
    };
    pass(true,vz.g,1);pass(false,cols.mut,.3);
    x.globalAlpha=1;x.fillStyle=cols.acc;x.fillRect(wS*w-1,6,2,h-12);
  }else{
    const amp=ph==='extract'?.55:ph==='model'?.85:.35;
    x.beginPath();
    for(let i=0;i<N;i++){const a=amp*(.3+.7*Math.abs(Math.sin(t*2.2+i*.33)*Math.cos(t*1.3+i*.15)));const bh=Math.max(4,Math.min(1,a)*(h-10));bar(i*bw+bw*.18,(h-bh)/2,bw*.64,bh)}
    x.globalAlpha=.9;x.fillStyle=vz.g;x.fill();
  }
}
function showTip(){
  const el=$('tip');el.classList.add('out');
  setTimeout(()=>{$('tipT').textContent=TIPS[tipI++%TIPS.length];el.classList.remove('out')},400);
}
function startProc(){
  running=true;job++;target=shown=wT=wS=0;wEnd=1;dl=false;nParts=0;segs=[];tStart=Date.now();lastT=0;lastPct=-1;lastViz=0;vz.g=null;ends=[];nTotal=0;
  $('setup').hidden=true;$('okb').hidden=true;$('res').hidden=true;$('proc').hidden=false;
  $('iN').textContent=file.name;$('iD').textContent='-';$('iE').textContent='00:00';$('iT').textContent='menghitung…';
  $('liveBox').innerHTML='<div class="sk"></div><div class="sk"></div><div class="sk"></div>';
  readCols();setPhase('extract');tipI=Math.floor(Math.random()*TIPS.length);$('tipT').textContent=TIPS[tipI++%TIPS.length];
  updPD();lockScreen();
  rafId=requestAnimationFrame(loop);
  timers=[setInterval(()=>{$('iE').textContent=fmt((Date.now()-tStart)/1000)},500),setInterval(showTip,6000)];
  $('proc').scrollIntoView({behavior:'instant',block:'center'}); // tanpa smooth-scroll agar tidak bentrok dengan kerja berat
}
function stopProc(){running=false;cancelAnimationFrame(rafId);timers.forEach(clearInterval);timers=[];unlockScreen();updPD()}
function backToSetup(){stopProc();if(worker){worker.terminate();worker=null}$('proc').hidden=true;$('okb').hidden=true;$('setup').hidden=false}
$('cancel').onclick=()=>{job++;backToSetup();toast('Transkrip dibatalkan')};
function fail(m){backToSetup();toast(m,true)}
addEventListener('beforeunload',e=>{if(running){e.preventDefault();e.returnValue=''}});

$('go').onclick=async()=>{
  if(!file)return;
  store.set('sabda-lang',$('lang').value);
  const model=document.querySelector('[name=mdl]:checked').value;store.set('sabda-model',model);
  startProc();const my=job;
  try{
    await frames(3); // beri browser waktu menggambar layar proses sebelum kerja berat dimulai
    const a=await extractAudio(file);if(my!==job)return;
    peaks=calcPeaks(a);$('iD').textContent=fmt(duration);
    run(a,model,$('lang').value,my);
  }catch(e){if(my===job)fail(e&&e.name==='RangeError'?'Memori perangkat tidak cukup untuk file ini. Coba file lebih pendek.':e.message)}
};
function run(audio,model,lang,my){
  setPhase('model');target=Math.max(target,12);
  worker=new Worker(URL.createObjectURL(new Blob([code],{type:'text/javascript'})),{type:'module'});
  worker.onerror=()=>my===job&&fail('Gagal memuat mesin transkrip. Pastikan online dan buka lewat Chrome atau Edge.');
  const fp={};let lastP=0;
  worker.onmessage=({data})=>{
    if(my!==job)return;
    if(data.type==='plan'){ends=data.ends;nTotal=ends.length;wEnd=ends[0]/duration}
    else if(data.type==='progress'){
      const p=data.p;
      if(p.status==='progress'&&p.total){
        dl=true;fp[p.file]={l:p.loaded,t:p.total};
        const n=performance.now();if(n-lastP<250)return;lastP=n; // event unduhan sangat sering, batasi update UI
        const L=Object.values(fp).reduce((a,b)=>a+b.l,0),T=Object.values(fp).reduce((a,b)=>a+b.t,0);
        target=Math.max(target,14+31*L/T);
        $('phsub').textContent=`Mengunduh model Whisper: ${(L/1048576).toFixed(0)} dari ${(T/1048576).toFixed(0)} MB`;
      }
    }
    else if(data.type==='ready'){setPhase('write');target=Math.max(target,45);tWrite=Date.now();$('phsub').textContent=`Mendengarkan bagian 1 dari ${nTotal}`}
    else if(data.type==='reset'){segs=[];nParts=0;wT=wS=0;dl=false;for(const k in fp)delete fp[k];setPhase('model');$('phsub').textContent='Mode sebelumnya tidak berhasil, mencoba mode lain yang lebih stabil.'}
    else if(data.type==='part'){
      nParts=data.done;segs.push(...data.chunks.map(c=>({...c,text:c.text.trim()})).filter(c=>c.text));
      target=45+53*data.done/data.total;wT=ends[data.done-1]/duration;wEnd=(ends[data.done]??ends[data.done-1])/duration;
      $('phsub').textContent=data.done<data.total?`Mendengarkan bagian ${data.done+1} dari ${data.total}`:'Bagian terakhir selesai ditulis';
      const rem=(Date.now()-tWrite)/data.done*(data.total-data.done);$('iT').textContent=data.done<data.total?'±'+fmt(rem/1000):'sebentar lagi';
      const box=$('liveBox');box.querySelectorAll('.sk').forEach(e=>e.remove());
      data.chunks.slice(-2).forEach(c=>{const p=document.createElement('p');p.className='lv';p.innerHTML=`<b>${fmt(c.s)}</b>${esc(c.text.trim())}`;box.append(p)});
      while(box.children.length>4)box.firstChild.remove();
    }
    else if(data.type==='done')finish(my);
    else if(data.type==='error')fail('Waduh, ada masalah: '+data.message);
  };
  worker.postMessage({audio,model,lang,device:navigator.gpu?'webgpu':'wasm'},[audio.buffer]);
}
function finish(my){
  if(worker){worker.terminate();worker=null} // lepaskan memori model sebelum menampilkan hasil
  segs.sort((a,b)=>a.s-b.s);segs.forEach((x,i)=>{if(x.e==null||x.e<x.s)x.e=segs[i+1]?.s??duration});
  if(!segs.length){fail('Tidak ada suara yang terdeteksi di file ini.');return}
  setPhase('done');target=100;$('iT').textContent='selesai';
  setTimeout(()=>{
    if(my!==job)return;
    const secs=(Date.now()-tStart)/1000;stopProc();
    $('proc').hidden=true;$('okb').hidden=false;$('okT').textContent=`Selesai dalam ${fmt(secs)}, ${segs.length} segmen berhasil ditulis.`;
    buildResult();
  },1000);
}

// ---------- hasil ----------
let mediaUrl=null,tickId=0,lastTick=0,curIdx=-1,activeEl=null;
function bindMedia(m){
  m.onplay=()=>{playing=true;updPD();cancelAnimationFrame(tickId);tickId=requestAnimationFrame(tick)};
  const stop=()=>{playing=false;updPD();cancelAnimationFrame(tickId);onTime()};
  m.onpause=stop;m.onended=stop;m.onseeked=()=>onTime();
  m.ontimeupdate=()=>{if(!playing)onTime()};
}
function tick(now){ // sorotan teks & gelombang mengikuti media tanpa membebani (±15–30 fps)
  if(now-lastTick>=(LITE?66:33)){lastTick=now;onTime()}
  tickId=requestAnimationFrame(tick);
}
function buildResult(){
  [$('video'),$('audio')].forEach(m=>{m.pause();m.onplay=m.onpause=m.onended=m.onseeked=m.ontimeupdate=null});
  playing=false;updPD();
  if(mediaUrl)URL.revokeObjectURL(mediaUrl);
  const isV=mode==='video';$('video').hidden=!isV;$('audio').hidden=isV;
  media=isV?$('video'):$('audio');media.preload='metadata';mediaUrl=URL.createObjectURL(file);media.src=mediaUrl;bindMedia(media);
  $('fname').textContent=file.name;$('q').value='';$('qx').hidden=true;
  $('res').hidden=false;paras=[];segEdited=false;
  setView(store.get('sabda-view','seg')==='para'?'para':'seg');
  const words=segs.reduce((n,x)=>n+x.text.split(/\s+/).filter(Boolean).length,0);
  countUp($('sD'),duration,fmt);countUp($('sW'),words);countUp($('sS'),segs.length);
  W.key='';requestAnimationFrame(()=>drawWave(true));
  setTimeout(()=>$('res').scrollIntoView({behavior:LITE?'instant':'smooth',block:'start'}),500);
}
$('again').onclick=()=>{if(media)media.pause();$('res').hidden=true;$('okb').hidden=true;clearFile();$('setup').hidden=false;$('mulai').scrollIntoView({behavior:'smooth'})};
let view='seg',paras=[],segEdited=false;
const items=()=>view==='para'?paras:segs;
function tidy(t){
  t=t.replace(/\s+/g,' ').replace(/\s+([,.;:!?])/g,'$1').trim();
  t=t.replace(/(^|[.!?…]["')”]?\s+)(\p{Ll})/gu,(m,a,b)=>a+b.toUpperCase());
  if(t&&!/[.!?…]["')”]?$/.test(t))t+='.';
  return t;
}
function buildParas(){
  const end=/[.!?…]["')”]?$/;
  paras=[];let cur=null;
  segs.forEach(x=>{
    if(!cur){cur={s:x.s,e:x.e,text:x.text};return}
    const gap=x.s-cur.e,len=cur.text.length,ended=end.test(cur.text.trim());
    if((ended&&(gap>1.2||len>350))||gap>4||len>800){paras.push(cur);cur={s:x.s,e:x.e,text:x.text}}
    else{cur.text+=' '+x.text;cur.e=x.e}
  });
  if(cur)paras.push(cur);
  paras.forEach(p=>p.text=tidy(p.text));
}
function setView(v){
  view=v;store.set('sabda-view',v);
  document.querySelectorAll('#vm button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  if(v==='para'&&(segEdited||!paras.length)){buildParas();segEdited=false}
  $('list').classList.toggle('isPara',v==='para');$('paraNote').hidden=v!=='para';
  render(true);onTime(true);
}
document.querySelectorAll('#vm button').forEach(b=>b.onclick=()=>setView(b.dataset.v));
function render(enter){
  const q=$('q').value.trim(),src=items();
  const re=q?new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'):null;
  const sh=src.map((x,i)=>({...x,i})).filter(x=>!re||x.text.toLowerCase().includes(q.toLowerCase()));
  curIdx=-1;activeEl=null;
  $('list').classList.toggle('big',src.length>150); // content-visibility hanya untuk daftar panjang
  $('list').innerHTML=sh.length?sh.map((x,k)=>{let t=esc(x.text);if(re)t=t.replace(re,'<mark>$1</mark>');
    return`<div class="seg${view==='para'?' para':''}${enter&&k<14?' enter':''}" id="s${x.i}" data-i="${x.i}" style="--d:${k*35}ms"><button title="Putar dari sini">${ic('play')}${fmt(x.s)}</button><p contenteditable="true" spellcheck="false">${t}</p></div>`}).join(''):'<div class="empty">Tidak ada teks yang cocok dengan pencarian.</div>';
  $('count').textContent=q?sh.length+' cocok':src.length+(view==='para'?' paragraf':' segmen');
}
let qT=0;
$('q').oninput=()=>{$('qx').hidden=!$('q').value;clearTimeout(qT);qT=setTimeout(()=>{render();onTime(true)},120)};
$('qx').onclick=()=>{$('q').value='';$('qx').hidden=true;render();onTime(true);$('q').focus()};
$('list').onclick=e=>{const b=e.target.closest('button');if(!b)return;media.currentTime=items()[b.parentNode.dataset.i].s;media.play()};
$('list').oninput=e=>{const s=e.target.closest('.seg');if(s){items()[s.dataset.i].text=e.target.textContent.trim();if(view==='seg')segEdited=true}};
$('tm').onchange=()=>$('list').classList.toggle('noTime',!$('tm').checked);
function findIdx(t){ // pencarian biner, bukan findIndex linear
  const a=items();let lo=0,hi=a.length-1,r=-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(a[m].s<=t){r=m;lo=m+1}else hi=m-1}
  return r>=0&&t<a[r].e?r:-1;
}
function onTime(force){
  if(!media||!segs.length)return;
  const t=media.currentTime,i=findIdx(t);
  if(i!==curIdx||force===true){ // sentuh DOM hanya saat segmen aktif berganti
    curIdx=i;
    if(activeEl){activeEl.classList.remove('act');activeEl=null}
    const el=i>=0?$('s'+i):null;
    if(el){activeEl=el;el.classList.add('act');
      if($('fl').checked&&!$('list').contains(document.activeElement)){const L=$('list'),top=el.offsetTop-L.offsetTop;if(top<L.scrollTop||top>L.scrollTop+L.clientHeight-70)L.scrollTo({top:top-80})}}
  }
  drawWave();
}
document.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!$('res').hidden&&!e.target.closest('input,select,button,summary,[contenteditable],a,textarea')){e.preventDefault();media.paused?media.play():media.pause()}
});
// Gelombang digambar sekali ke 2 kanvas cache; saat memutar hanya ditempel + dipotong (murah).
function drawWave(force){
  const c=$('wave');if(!peaks.length||!c||c.offsetParent===null)return;
  const d=Math.min(devicePixelRatio||1,LITE?2:3),w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;
  const key=w+'x'+h+'@'+d+root.dataset.theme;
  if(W.key!==key){
    c.width=Math.round(w*d);c.height=Math.round(h*d);
    const cs=getComputedStyle(root),pri=cs.getPropertyValue('--pri').trim(),mut=cs.getPropertyValue('--mut').trim();
    const bw=w/peaks.length,mk=(color,alpha)=>{
      const o=document.createElement('canvas');o.width=c.width;o.height=c.height;
      const x=o.getContext('2d');x.scale(d,d);x.fillStyle=color;x.globalAlpha=alpha;x.beginPath();
      peaks.forEach((p,i)=>{const bh=Math.max(4,p*(h-16)),X=i*bw+1,Y=(h-bh)/2,Wd=Math.max(2,bw-2);x.roundRect?x.roundRect(X,Y,Wd,bh,2):x.rect(X,Y,Wd,bh)});
      x.fill();return o;
    };
    W.base=mk(mut,.35);W.on=mk(pri,1);W.key=key;W.last=-1;
  }
  const pr=duration&&media?Math.min(1,media.currentTime/duration):0,px=Math.round(pr*c.width);
  if(!force&&px===W.last)return;W.last=px;
  const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,c.width,c.height);
  x.drawImage(W.base,0,0);
  if(px>0)x.drawImage(W.on,0,0,px,c.height,0,0,px,c.height);
}
$('wave').onclick=e=>{const r=e.target.getBoundingClientRect();media.currentTime=(e.clientX-r.left)/r.width*duration};
let rzT=0;addEventListener('resize',()=>{clearTimeout(rzT);rzT=setTimeout(()=>drawWave(true),150)});

// ---------- ekspor ----------
const plain=()=>items().map(x=>$('tm').checked?`[${fmt(x.s)}] ${x.text}`:x.text).join(view==='para'?'\n\n':'\n');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(plain());toast('Transkrip disalin ke clipboard')}catch{toast('Gagal menyalin',true)}};
document.querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>{
  const k=b.dataset.dl;let o='';
  if(k==='txt')o=items().map(x=>`[${fmt(x.s)}] ${x.text}`).join(view==='para'?'\n\n':'\n');
  if(k==='srt')o=segs.map((x,i)=>`${i+1}\n${ts(x.s,',')} --> ${ts(x.e,',')}\n${x.text}\n`).join('\n');
  if(k==='vtt')o='WEBVTT\n\n'+segs.map(x=>`${ts(x.s,'.')} --> ${ts(x.e,'.')}\n${x.text}\n`).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([o],{type:'text/plain;charset=utf-8'}));
  a.download=(file.name.replace(/\.[^.]+$/,'')||'transkrip')+'.'+k;a.click();toast('File '+k.toUpperCase()+' diunduh');
});