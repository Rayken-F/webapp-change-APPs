(function() {
  'use strict';
  const A = window.RegistrationAlignment, M = window.RegistrationModel, $ = id => document.getElementById(id);
  const preset = [[.213,.126],[.681,.125],[.703,.627],[.207,.637]];
  const fresh = () => ({ version:M.VERSION, photo:null, rt:'', rows:[], quad:structuredClone(preset), split:.41, rowCount:16, geometry:'perspective', rowLines:A.boundaries(16), alignmentConfirmed:false });
  let state = fresh(), pixels = null, busy = false, stopping = false, setting = false, corners = [], saveTimer, saving = false;
  let saveQueue = Promise.resolve(), saveRevision = 0, activeElement, returnY = 0, zoom = 1, db;
  const status = message => { $('status').textContent = message; };
  const node = (tag, text, className) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; };
  const button = (text, action) => { const n = node('button', text); n.type = 'button'; n.addEventListener('click', action); return n; };
  const hasWork = () => state.photo || state.rows.length;
  const cropCache = new Map();
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ds-cylinder-registration-demo-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('draft');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  function save() {
    clearTimeout(saveTimer); const revision = ++saveRevision; saving = true; $('save-state').textContent = '正在保存草稿…';
    saveTimer = setTimeout(() => {
      const snapshot = structuredClone(state);
      saveQueue = saveQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
        if (!db) return reject(Error('STORAGE'));
        const tx = db.transaction('draft', 'readwrite'); tx.objectStore('draft').put(snapshot, 'active');
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      })).then(() => { if (revision !== saveRevision) return; saving = false; $('save-state').textContent = '草稿已保存於此瀏覽器。'; }, () => {
        saving = true; $('save-state').textContent = '本機儲存失敗，請立即「匯出本機草稿」備份。';
      });
    }, 250);
  }
  function svgElement(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, v); return el;
  }
  function interpolate(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]; }
  function point(u,v) { if(state.geometry==='perspective')return A.project(A.transform(state.quad),u,v);return interpolate(interpolate(state.quad[0],state.quad[3],v),interpolate(state.quad[1],state.quad[2],v),u); }
  function overlay() {
    const target = $('overlay'); target.replaceChildren();
    if (setting) {
      corners.forEach((p,i) => { target.append(svgElement('circle',{cx:p[0]*1000,cy:p[1]*1000,r:9})); const t=svgElement('text',{x:p[0]*1000+12,y:p[1]*1000,fill:'#ffffff','font-size':24}); t.textContent=i+1; target.append(t); }); return;
    }
    if(!state.alignmentConfirmed&&!setting)return;
    target.append(svgElement('polygon',{points:state.quad.map(p=>p.map(n=>n*1000).join(',')).join(' ')}));
    for (let i=1;i<state.rowCount;i++) {
      const a=point(0,state.rowLines[i]), b=point(1,state.rowLines[i]);
      target.append(svgElement('line',{x1:a[0]*1000,y1:a[1]*1000,x2:b[0]*1000,y2:b[1]*1000}));
    }
    const a=point(state.split,0),b=point(state.split,1);
    target.append(svgElement('line',{x1:a[0]*1000,y1:a[1]*1000,x2:b[0]*1000,y2:b[1]*1000}));
  }
  async function decode(photo) {
    if (!photo) { pixels=null; $('photo').removeAttribute('src'); return; }
    $('photo').src=photo; await $('photo').decode();
    const image=$('photo'), scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
    if (image.naturalWidth*image.naturalHeight>40000000) throw Error('照片像素過大，請使用一般拍照尺寸');
    const c=document.createElement('canvas');c.width=Math.round(image.naturalWidth*scale);c.height=Math.round(image.naturalHeight*scale);
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height); pixels=ctx.getImageData(0,0,c.width,c.height);
    cropCache.clear();
  }
  function crop(index, part='both') {
    if (!pixels || index==null) return null;
    const key=index+':'+part;if(cropCache.has(key))return cropCache.get(key);
    const c=document.createElement('canvas');
    // Exclude printed row numbers at the left of the steel column, not handwritten characters.
    const left=part==='steel'?state.split+.045:part==='ctn'?.012:0, right=part==='ctn'?state.split-.012:1;
    // Handwritten descenders can cross a printed rule. Retain a lower margin for review.
    const top=state.rowLines[index],bottom=state.rowLines[index+1],rowHeight=bottom-top;
    const v0=top+.04*rowHeight,v1=bottom+(part==='both'?.08:.20)*rowHeight;
    const a=point(left,v0),b=point(right,v1),mapping=state.geometry==='perspective'?A.transform(state.quad):null;
    c.width=part==='both'?1000:Math.max(2,Math.round((mapping?Math.hypot((point(right,v0)[0]-a[0])*pixels.width,(point(right,v0)[1]-a[1])*pixels.height):Math.abs(b[0]-a[0])*pixels.width)));
    c.height=part==='both'?150:Math.max(2,Math.round((mapping?Math.hypot((point(left,v1)[0]-a[0])*pixels.width,(point(left,v1)[1]-a[1])*pixels.height):Math.abs(b[1]-a[1])*pixels.height)));
    if(mapping&&part==='both'){
      const rect=A.raster(pixels,[point(left,v0),point(right,v0),point(right,v1),point(left,v1)],c.width,c.height);
      c.getContext('2d').putImageData(new ImageData(rect.data,c.width,c.height),0,0);cropCache.set(key,c);return c;
    }
    const ctx=c.getContext('2d'), out=ctx.createImageData(c.width,c.height);
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
      const u=left+(right-left)*x/(c.width-1),v=v0+(v1-v0)*y/(c.height-1),p=mapping?A.project(mapping,u,v):point(u,v);
      const sx=Math.max(0,Math.min(pixels.width-1,Math.round(p[0]*(pixels.width-1)))),sy=Math.max(0,Math.min(pixels.height-1,Math.round(p[1]*(pixels.height-1))));
      const src=(sy*pixels.width+sx)*4,dst=(y*c.width+x)*4;out.data[dst]=pixels.data[src];out.data[dst+1]=pixels.data[src+1];out.data[dst+2]=pixels.data[src+2];out.data[dst+3]=255;
    }
    ctx.putImageData(out,0,0);cropCache.set(key,c);return c;
  }
  function openDialog(dialog) { activeElement=document.activeElement;returnY=window.scrollY;dialog.showModal();document.body.classList.add('modal-open'); }
  function closeDialog(dialog) { dialog.close(); }
  for(const id of ['viewer','checklist-dialog'])$(id).addEventListener('close',()=>{document.body.classList.remove('modal-open');activeElement?.focus({preventScroll:true});window.scrollTo(0,returnY);});
  function viewRow(r) {
    const c=crop(r.sourceIndex); if(!c)return;
    $('viewer-title').textContent='紙本第 '+(r.sourceIndex+1)+' 列 · CTN／鋼號';$('crop-large').src=c.toDataURL();zoom=1;setZoom();openDialog($('viewer'));
  }
  function setZoom() { $('crop-large').style.width=(100*zoom)+'%';$('zoom-label').textContent=Math.round(zoom*100)+'%'; }
  function updateChecks() {
    const errors=M.issues(state.rows);
    state.rows.forEach((r,i)=>{
      const card=$('row-'+r.id);if(!card)return;
      card.classList.toggle('confirmed',r.confirmed&&!errors[i].length);card.classList.toggle('low-confidence',errors[i].length>0||(!r.confirmed&&M.confidence(r).length>0));card.querySelector('.problems').textContent=errors[i].join(' · ')|| (r.confirmed?'已核對完整編號與配對':'請對照原圖確認完整編號與同列配對');
      const check=card.querySelector('input[type=checkbox]');check.checked=r.confirmed&&!errors[i].length;check.disabled=errors[i].length>0||busy;
    });
    const count=state.rows.filter((r,i)=>r.confirmed&&!errors[i].length).length;$('counts').textContent=count+' / '+state.rows.length+' 已核對';
    const ready=M.ready(state.rows),outputReady=M.outputReady(state.rows,state.rt),registered=state.rows.filter(r=>M.registered(r,state.rt)).length;
    $('print').disabled=$('csv').disabled=!outputReady||busy;
    $('start-registration').disabled=!ready||!M.rtValid(state.rt)||busy;
    $('registration-state').textContent=`${registered}／${state.rows.length} 支已完成本機註冊確認。`+(!M.rtValid(state.rt)?'請先填寫有效的 RT（英數字或連字號，最多 30 碼）。':!ready?'請先逐列核對。':'可開始／繼續逐支註冊。');
    $('rt-help').textContent=state.rt&&!M.rtValid(state.rt)?'RT 請使用英數字或連字號，最多 30 碼。':'同批共用；修改 RT 後需重新完成逐支確認。';
    $('export-state').textContent=outputReady?'本批已完成本機確認，可輸出暫定 checklist。':`尚有 ${state.rows.length-count} 列待核對、${state.rows.length-registered} 支待完成註冊確認。`;
    $('build').disabled=busy||!state.alignmentConfirmed;
    $('recognize').disabled=!state.alignmentConfirmed||!pixels||!state.rows.some(r=>r.sourceIndex!=null&&!r.edited&&!r.confirmed)||busy||setting;
  }
  function renderRows() {
    const root=$('rows');root.replaceChildren();
    if(!state.rows.length)root.append(node('div','加入紙本後建立校對列，或直接手動補列。','empty'));
    state.rows.forEach((r,i)=>{
      const card=node('article',null,'row-card');card.id='row-'+r.id;
      const head=node('div',null,'row-head');head.append(node('b',String(i+1).padStart(2,'0')),node('span',r.sourceIndex==null?'手動新增':'紙本第 '+(r.sourceIndex+1)+' 列'));
      const remove=button('移除',()=>{if(busy)return;if(confirm('移除此校對列？原照片仍保留。')){state.rows=state.rows.filter(x=>x.id!==r.id);renderRows();save();}});remove.className='quiet remove-row';remove.disabled=busy;head.append(remove);card.append(head);
      const c=crop(r.sourceIndex);if(c){const pic=button('',()=>viewRow(r));pic.className='row-photo';pic.setAttribute('aria-label','放大紙本第 '+(r.sourceIndex+1)+' 列');pic.append(c);card.append(pic);}
      const fields=node('div',null,'fields');
      for(const [name,label]of[['ctn','完整 CTN'],['steel','完整鋼瓶鋼號']]){
        const l=node('label',label),input=document.createElement('input');input.type='text';input.value=r[name];input.autocomplete='off';input.spellcheck=false;input.maxLength=60;input.dataset.field=name;
        input.addEventListener('input',()=>{r[name]=input.value;r.edited=true;r.confirmed=false;r.registered=null;updateChecks();save();});l.append(input);fields.append(l);
      }
      card.append(fields,node('p','', 'problems'));
      const reasons=M.confidence(r);if(reasons.length)card.append(node('div','優先核對：'+reasons.join('；'),'confidence-note'));
      const l=node('label',null,'check-label'),check=document.createElement('input');check.type='checkbox';check.addEventListener('change',()=>{r.ctn=M.normalize(r.ctn);r.steel=M.normalize(r.steel);r.confirmed=check.checked;updateChecks();save();});l.append(check,document.createTextNode('已對照原圖，完整編號與同列配對正確'));card.append(l);
      if(r.rawCtn||r.rawSteel)card.append(node('div','本機候選：'+(r.rawCtn||'未讀到')+' ／ '+(r.rawSteel||'未讀到'),'raw'));
      for(const [field,label] of [['ctn','CTN'],['steel','鋼號']])if(r[field+'Alternatives']?.length>1)card.append(node('div',label+' 候選不同：'+r[field+'Alternatives'].join(' ／ ')+'；請對照原圖。','raw'));
      for(const [field,label] of [['ctn','CTN'],['steel','鋼號']])if(r[field+'SlashedZeros'])card.append(node('div',label+' 辨識時依斜線 0 字形產生候選（'+r[field+'SlashedZeros']+' 個），仍須對照原圖核對。','raw'));
      for(const [field,label] of [['ctn','CTN'],['steel','鋼號']])if(r[field+'ZeroReview'])card.append(node('div',label+' 原辨識候選含未確認斜線的 0，請特別核對 O／0。','hint'));
      for(const [field,label] of [['ctn','CTN'],['steel','鋼號']])if(r[field+'GlyphReview'])card.append(node('div',label+' 已依兩次本機字形複核更新候選，原候選仍保留；請對照原圖確認。','hint'));
      if(r.prefixApplied)card.append(node('div','已套用人員確認的共用前綴','raw'));
      root.append(card);
    });updateChecks();
  }
  function render() {
    $('batch-rt').value=state.rt;$('photo-wrap').hidden=!state.photo;$('empty-photo').hidden=!!state.photo;$('row-count').value=state.rowCount;$('split').value=state.split*100;$('split-label').textContent=Math.round(state.split*100)+'%';overlay();renderRows();
  }
  function configurationChanged() {
    cropCache.clear();state.rows.forEach(r=>{r.confirmed=false;r.registered=null;});overlay();renderRows();save();
  }
  async function readFile(file) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('無法讀取檔案'));reader.readAsDataURL(file);}); }
  $('file').addEventListener('change',async()=>{
    const file=$('file').files[0];$('file').value='';if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>20*1024*1024){status('請使用 20 MB 以下的 JPEG／PNG／WebP 照片。');return;}
    if(hasWork()&&!confirm('改用新照片會取代目前草稿。需要時請先匯出草稿。確定繼續？'))return;
    const old=state;
    try{const data=await readFile(file);await decode(data);state=fresh();state.photo=data;setting=false;corners=[];$('photo').parentElement.classList.remove('setting');render();save();await autoAlign();}
    catch(e){state=old;await decode(old.photo);render();status('照片讀取失敗，原草稿保留。'+e.message);}
  });
  function showAlignment(candidate,message,automatic=false){
    RegistrationAligner.open(pixels,{quad:candidate.quad,split:candidate.split,rowLines:candidate.rowLines,rowCount:state.rowCount,unmatched:candidate.unmatched||[]},next=>{
      setting=false;corners=[];$('photo').parentElement.classList.remove('setting');$('region-help').textContent='框選 CTN 與鋼號兩欄的資料區，不含標題及底部備註。';
      state.quad=next.quad;state.split=next.split;state.rowLines=next.rowLines;state.geometry='perspective';state.alignmentConfirmed=true;
      configurationChanged();render();status('已確認對齊。可建立校對列；原有文字保留，裁圖變更後請重新核對。');
    },message,automatic);
  }
  async function autoAlign(){
    if(busy||!pixels)return;busy=true;controlsBusy(true);$('stop').hidden=true;$('progress').hidden=true;status('正在本機尋找表格與格線…');
    let result;try{result=await RegistrationAligner.detect(pixels,state.rowCount);}catch(_){result={ok:false,reason:'自動對齊未完成，請手動設定四角'};}
    finally{busy=false;controlsBusy(false);}
    if(result.ok){status('已找到表格，請確認校正預覽。');showAlignment(result,'已找到資料格線。請核對第一列、最後一列及 CTN／鋼號分界，必要時切至原圖四角微調。',true);}
    else{status(result.reason);showAlignment(state,result.reason+'。請框住 CTN＋鋼號的資料區，再查看拉正格線。');}
  }
  $('auto-align').onclick=autoAlign;
  $('adjust-align').onclick=()=>{if(!busy&&pixels)showAlignment(state,'調整只在按「確認對齊」後套用；原照片與輸入文字保留。');};
  $('new').onclick=async()=>{if(hasWork()&&!confirm('建立新紙本會取代此瀏覽器的草稿，確定繼續？'))return;state=fresh();setting=false;corners=[];await decode(null);render();save();status('已建立空白草稿。');};
  $('set-region').onclick=()=>{setting=!setting;corners=[];$('photo').parentElement.classList.toggle('setting',setting);$('region-help').textContent=setting?'依序點選資料區：①左上 ②右上 ③右下 ④左下。再次按按鈕可取消。':'框選 CTN 與鋼號兩欄的資料區，不含標題及底部備註。';overlay();updateChecks();};
  $('overlay').addEventListener('click',e=>{
    if(!setting||busy)return;const r=$('overlay').getBoundingClientRect();corners.push([(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]);overlay();
    if(corners.length!==4)return;
    if(!M.quadValid(corners)){corners=[];overlay();status('四角位置不正確。請依左上、右上、右下、左下重新點選。');return;}
    const snapped=A.snap(pixels,corners,state.rowCount,state.split,A.boundaries(state.rowCount));const candidate={quad:corners,split:snapped.split,rowLines:snapped.rowLines,unmatched:Array.from({length:state.rowCount-1},(_,i)=>i+1).filter(i=>!snapped.matched.includes(i))};corners=[];setting=false;$('photo').parentElement.classList.remove('setting');overlay();showAlignment(candidate,`四角已拉正，自動貼齊 ${snapped.matched.length}／${state.rowCount-1} 條分界。請確認預覽，黃色圓點代表未找到的線。`,true);
  });
  $('sample-region').onclick=()=>{state.quad=structuredClone(preset);state.geometry='bilinear';state.rowLines=A.boundaries(state.rowCount);state.alignmentConfirmed=true;setting=false;corners=[];$('photo').parentElement.classList.remove('setting');configurationChanged();status('已套用這次 DEMO 紙本的兩欄範圍，請核對實際照片是否對齊。');};
  $('split').oninput=()=>{state.split=Number($('split').value)/100;$('split-label').textContent=Math.round(state.split*100)+'%';cropCache.clear();overlay();};
  $('split').onchange=configurationChanged;
  $('row-count').onchange=()=>{
    const n=Number($('row-count').value);if(!Number.isInteger(n)||n<1||n>60){$('row-count').value=state.rowCount;status('列數須為 1～60。');return;}
    if(state.rows.length){$('row-count').value=state.rowCount;status('已有校對列時請先保留草稿，再使用新紙本設定列數；漏列可用「補一列」。');return;}
    state.rowCount=n;state.rowLines=A.boundaries(n);state.alignmentConfirmed=false;configurationChanged();status('列數已更新，請重新確認校正預覽。');
  };
  $('build').onclick=()=>{
    if(setting||!state.alignmentConfirmed){status('請先完成並確認對齊。');return;}
    if(state.rows.length&&!confirm('重新建立將清空目前校對欄位，確定繼續？'))return;
    state.rows=Array.from({length:state.rowCount},(_,i)=>M.row(i));renderRows();save();status(`已建立 ${state.rowCount} 列。可直接填寫，或使用本機試辨識取得候選。`);
  };
  $('add').onclick=()=>{if(state.rows.length>=60){status('本 DEMO 每張最多 60 列。');return;}state.rows.push(M.row());renderRows();save();$('rows').lastElementChild.querySelector('input').focus();};
  $('apply-prefix').onclick=()=>{try{const n=M.applyPrefixes(state.rows,$('ctn-prefix').value,$('steel-prefix').value);renderRows();save();status(`已補全 ${n} 列。請逐列確認前綴與配對是否正確。`);}catch(e){status(e.message);}};
  function controlsBusy(value) {
    for(const id of ['new','file','build','add','apply-prefix','set-region','auto-align','adjust-align','sample-region','split','row-count','restore'])$(id).disabled=value;
    document.querySelectorAll('.remove-row').forEach(b=>b.disabled=value);
    $('stop').hidden=!value;$('progress').hidden=!value;updateChecks();
  }
  $('recognize').onclick=async()=>{
    if(busy||!pixels)return;busy=true;stopping=false;controlsBusy(true);
    const work=state.rows.filter(r=>r.sourceIndex!=null&&!r.edited&&!r.confirmed);let completed=0;
    try{
      for(const r of work){
        if(stopping)break;status(`本機試辨識第 ${r.sourceIndex+1} 列／共 ${state.rowCount} 列。手寫候選須核對；可隨時停止。`);
        const ctn=await RegistrationOcr.recognize(crop(r.sourceIndex,'ctn'),'ctn');if(stopping)break;
        const steel=await RegistrationOcr.recognize(crop(r.sourceIndex,'steel'),'steel');if(stopping)break;
        const applied=M.applyCandidate(r,ctn,steel);completed++;$('progress').value=completed/work.length;
        // Do not rebuild editable rows during a running recognition; preserve focus and edits.
        if(applied){const card=$('row-'+r.id);for(const name of ['ctn','steel'])card.querySelector(`[data-field=${name}]`).value=r[name];}
        updateChecks();save();
      }
      status(stopping?`已停止，保留 ${completed} 列候選與人工修改。`:`本機手寫辨識完成 ${completed} 列。請核對完整編號與候選差異；前綴不會自動猜補。`);
    }catch(e){status(e.code==='CANCELLED'?'已停止，已完成的候選與人工修改保留。':'本機試辨識未完成（'+(e.code||'OCR_ERROR')+'）。原照片與已完成列保留，可重試或手動填寫。');}
    finally{busy=false;controlsBusy(false);$('engine-status').textContent='';RegistrationOcr.release();renderRows();save();}
  };
  $('stop').onclick=()=>{stopping=true;RegistrationOcr.stop();};
  window.addEventListener('registration-ocr-progress',e=>{if(!busy)return;const v=e.detail;if(v.stage==='download')$('engine-status').textContent='準備手寫模型 '+Math.round(v.loaded/v.total*100)+'%';else if(v.stage==='initialize')$('engine-status').textContent='準備本機手寫模型；首次需下載，可按停止。';else if(v.stage==='prepare')$('engine-status').textContent='模型已就緒，正在本機準備辨識…';});
  $('close-viewer').onclick=()=>closeDialog($('viewer'));$('zoom-in').onclick=()=>{zoom=Math.min(5,zoom+.5);setZoom();};$('zoom-out').onclick=()=>{zoom=Math.max(1,zoom-.5);setZoom();};
  function download(name,type,content){const url=URL.createObjectURL(new Blob([content],{type})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('csv').onclick=()=>{try{download('鋼瓶註冊-checklist.csv','text/csv;charset=utf-8',M.csv(state.rows,state.rt));}catch(e){status(e.message);}};
  $('backup').onclick=()=>download('鋼瓶註冊-DEMO-草稿.json','application/json',JSON.stringify(state));
  function validateDraft(value) {
    if(![M.VERSION,M.FLOW_VERSION,M.ALIGNMENT_VERSION,M.GLYPH_VERSION,M.LEGACY_VERSION,M.PREVIOUS_VERSION,M.ZERO_VERSION].includes(value?.version)||!Array.isArray(value.rows)||value.rows.length>60||!M.quadValid(value.quad)||!Number.isInteger(value.rowCount)||value.rowCount<1||value.rowCount>60||!(value.split>=.2&&value.split<=.75))throw Error('草稿格式不相符');
    if(value.photo!==null&&(typeof value.photo!=='string'||value.photo.length>30*1024*1024||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value.photo)))throw Error('照片資料不正確');
    const modern=[M.VERSION,M.FLOW_VERSION,M.ALIGNMENT_VERSION].includes(value.version);
    if(modern&&(!A.validLines(value.rowLines,value.rowCount)||!['perspective','bilinear'].includes(value.geometry)||typeof value.alignmentConfirmed!=='boolean'))throw Error('校正資料不正確');
    const result=fresh();Object.assign(result,{photo:value.photo,rt:typeof value.rt==='string'?value.rt.slice(0,30):'',quad:value.quad,rowCount:value.rowCount,split:value.split,geometry:modern?value.geometry:'bilinear',rowLines:modern?value.rowLines:A.boundaries(value.rowCount),alignmentConfirmed:modern?value.alignmentConfirmed:true});
    result.rows=value.rows.map(r=>{if(r.sourceIndex!==null&&(!Number.isInteger(r.sourceIndex)||r.sourceIndex<0||r.sourceIndex>=value.rowCount))throw Error('紙本列不正確');const out=M.row(r.sourceIndex);for(const k of ['ctn','steel','rawCtn','rawSteel'])out[k]=String(r[k]||'').slice(0,200);for(const k of ['ctnAlternatives','steelAlternatives'])out[k]=Array.isArray(r[k])?r[k].slice(0,4).map(v=>String(v).slice(0,60)):[];for(const k of ['ctnSlashedZeros','steelSlashedZeros'])out[k]=Number.isInteger(r[k])?Math.max(0,Math.min(16,r[k])):0;for(const k of ['confirmed','edited','prefixApplied','ctnZeroReview','steelZeroReview','ctnGlyphReview','steelGlyphReview','ctnLowConfidence','steelLowConfidence'])out[k]=r[k]===true;for(const k of ['ctnScore','steelScore'])out[k]=Number.isFinite(r[k])?Math.max(0,Math.min(1,r[k])):null;if([M.VERSION,M.FLOW_VERSION].includes(value.version)&&r.registered){const v=r.registered;out.registered={rt:String(v.rt||''),ctn:String(v.ctn||''),steel:String(v.steel||''),at:String(v.at||'')};if(!M.registered(out,result.rt))out.registered=null;}return out;});return result;
  }
  $('restore').onchange=async()=>{const file=$('restore').files[0];$('restore').value='';if(!file)return;if(file.size>32*1024*1024){status('草稿檔案過大。');return;}if(hasWork()&&!confirm('匯入將取代目前草稿，確定繼續？'))return;const old=state;try{const next=validateDraft(JSON.parse(await file.text()));await decode(next.photo);state=next;render();save();status('草稿已匯入，請核對照片與清單。');}catch(e){state=old;await decode(old.photo);render();status('匯入失敗，原草稿保留：'+e.message);}};
  $('print').onclick=()=>{
    if(!M.outputReady(state.rows,state.rt)){status('請先完成逐支註冊確認。');return;}
    const sheet=$('print-sheet');sheet.replaceChildren();sheet.append(node('h2','鋼瓶註冊 checklist'),node('p','DEMO · '+new Date().toLocaleDateString('zh-TW')+' · '+state.rows.length+' 支 · RT '+M.normalize(state.rt)+' · 本機人工確認完成，正式系統尚未寫入'));
    const table=node('table'),thead=node('thead'),head=node('tr');['序號','RT','CTN','鋼瓶鋼號','紙本列','本機確認時間'].forEach(v=>head.append(node('th',v)));thead.append(head);table.append(thead);const body=node('tbody');
    state.rows.forEach((r,i)=>{const tr=node('tr');[i+1,M.normalize(state.rt),M.normalize(r.ctn),M.normalize(r.steel),r.sourceIndex==null?'手動補列':r.sourceIndex+1,new Date(r.registered.at).toLocaleString('zh-TW')].forEach(v=>tr.append(node('td',v)));body.append(tr);});table.append(body);sheet.append(table,node('p','填寫人員：________________　覆核人員：________________'),node('small','本清單不代表已登錄正式資料庫。'));
    const printCopy=sheet.cloneNode(true);printCopy.removeAttribute('id');$('print-output').replaceChildren(printCopy);openDialog($('checklist-dialog'));
  };
  $('close-checklist').onclick=()=>closeDialog($('checklist-dialog'));$('do-print').onclick=()=>window.print();
  window.addEventListener('beforeunload',e=>{if(busy||saving){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pagehide',()=>RegistrationOcr.stop());
  async function init(){try{db=await openDb();const cached=await new Promise((resolve,reject)=>{const r=db.transaction('draft').objectStore('draft').get('active');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(cached){state=validateDraft(cached);await decode(state.photo);status('已恢復此瀏覽器上次的紙本與校對草稿。');}render();}catch(_){status('無法讀取本機草稿。請保留原照片，使用匯出草稿保存本輪結果。');render();}}
  const registration=RegistrationFlow(()=>state,()=>{renderRows();save();});
  $('start-registration').onclick=()=>registration.open();
  $('batch-rt').oninput=()=>{const value=$('batch-rt').value;if(M.normalize(value)!==M.normalize(state.rt))state.rows.forEach(r=>{r.registered=null;});state.rt=value;updateChecks();save();};
  init();
})();
