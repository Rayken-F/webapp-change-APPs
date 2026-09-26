/* RC31.14: explicit test-only submission; no background replay or legacy endpoint. */
(function(){
  'use strict';
  const model=window.IqcSubmitModel31,store=window.IqcSubmitStore31;
  const endpoint='https://script.google.com/macros/s/AKfycbyVr5PqTETUV6YmMbQ2zO38Xk_fHiSYkST8xn2di09xvEfay_HDdTwJWBWx0v47k0R6/exec';
  const active=()=>localStorage.getItem('ds_iqc_image_rc_active_batch')||'',ctl=()=>window.__DS_IQC_RC31,$=id=>document.getElementById(id);
  const configured=()=>/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=(el,value)=>{if(el&&el.textContent!==value)el.textContent=value;};
  const disabled=(el,value)=>{if(el.disabled!==!!value)el.disabled=!!value;};
  let current=null,busy=false,epoch=0,preview=null,message='僅寫入獨立測試表，正式 IQC 保持不變。',messageBatch='',reading=null,historyKey='',historyPhotos=false,phase='',started=0,ticker=null;
  function context(){const c=window.DS_PORTAL_BRIDGE?.getSessionContext?.(),account=c?.profile?.user?.account;
    if(!c?.token||!account)throw Error('請先登入 DS 工作台。');
    if(c.profile.permissions?.daily_report_enabled!==true)throw Error('此帳號未開啟日報／IQC 建檔權限。');return {token:c.token,account};}
  const record=()=>current?.submissions.find(r=>r.status!=='REJECTED');
  const frozen=()=>current?.batch&&current.batch.id===active()&&current.batch.status!=='DRAFT';
  const ownRecord=()=>{const r=record();return r?.protocol===model.protocol&&r.environment===model.environment&&r.endpoint===endpoint?r:null;};
  function reveal(el){if(!el)return;el.tabIndex=-1;el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',behavior:'instant'});}
  function note(value,attention=false){message=value;messageBatch=active();text($('iqc31SubmitMessage'),value);ctl().submissionStatus(value);if(attention)reveal($('iqc31SubmitMessage'));}
  function stage(value){phase=value;started=Date.now();tick();}
  function tick(){if(!phase)return;const count=ownRecord()?.payload?.items.length||preview?.data?.items.length;
    note(`${phase}${count?'｜'+count+' 筆':''}｜${Math.floor((Date.now()-started)/1000)} 秒${Date.now()-started>=15000?'；仍在等候回覆，請勿重複送出':''}`);}
  async function refresh(){
    const id=active();if(reading?.id===id)return reading.promise;
    const n=++epoch;const promise=(async()=>{const next=id?await store.snapshot(id):null;
      if(n!==epoch||id!==active())return;if(current?.batch?.id!==id){messageBatch='';message='僅寫入獨立測試表，正式 IQC 保持不變。';}if(preview&&preview.batchId!==id)closePreview();current=next;paint();
    })().finally(()=>{if(reading?.promise===promise)reading=null;});reading={id,promise};return promise;
  }
  function table(items){return `<div class="iqc31-table-wrap"><table class="iqc31-table"><colgroup><col style="width:10%"><col style="width:31%"><col style="width:30%"><col style="width:29%"></colgroup><thead><tr><th scope="col">序</th><th scope="col">CTN</th><th scope="col">RT</th><th scope="col">狀態</th></tr></thead><tbody>${items.map((x,i)=>`<tr><td>${i+1}</td><td><strong>${esc(x.ctn)}</strong></td><td>${esc(x.rtNo)}</td><td>${esc(x.cylinderStatus)}</td></tr>`).join('')}</tbody></table></div>`;}
  function installStyle(){if($('iqc31SubmitStyle'))return;const s=document.createElement('style');s.id='iqc31SubmitStyle';s.textContent=`
    #iqcImageRc .iqc31-table-wrap{max-height:48dvh;overflow:auto;overscroll-behavior:contain;border:1px solid #526493;border-radius:10px}
    #iqcImageRc .iqc31-table{width:100%;min-width:280px;table-layout:fixed;border-collapse:collapse;font-size:13px;line-height:1.4;font-variant-numeric:tabular-nums}
    #iqcImageRc .iqc31-table th,#iqcImageRc .iqc31-table td{text-align:left;padding:9px 5px;border-bottom:1px solid #405078;vertical-align:top}
    #iqcImageRc .iqc31-table th{position:sticky;top:0;background:#182451;z-index:1}
    #iqcImageRc .iqc31-table td:nth-child(2),#iqcImageRc .iqc31-table td:nth-child(3){white-space:nowrap}
    #iqcImageRc .iqc31-table td:last-child{overflow-wrap:anywhere}
    #iqcImageRc #iqc31SubmitConfirm{appearance:auto;-webkit-appearance:checkbox;width:22px;height:22px;min-height:0;margin:2px 0;padding:0;accent-color:#7460ff}
    #iqcImageRc[data-history="true"] .iqc31-work-only{display:none!important}
    #iqcImageRc[data-history="true"] #iqc31BatchRemove,#iqcImageRc[data-history="true"] #iqc31BatchControls>details,#iqcImageRc[data-history="true"] #iqc31BatchControls>p.iqc-rc-note:not(#iqc31BatchMessage){display:none!important}
    #iqc31HistoryReceipt{overflow-wrap:anywhere}#iqc31HistoryReceipt button{margin:8px 6px 0 0}
    #iqc31SubmitMessage{padding:10px;border:1px solid #6479a4;border-radius:10px}
    #iqc31BatchControls button[aria-pressed="true"]{background:#5445d9}
  `;document.head.append(s);}
  function history(r){
    const valid=r?.status==='SYNCED'&&model.receipt({ok:true,protocol:model.protocol,environment:model.environment,receipt:r.receipt},r),root=$('iqcImageRc');
    if(!root)return;const viewingHistory=!!valid||!!window.__DS_IQC_BATCHES31?.isHistory();if(root.dataset.history!==String(viewingHistory))root.dataset.history=String(viewingHistory);
    for(const id of ['iqcRcPhotoList','iqcRcResultList','iqcHybridSyncBtn'])$(id)?.closest('section.iqc-rc-card')?.classList.toggle('iqc31-work-only',id!=='iqcRcPhotoList'||!historyPhotos);
    $('iqcRcRegion')?.closest('.iqc-rc-grid')?.classList.add('iqc31-work-only');
    for(const id of ['iqcRcCommit','iqc31BatchPreflight','iqc31PreflightResult','iqcRcCommitHint'])$(id)?.classList.add('iqc31-work-only');
    if(!valid){$('iqc31HistoryReceipt')?.remove();historyKey='';historyPhotos=false;return;}
    const key=JSON.stringify([r.submissionId,current.batch.photosClearedAt]);if(key===historyKey)return;historyKey=key;historyPhotos=false;
    let el=$('iqc31HistoryReceipt');if(!el){el=document.createElement('section');el.id='iqc31HistoryReceipt';$('iqcRcCommit').after(el);}
    el.innerHTML=`<h3>歷史紀錄｜${r.receipt.rowCount} 筆已入帳</h3><p>區域 ${esc(r.payload.regionCode)}｜${esc(r.receipt.writtenAt)}</p><p>收據：${esc(r.receipt.receiptId)}</p><p class="iqc-rc-note">${current.batch.photosClearedAt?'本機照片已清除；CTN、歸類與收據保留。':'原照片保留在此裝置，沒有上傳後端。可在下方手動清理已入帳照片；尚未入帳的照片不會清除。'}</p>${table(r.payload.items)}<button id="iqc31HistoryPhotos" type="button" class="iqc-rc-btn" ${current.batch.photosClearedAt?'disabled':''}>查看本批照片</button><button id="iqc31ClearPhotos" type="button" class="iqc-rc-btn" ${current.batch.photosClearedAt?'disabled':''}>清除本批照片</button>`;
  }
  function paint(){
    if(!configured())return;installStyle();
    const commit=$('iqcRcCommit'),sync=$('iqcRcSyncPending');if(!commit||!sync)return;
    if(!$('iqc31SubmitMessage')){
      const n=document.createElement('p');n.id='iqc31SubmitMessage';n.className='iqc-rc-note';n.style.cssText='font-size:14px;color:#ffe4a3;overflow-wrap:anywhere';n.setAttribute('role','status');n.setAttribute('aria-live','polite');commit.before(n);
    }
    const ready=!!current?.batch&&current.batch.id===active(),r=ownRecord(),working=busy||ctl().isBusy();
    text($('iqcRcCommitHint'),'先預覽目前批次，核對 CTN／RT／狀態與數量後送到獨立測試表。日期與操作者由後端依登入身分建立。');
    text(commit,busy?'正在處理目前批次…':'預覽並送出目前批次（測試）');disabled(commit,!configured()||working||!ready||!current.photos.length||frozen());
    text(sync,'查收據／重試本批');disabled(sync,!configured()||working||!r);
    commit.setAttribute('aria-busy',String(busy));sync.setAttribute('aria-busy',String(busy));
    if(messageBatch===active())text($('iqc31SubmitMessage'),message);
    else if(r?.status==='SYNCED')text($('iqc31SubmitMessage'),`測試表已寫入 ${r.receipt.rowCount} 筆｜${r.receipt.writtenAt}｜收據 ${r.receipt.receiptId}`);
    else if(r)text($('iqc31SubmitMessage'),busy?message:`本批待確認；原資料已固定。${r.lastError||'請按「查收據／重試本批」，不需重建批次。'}`);
    else text($('iqc31SubmitMessage'),message);
    if(ready)text($('iqcRcPendingCount'),r&&r.status!=='SYNCED'?'1':'0');history(ready?r:null);
    ['iqc31ClearPhotos','iqc31HistoryPhotos'].forEach(id=>{if($(id))disabled($(id),working||!!current?.batch?.photosClearedAt);});
    if(frozen()){
      ['iqcRcRegion','iqcRcAnalyze','iqc31StartTop','iqcRcCameraBtn','iqcRcGalleryBtn','iqc31BatchRename','iqc31BatchName','iqc31BatchRemove','iqcHybridSyncBtn'].forEach(id=>{if($(id))$(id).disabled=true;});
      $('iqcImageRc')?.querySelectorAll('[data-photo-delete],[data-ocr31-photo],[data-review-photo],[data-review-quality],[data-merge-rt]').forEach(b=>{b.disabled=true;});
    }else if($('iqcRcRegion'))disabled($('iqcRcRegion'),working||!ready);
  }
  async function digest(p){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(p)));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
  async function post(body,account,timeout=60000){
    const c=context();if(c.account!==account)throw Error('登入帳號已變更，請使用原帳號查收據／重試。');
    const controller=new AbortController(),began=Date.now(),timer=setTimeout(()=>controller.abort(),timeout);
    try{const r=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,session_token:c.token}),signal:controller.signal});
      if(!r.ok)throw Error('後端連線未完成。');const data=await r.json();
      if(data.protocol!==model.protocol||data.environment!==model.environment)throw Error('回應不是指定測試後端，已停止處理。');ctl().submissionTiming(body.api,Date.now()-began,data.server);return data;
    }finally{clearTimeout(timer);}
  }
  async function accept(data,r){
    if(!model.receipt(data,r))return false;
    stage('已收到收據，正在保存歷史');await store.update(r,{status:'SYNCED',receipt:data.receipt,lastError:''});phase='';note(`測試表已寫入 ${data.receipt.rowCount} 筆，已列入歷史紀錄｜${data.receipt.writtenAt}｜收據 ${data.receipt.receiptId}`);return true;
  }
  async function send(r,retry){
    if(r.protocol!==model.protocol||r.environment!==model.environment||r.endpoint!==endpoint)throw Error('舊版／其他環境送出紀錄不會重送。');
    if(context().account!==r.account)throw Error('請使用原送出帳號查收據／重試。');
    if(retry){
      stage('正在查詢本批永久收據');
      const d=await post({api:'iqc_image_status',protocol:model.protocol,environment:model.environment,submissionId:r.submissionId,payloadHash:r.payloadHash},r.account);
      if(await accept(d,r))return;
      if(d.ok!==true||d.found||d.pending)throw Error(d.message||'收據尚未能核對，請稍後再查詢。');
      if(r.status==='SYNCED')throw Error('後端未找到既有收據，已停止重送，請交由 CG 核對。');
    }
    stage('正在送至獨立測試表，等候驗證／入帳回覆');
    try{
      const data=await post({api:'iqc_image_submit',payload:r.payload},r.account);
      if(await accept(data,r))return;
      if(data.confirmedRejected===true&&data.submissionId===r.submissionId&&data.payloadHash===r.payloadHash){
        await store.update(r,{status:'REJECTED',lastError:data.message});throw Error('後端未寫入：'+data.message+'；可修正本批後重新預覽。');
      }
      throw Error(data.message||'後端尚未提供完整收據。');
    }catch(e){
      const latest=await store.snapshot(r.batchId),saved=latest.submissions.find(s=>s.submissionId===r.submissionId);
      if(saved?.status==='REJECTED')throw e;
      await store.update(r,{status:'PENDING',lastError:'未確認寫入結果，請用原批次查收據／重試。'});
      throw Error(e.name==='AbortError'?'等待逾時，資料保留；請按「查收據／重試本批」。':e.message);
    }
  }
  async function operation(work){
    if(busy||ctl().isBusy())return;busy=true;stage('正在核對／處理目前批次');ticker=setInterval(tick,1000);paint();
    try{await ctl().submissionOperation(work);}catch(e){
      const message=e.code==='OTHER_TAB_BUSY'?'另一個分頁正在處理此批次，請等該頁完成後再試。':e.message||'本批尚未完成，資料仍保留。';
      if(preview&&!preview.data&&$('iqc31SubmitPreview')){
        $('iqc31SubmitPreview').innerHTML='<h3>本批尚無法預覽</h3><p role="alert" style="color:#ffe4a3;overflow-wrap:anywhere">'+esc(message)+'</p><button id="iqc31SubmitBack" type="button" class="iqc-rc-btn">返回修改</button>';
        $('iqc31SubmitPreview').setAttribute('aria-busy','false');reveal($('iqc31SubmitPreview'));
      }
      phase='';note(message,!$('iqc31SubmitPreview'));
    }
    finally{clearInterval(ticker);phase='';busy=false;await refresh().catch(()=>{});await window.__DS_IQC_BATCHES31?.reload().catch(()=>note('批次清單尚未更新，請重新開啟影像頁；原資料保留。'));ctl().submissionStatus(message);paint();}
  }
  function closePreview(){preview=null;$('iqc31SubmitPreview')?.remove();}
  async function openPreview(){
    if(!configured()){note('獨立測試後端尚未設定，資料保留本機。');return;}
    if(busy||ctl().isBusy())return;
    if(window.__DS_IQC_REVIEW31?.allowLeave()===false)return;
    closePreview();preview={batchId:active(),snapshot:null,data:null};
    const panel=document.createElement('section');panel.id='iqc31SubmitPreview';panel.className='iqc-rc-card';panel.style.cssText='margin-top:14px;border-color:#e6ba58;scroll-margin-top:100px';
    panel.setAttribute('aria-busy','true');panel.innerHTML='<h3>正在整理預覽…</h3><p role="status">正在讀取本機批次與歸類，尚未送出資料。</p>';
    $('iqcRcCommit').parentElement.append(panel);reveal(panel);
    await operation(async()=>{
      context();const snapshot=await store.snapshot(active());let legacy={};try{legacy=JSON.parse(localStorage.getItem('ds_iqc_v8_meta_override_'+active())||'{}');}catch(_){}
      const data=model.draft(snapshot,legacy);
      const warning=[...data.warnings,...snapshot.photos.flatMap(p=>[...(p.rc31Quality?.unread||[]).map(r=>`第 ${p.seq} 張疑似漏讀：${r.raw}`),...(p.rc31Quality?.uncertain||[]).map(r=>`第 ${p.seq} 張請核對字元：${r.ctn}`)])];
      preview={batchId:snapshot.batch.id,snapshot,data};
      panel.innerHTML=`<h3>本批送出預覽（獨立測試表）</h3><p>區域 ${esc(snapshot.batch.regionCode)}｜${data.items.length} 支｜重複 ${data.duplicateCount} 筆已合併</p>${warning.length?'<ul class="iqc-issue">'+warning.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':''}${table(data.items)}<label style="display:flex;gap:10px;align-items:flex-start;margin:16px 0"><input id="iqc31SubmitConfirm" type="checkbox" style="width:22px;height:22px;flex:none"><span>已逐一核對 CTN 字元、歸屬與實際數量；確認送至測試表。</span></label><div class="iqc-rc-row"><button id="iqc31SubmitAccept" type="button" class="iqc-rc-btn good" disabled>確認送出測試批次</button><button id="iqc31SubmitBack" type="button" class="iqc-rc-btn">返回修改</button></div>`;
      panel.setAttribute('aria-busy','false');reveal(panel);phase='';note('預覽已完成，請核對下方資料後再確認送出。');
    });
  }
  async function commit(){
    if(!preview?.data||!$('iqc31SubmitConfirm')?.checked)return;const saved=preview;
    await operation(async()=>{
      if(saved.snapshot.batch.id!==active())throw Error('目前批次已切換，請重新預覽。');
      const c=context(),p=model.payload(saved.snapshot,saved.data,'IQCIMG_TEST_'+crypto.randomUUID());
      const r={protocol:model.protocol,environment:model.environment,endpoint,account:c.account,submissionId:p.submissionId,batchId:p.batchId,payload:p,payloadHash:await digest(p),status:'PENDING',receipt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastError:''};
      stage('正在本機保存送出資料');await store.freeze(saved.snapshot,r);closePreview();current=await store.snapshot(r.batchId);paint();reveal($('iqc31SubmitMessage'));
      if(!navigator.onLine){phase='';note('目前離線，本批已保存在本機；恢復網路後請按「查收據／重試本批」。');return;}
      await send(r,false);
    });
  }
  function retry(){return operation(async()=>{const s=await store.snapshot(active()),r=s.submissions.find(r=>r.status!=='REJECTED');if(!r)throw Error('本批尚無送出紀錄。');await send(r,true);});}
  function activate(id){if(busy||ctl().isBusy())return;if(id==='iqcRcCommit')return openPreview();if(id==='iqcRcSyncPending')return retry();if(id==='iqc31SubmitAccept')return commit();if(id==='iqc31SubmitBack'){closePreview();reveal($('iqcRcCommit'));}}
  document.addEventListener('change',e=>{if(e.target.id==='iqc31SubmitConfirm')$('iqc31SubmitAccept').disabled=!e.target.checked;});
  document.addEventListener('click',async e=>{
    if(e.target.closest?.('#iqc31HistoryPhotos')){const card=$('iqcRcPhotoList')?.closest('section.iqc-rc-card');historyPhotos=!historyPhotos;card?.classList.toggle('iqc31-work-only',!historyPhotos);if(historyPhotos)reveal(card);return;}
    if(!e.target.closest?.('#iqc31ClearPhotos')||busy||ctl().isBusy())return;
    if(!confirm('只清除此已入帳批次在本機的原照片與縮圖？清除後無法還原照片，CTN、歸類及收據仍保留。'))return;
    await operation(async()=>{stage('正在清理已入帳照片');const result=await store.clearPhotos(active(),context().account);await ctl().refresh();phase='';note(`已清除 ${result.count} 張本機照片，約 ${(result.bytes/1048576).toFixed(1)} MB；文字資料與收據保留。`);});
  });
  document.addEventListener('click',e=>{const b=e.target.closest?.('#iqc31SubmitAccept,#iqc31SubmitBack');if(!b)return;e.preventDefault();activate(b.id);});
  window.__DS_IQC_SUBMIT31={ready:configured,refresh,paint,openPreview,retry,frozen,activate};
})();
