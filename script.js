const $=id=>document.getElementById(id);
const ic=n=>`<svg class="i"><use href="#i-${n}"/></svg>`;
const store={get(k,d){try{return localStorage.getItem(k)??d}catch{return d}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
let mode='video',file=null,segs=[],worker=null,duration=0,peaks=[],media=$('video'),job=0,running=false;

// ---------- tema, hero, reveal ----------
const root=document.documentElement;
function setTheme(t){root.dataset.theme=t;$('themeIc').setAttribute('href',t==='dark'?'#i-sun':'#i-moon');store.set('sabda-theme',t);drawWave()}
setTheme(store.get('sabda-theme',matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
$('theme').onclick=()=>setTheme(root.dataset.theme==='dark'?'light':'dark');
$('dbar').innerHTML=Array.from({length:38},()=>`<span style="--h:${(.3+Math.random()*.7).toFixed(2)};--d:-${(Math.random()*1.3).toFixed(2)}s"></span>`).join('');
{const ps=[...document.querySelectorAll('.dcard p')];let k=0;setInterval(()=>{k=(k+1)%ps.length;ps.forEach((p,i)=>p.classList.toggle('on',i===k))},2400)}
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.15});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));

// ---------- util ----------
const fmt=s=>{s=Math.max(0,s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),c=Math.floor(s%60);return(h?h+':':'')+String(m).padStart(h?2:2,'0')+':'+String(c).padStart(2,'0')};
const ts=(s,sep)=>{const p=(n,l=2)=>String(n).padStart(l,'0');return`${p(Math.floor(s/3600))}:${p(Math.floor(s%3600/60))}:${p(Math.floor(s%60))}${sep}${p(Math.round((s%1)*1000),3)}`};
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(msg,bad){const t=document.createElement('div');t.className='toast'+(bad?' bad':'');t.innerHTML=ic(bad?'x':'ok')+esc(msg);$('toasts').append(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),320)},2600)}
function countUp(el,to,f=v=>Math.round(v)){const t0=performance.now();(function s(n){const p=Math.min(1,(n-t0)/900),e=1-Math.pow(1-p,3);el.textContent=f(to*e);if(p<1)requestAnimationFrame(s)})(t0)}

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
  el.onloadedmetadata=()=>{if(isFinite(el.duration))$('cM').textContent=(f.size/1048576).toFixed(1)+' MB · '+fmt(el.duration);URL.revokeObjectURL(u)};
  $('go').disabled=false;$('goHint').textContent='Siap. Klik mulai, dan kamu bisa membatalkan kapan saja.';
}
function clearFile(){file=null;$('file').value='';$('chip').hidden=true;$('drop').hidden=false;$('go').disabled=true;$('goHint').textContent='Pilih file dulu untuk memulai. Pertama kali, model diunduh sekali lalu tersimpan.'}
$('lang').value=store.get('sabda-lang','indonesian');
{const m=store.get('sabda-model','onnx-community/whisper-base');const r=document.querySelector(`[name=mdl][value="${m}"]`);if(r)r.checked=true}

// ---------- audio extraction & chunking ----------
async function extractAudio(f){
  const buf=await f.arrayBuffer();
  const ac=new(window.AudioContext||window.webkitAudioContext)();
  let d;try{d=await ac.decodeAudioData(buf)}catch{throw new Error('Browser tidak bisa membaca suara dari file ini. Coba MP4, WebM, MP3, atau WAV.')}
  duration=d.duration;
  const off=new OfflineAudioContext(1,Math.ceil(d.duration*16000),16000);
  const s=off.createBufferSource();s.buffer=d;s.connect(off.destination);s.start();
  const r=await off.startRendering();ac.close();return r.getChannelData(0);
}
function calcPeaks(a,n=140){const st=Math.floor(a.length/n)||1,p=[];for(let i=0;i<n;i++){let m=0;for(let j=i*st;j<(i+1)*st&&j<a.length;j++){const v=Math.abs(a[j]);if(v>m)m=v}p.push(m)}const mx=Math.max(...p)||1;return p.map(v=>v/mx)}
function splitBlocks(a,sr=16000,len=60){ // potong di titik paling hening agar kata tidak terbelah
  const n=a.length,out=[];let st=0;
  while(st<n){
    let end=st+len*sr;
    if(end>=n-8*sr)end=n;
    else{let best=end,bv=Infinity;const w=1600;for(let c=end-4*sr;c<=end+4*sr;c+=w){let s=0;for(let k=c;k<c+w&&k<n;k++)s+=a[k]*a[k];if(s<bv){bv=s;best=c+w/2}}end=Math.floor(best)}
    out.push({offset:st/sr,audio:a.slice(st,end)});st=end;
  }
  return out;
}

// ---------- worker ----------
const code=`
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
self.onmessage=async({data})=>{
  const devs=data.device==='webgpu'?['webgpu','wasm']:['wasm'];
  for(const dev of devs){
    try{
      const asr=await pipeline('automatic-speech-recognition',data.model,{
        device:dev,
        dtype:dev==='webgpu'?{encoder_model:'fp32',decoder_model_merged:'q4'}:'q8',
        progress_callback:p=>self.postMessage({type:'progress',p})
      });
      self.postMessage({type:'ready',dev});
      for(let i=0;i<data.blocks.length;i++){
        const b=data.blocks[i];
        const out=await asr(b.audio,{language:data.lang==='auto'?null:data.lang,task:'transcribe',chunk_length_s:30,stride_length_s:5,return_timestamps:true});
        const ch=(out.chunks||[{text:out.text,timestamp:[0,null]}]).map(c=>({text:c.text,s:c.timestamp[0]+b.offset,e:c.timestamp[1]==null?null:c.timestamp[1]+b.offset}));
        self.postMessage({type:'part',chunks:ch,done:i+1,total:data.blocks.length});
      }
      self.postMessage({type:'done'});return;
    }catch(e){
      if(dev===devs[devs.length-1]){self.postMessage({type:'error',message:String(e&&e.message||e)});return}
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
let ph='extract',target=0,shown=0,wT=0,wS=0,wEnd=1,dl=false,tStart=0,tWrite=0,rafId=0,tipI=0,timers=[],cols={},nParts=0,nTotal=0,ends=[];
function setPhase(p){
  ph=p;const [t,s,idx]=PH[p];
  $('phase').textContent=t;if(s)$('phsub').textContent=s;
  [...$('tl').children].forEach((li,k)=>{li.className=p==='done'||k<idx?'done':k===idx?'act':''});
}
function loop(now){
  if(!running)return;
  if(ph==='extract')target=Math.min(12,target+.03);
  if(ph==='model'&&!dl)target=Math.max(target,Math.min(18,target+.02));
  if(ph==='write'&&wT<wEnd*.97)wT+=.00012;
  shown+=(target-shown)*.06;wS+=(wT-wS)*.06;
  $('pct').textContent=Math.round(shown)+'%';$('pfill').style.width=shown+'%';
  drawViz(now/1000);rafId=requestAnimationFrame(loop);
}
function readCols(){const cs=getComputedStyle(root);['pri','pri2','acc','mut','ink'].forEach(k=>cols[k]=cs.getPropertyValue('--'+k).trim())}
function drawViz(t){
  const c=$('viz'),d=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;if(!w)return;
  if(c.width!==Math.round(w*d)){c.width=Math.round(w*d);c.height=Math.round(h*d)}
  const x=c.getContext('2d');x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,w,h);
  const N=Math.max(20,Math.floor(w/9)),bw=w/N,g=x.createLinearGradient(0,0,w,0);g.addColorStop(0,cols.pri);g.addColorStop(1,cols.pri2);
  const wr=ph==='write'&&peaks.length;
  for(let i=0;i<N;i++){
    const f=i/N;let a;
    if(wr){const p=peaks[Math.floor(f*peaks.length)];a=Math.max(.07,p*.85)+Math.exp(-Math.pow((f-wS)*14,2))*.3*Math.abs(Math.sin(t*9+i));x.fillStyle=f<=wS?g:cols.mut;x.globalAlpha=f<=wS?1:.3}
    else{const amp=ph==='extract'?.55:ph==='model'?.85:.35;a=amp*(.3+.7*Math.abs(Math.sin(t*2.2+i*.33)*Math.cos(t*1.3+i*.15)));x.fillStyle=g;x.globalAlpha=.9}
    const bh=Math.max(4,Math.min(1,a)*(h-10)),X=i*bw+bw*.18,Y=(h-bh)/2,W=bw*.64;
    x.beginPath();x.roundRect?x.roundRect(X,Y,W,bh,W/2):x.rect(X,Y,W,bh);x.fill();
  }
  if(wr){x.globalAlpha=1;x.fillStyle=cols.acc;x.fillRect(wS*w-1,6,2,h-12)}
}
function showTip(){
  const el=$('tip');el.classList.add('out');
  setTimeout(()=>{$('tipT').textContent=TIPS[tipI++%TIPS.length];el.classList.remove('out')},400);
}
function startProc(){
  running=true;job++;target=shown=wT=wS=0;wEnd=1;dl=false;nParts=0;segs=[];tStart=Date.now();
  $('setup').hidden=true;$('okb').hidden=true;$('res').hidden=true;$('proc').hidden=false;
  $('iN').textContent=file.name;$('iD').textContent='-';$('iE').textContent='00:00';$('iT').textContent='menghitung…';
  $('liveBox').innerHTML='<div class="sk"></div><div class="sk"></div><div class="sk"></div>';
  readCols();setPhase('extract');tipI=Math.floor(Math.random()*TIPS.length);$('tipT').textContent=TIPS[tipI++%TIPS.length];
  rafId=requestAnimationFrame(loop);
  timers=[setInterval(()=>{$('iE').textContent=fmt((Date.now()-tStart)/1000)},500),setInterval(showTip,6000)];
  $('proc').scrollIntoView({behavior:'smooth',block:'center'});
}
function stopProc(){running=false;cancelAnimationFrame(rafId);timers.forEach(clearInterval);timers=[]}
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
    const a=await extractAudio(file);if(my!==job)return;
    peaks=calcPeaks(a);$('iD').textContent=fmt(duration);
    const blocks=splitBlocks(a);nTotal=blocks.length;ends=blocks.map((b,i)=>(b.offset+b.audio.length/16000));
    wEnd=ends[0]/duration;
    run(blocks,model,$('lang').value,my);
  }catch(e){if(my===job)fail(e.message)}
};
function run(blocks,model,lang,my){
  setPhase('model');target=Math.max(target,12);
  worker=new Worker(URL.createObjectURL(new Blob([code],{type:'text/javascript'})),{type:'module'});
  worker.onerror=()=>my===job&&fail('Gagal memuat mesin transkrip. Pastikan online dan buka lewat Chrome atau Edge.');
  const fp={};
  worker.onmessage=({data})=>{
    if(my!==job)return;
    if(data.type==='progress'){
      const p=data.p;
      if(p.status==='progress'&&p.total){
        dl=true;fp[p.file]={l:p.loaded,t:p.total};
        const L=Object.values(fp).reduce((a,b)=>a+b.l,0),T=Object.values(fp).reduce((a,b)=>a+b.t,0);
        target=Math.max(target,14+31*L/T);
        $('phsub').textContent=`Mengunduh model Whisper: ${(L/1048576).toFixed(0)} dari ${(T/1048576).toFixed(0)} MB`;
      }
    }
    else if(data.type==='ready'){setPhase('write');target=Math.max(target,45);tWrite=Date.now();$('phsub').textContent=`Mendengarkan bagian 1 dari ${nTotal}`}
    else if(data.type==='reset'){segs=[];nParts=0;wT=wS=0;$('phsub').textContent='WebGPU tidak berhasil, beralih ke mode CPU yang lebih lambat tapi stabil.'}
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
  worker.postMessage({blocks,model,lang,device:navigator.gpu?'webgpu':'wasm'},blocks.map(b=>b.audio.buffer));
}
function finish(my){
  segs.sort((a,b)=>a.s-b.s);segs.forEach((x,i)=>{if(x.e==null||x.e<x.s)x.e=segs[i+1]?.s??duration});
  if(!segs.length){fail('Tidak ada suara yang terdeteksi di file ini.');return}
  setPhase('done');target=100;$('iT').textContent='selesai';
  setTimeout(()=>{
    if(my!==job)return;
    const secs=(Date.now()-tStart)/1000;stopProc();if(worker){worker.terminate();worker=null}
    $('proc').hidden=true;$('okb').hidden=false;$('okT').textContent=`Selesai dalam ${fmt(secs)}, ${segs.length} segmen berhasil ditulis.`;
    buildResult();
  },1000);
}

// ---------- hasil ----------
function buildResult(){
  const isV=mode==='video';$('video').hidden=!isV;$('audio').hidden=isV;
  media=isV?$('video'):$('audio');media.src=URL.createObjectURL(file);media.ontimeupdate=onTime;
  $('fname').textContent=file.name;$('q').value='';$('qx').hidden=true;
  $('res').hidden=false;paras=[];segEdited=false;
  setView(store.get('sabda-view','seg')==='para'?'para':'seg');
  const words=segs.reduce((n,x)=>n+x.text.split(/\s+/).filter(Boolean).length,0);
  countUp($('sD'),duration,fmt);countUp($('sW'),words);countUp($('sS'),segs.length);
  requestAnimationFrame(drawWave);
  setTimeout(()=>$('res').scrollIntoView({behavior:'smooth',block:'start'}),500);
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
  render(true);onTime();
}
document.querySelectorAll('#vm button').forEach(b=>b.onclick=()=>setView(b.dataset.v));
function render(enter){
  const q=$('q').value.trim(),src=items();
  const re=q?new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'):null;
  const sh=src.map((x,i)=>({...x,i})).filter(x=>!re||x.text.toLowerCase().includes(q.toLowerCase()));
  $('list').innerHTML=sh.length?sh.map((x,k)=>{let t=esc(x.text);if(re)t=t.replace(re,'<mark>$1</mark>');
    return`<div class="seg${view==='para'?' para':''}${enter?' enter':''}" id="s${x.i}" data-i="${x.i}" style="--d:${Math.min(k*35,700)}ms"><button title="Putar dari sini">${ic('play')}${fmt(x.s)}</button><p contenteditable="true" spellcheck="false">${t}</p></div>`}).join(''):'<div class="empty">Tidak ada teks yang cocok dengan pencarian.</div>';
  $('count').textContent=q?sh.length+' cocok':src.length+(view==='para'?' paragraf':' segmen');
}
$('q').oninput=()=>{$('qx').hidden=!$('q').value;render()};
$('qx').onclick=()=>{$('q').value='';$('qx').hidden=true;render();$('q').focus()};
$('list').onclick=e=>{const b=e.target.closest('button');if(!b)return;media.currentTime=items()[b.parentNode.dataset.i].s;media.play()};
$('list').oninput=e=>{const s=e.target.closest('.seg');if(s){items()[s.dataset.i].text=e.target.textContent.trim();if(view==='seg')segEdited=true}};
$('tm').onchange=()=>$('list').classList.toggle('noTime',!$('tm').checked);
function onTime(){
  const t=media.currentTime,i=items().findIndex(x=>t>=x.s&&t<x.e);
  document.querySelectorAll('.seg.act').forEach(el=>el.classList.remove('act'));
  const el=i>=0&&$('s'+i);
  if(el){el.classList.add('act');
    if($('fl').checked&&!$('list').contains(document.activeElement)){const L=$('list'),top=el.offsetTop-L.offsetTop;if(top<L.scrollTop||top>L.scrollTop+L.clientHeight-70)L.scrollTo({top:top-80})}}
  drawWave();
}
document.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!$('res').hidden&&!e.target.closest('input,select,button,summary,[contenteditable],a,textarea')){e.preventDefault();media.paused?media.play():media.pause()}
});
function drawWave(){
  const c=$('wave');if(!peaks.length||!c||c.offsetParent===null)return;
  const d=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*d;c.height=h*d;
  const x=c.getContext('2d');x.scale(d,d);
  const cs=getComputedStyle(root),pri=cs.getPropertyValue('--pri').trim(),mut=cs.getPropertyValue('--mut').trim();
  const bw=w/peaks.length,pr=duration?media.currentTime/duration:0;
  peaks.forEach((p,i)=>{const bh=Math.max(4,p*(h-16)),on=i/peaks.length<pr;x.fillStyle=on?pri:mut;x.globalAlpha=on?1:.35;x.beginPath();const X=i*bw+1,Y=(h-bh)/2,W=Math.max(2,bw-2);x.roundRect?x.roundRect(X,Y,W,bh,2):x.rect(X,Y,W,bh);x.fill()});
}
$('wave').onclick=e=>{const r=e.target.getBoundingClientRect();media.currentTime=(e.clientX-r.left)/r.width*duration};
addEventListener('resize',drawWave);

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