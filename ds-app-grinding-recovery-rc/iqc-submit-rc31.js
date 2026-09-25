/* RC31.13: explicit test-only submission; no background replay or legacy endpoint. */
(function(){
  'use strict';
  const model=window.IqcSubmitModel31,store=window.IqcSubmitStore31;
  const endpoint='https://script.google.com/macros/s/AKfycbyVr5PqTETUV6YmMbQ2zO38Xk_fHiSYkST8xn2di09xvEfay_HDdTwJWBWx0v47k0R6/exec';
  const active=()=>localStorage.getItem('ds_iqc_image_rc_active_batch')||'',ctl=()=>window.__DS_IQC_RC31,$=id=>document.getElementById(id);
  const configured=()=>/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=(el,value)=>{if(el&&el.textContent!==value)el.textContent=value;};
  let current=null,busy=false,epoch=0,preview=null,message='僅寫入獨立測試表，正式 IQC 保持不變。',messageBatch='';
  function context(){const c=window.DS_PORTAL_BRIDGE?.getSessionContext?.(),account=c?.profile?.user?.account;
    if(!c?.token||!account)throw Error('請先登入 DS 工作台。');
    if(c.profile.permissions?.daily_report_enabled!==true)throw Error('此帳號未開啟日報／IQC 建檔權限。');return {token:c.token,account};}
  const record=()=>current?.submissions.find(r=>r.status!=='REJECTED');
  const frozen=()=>current?.batch&&current.batch.id===active()&&current.batch.status!=='DRAFT';
  const ownRecord=()=>{const r=record();return r?.protocol===model.protocol&&r.environment===model.environment&&r.endpoint===endpoint?r:null;};
  function note(value){message=value;messageBatch=active();text($('iqc31SubmitMessage'),value);}
  async function refresh(){
    const n=++epoch,id=active();const next=id?await store.snapshot(id):null;
    if(n!==epoch||id!==active())return;if(current?.batch?.id!==id){messageBatch='';message='僅寫入獨立測試表，正式 IQC 保持不變。';}if(preview&&preview.snapshot.batch.id!==id)closePreview();current=next;paint();
  }
  function paint(){
    if(!configured())return;
    const commit=$('iqcRcCommit'),sync=$('iqcRcSyncPending');if(!commit||!sync)return;
    if(!$('iqc31SubmitMessage')){
      const n=document.createElement('p');n.id='iqc31SubmitMessage';n.className='iqc-rc-note';n.setAttribute('role','status');n.setAttribute('aria-live','polite');commit.after(n);
    }
    const ready=!!current?.batch&&current.batch.id===active(),r=ownRecord(),working=busy||ctl().isBusy();
    text($('iqcRcCommitHint'),'先預覽目前批次，核對 CTN／RT／狀態與數量後送到獨立測試表。日期與操作者由後端依登入身分建立。');
    text(commit,'預覽並送出目前批次（測試）');commit.disabled=!configured()||working||!ready||!current.photos.length||frozen();
    text(sync,'查收據／重試本批');sync.disabled=!configured()||working||!r;
    commit.setAttribute('aria-busy',String(busy));sync.setAttribute('aria-busy',String(busy));
    if(messageBatch===active())text($('iqc31SubmitMessage'),message);
    else if(r?.status==='SYNCED')text($('iqc31SubmitMessage'),`測試表已寫入 ${r.receipt.rowCount} 筆｜${r.receipt.writtenAt}｜收據 ${r.receipt.receiptId}`);
    else if(r)text($('iqc31SubmitMessage'),busy?message:`本批待確認；原資料已固定。${r.lastError||'請按「查收據／重試本批」，不需重建批次。'}`);
    else text($('iqc31SubmitMessage'),message);
    if(ready)text($('iqcRcPendingCount'),r&&r.status!=='SYNCED'?'1':'0');
    if(frozen()){
      ['iqcRcRegion','iqcRcAnalyze','iqc31StartTop','iqcRcCameraBtn','iqcRcGalleryBtn','iqc31BatchRename','iqc31BatchName','iqc31BatchRemove','iqcHybridSyncBtn'].forEach(id=>{if($(id))$(id).disabled=true;});
      $('iqcImageRc')?.querySelectorAll('[data-photo-delete],[data-ocr31-photo],[data-review-photo],[data-review-quality],[data-merge-rt]').forEach(b=>{b.disabled=true;});
    }else if($('iqcRcRegion'))$('iqcRcRegion').disabled=working;
  }
  async function digest(p){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(p)));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
  async function post(body,account,timeout=60000){
    const c=context();if(c.account!==account)throw Error('登入帳號已變更，請使用原帳號查收據／重試。');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{const r=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,session_token:c.token}),signal:controller.signal});
      if(!r.ok)throw Error('後端連線未完成。');const data=await r.json();
      if(data.protocol!==model.protocol||data.environment!==model.environment)throw Error('回應不是指定測試後端，已停止處理。');return data;
    }finally{clearTimeout(timer);}
  }
  async function accept(data,r){
    if(!model.receipt(data,r))return false;
    await store.update(r,{status:'SYNCED',receipt:data.receipt,lastError:''});note(`測試表已寫入 ${data.receipt.rowCount} 筆｜${data.receipt.writtenAt}｜收據 ${data.receipt.receiptId}`);return true;
  }
  async function send(r,retry){
    if(r.protocol!==model.protocol||r.environment!==model.environment||r.endpoint!==endpoint)throw Error('舊版／其他環境送出紀錄不會重送。');
    if(context().account!==r.account)throw Error('請使用原送出帳號查收據／重試。');
    if(retry){
      note('正在查詢本批永久收據…');
      const d=await post({api:'iqc_image_status',protocol:model.protocol,environment:model.environment,submissionId:r.submissionId,payloadHash:r.payloadHash},r.account);
      if(await accept(d,r))return;
      if(d.ok!==true||d.found||d.pending)throw Error(d.message||'收據尚未能核對，請稍後再查詢。');
      if(r.status==='SYNCED')throw Error('後端未找到既有收據，已停止重送，請交由 CG 核對。');
    }
    note('正在送至獨立測試表…請稍候，不需重複按。');
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
    if(busy||ctl().isBusy())return;busy=true;paint();
    try{await ctl().submissionOperation(work);}catch(e){note(e.message||'本批尚未完成，資料仍保留。');}
    finally{busy=false;await refresh().catch(()=>{});await window.__DS_IQC_BATCHES31?.reload().catch(()=>note('批次清單尚未更新，請重新開啟影像頁；原資料保留。'));paint();}
  }
  function closePreview(){preview=null;$('iqc31SubmitPreview')?.remove();}
  async function openPreview(){
    if(!configured()){note('獨立測試後端尚未設定，資料保留本機。');return;}
    if(window.__DS_IQC_REVIEW31?.allowLeave()===false)return;
    await operation(async()=>{
      context();const snapshot=await store.snapshot(active());let legacy={};try{legacy=JSON.parse(localStorage.getItem('ds_iqc_v8_meta_override_'+active())||'{}');}catch(_){}
      const data=model.draft(snapshot,legacy);
      const warning=[...data.warnings,...snapshot.photos.flatMap(p=>[...(p.rc31Quality?.unread||[]).map(r=>`第 ${p.seq} 張疑似漏讀：${r.raw}`),...(p.rc31Quality?.uncertain||[]).map(r=>`第 ${p.seq} 張請核對字元：${r.ctn}`)])];
      closePreview();preview={snapshot,data};
      const panel=document.createElement('section');panel.id='iqc31SubmitPreview';panel.className='iqc-rc-card';panel.style.cssText='margin-top:14px;border-color:#e6ba58;scroll-margin-top:100px';
      panel.innerHTML=`<h3>本批送出預覽（獨立測試表）</h3><p>區域 ${esc(snapshot.batch.regionCode)}｜${data.items.length} 支｜重複 ${data.duplicateCount} 筆已合併</p>${warning.length?'<ul class="iqc-issue">'+warning.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':''}<div style="max-height:45vh;overflow:auto"><ol>${data.items.map(x=>`<li><strong>${esc(x.ctn)}</strong>　RT ${esc(x.rtNo)}　${esc(x.cylinderStatus)}</li>`).join('')}</ol></div><label style="display:flex;gap:10px;align-items:flex-start;margin:16px 0"><input id="iqc31SubmitConfirm" type="checkbox" style="width:22px;height:22px;flex:none"><span>已逐一核對 CTN 字元、歸屬與實際數量；確認送至測試表。</span></label><div class="iqc-rc-row"><button id="iqc31SubmitAccept" type="button" class="iqc-rc-btn good" disabled>確認送出測試批次</button><button id="iqc31SubmitBack" type="button" class="iqc-rc-btn">返回修改</button></div>`;
      $('iqcRcCommit').parentElement.append(panel);panel.scrollIntoView({block:'start',behavior:'smooth'});
    });
  }
  async function commit(){
    if(!preview||!$('iqc31SubmitConfirm')?.checked)return;const saved=preview;
    await operation(async()=>{
      if(saved.snapshot.batch.id!==active())throw Error('目前批次已切換，請重新預覽。');
      const c=context(),p=model.payload(saved.snapshot,saved.data,'IQCIMG_TEST_'+crypto.randomUUID());
      const r={protocol:model.protocol,environment:model.environment,endpoint,account:c.account,submissionId:p.submissionId,batchId:p.batchId,payload:p,payloadHash:await digest(p),status:'PENDING',receipt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastError:''};
      await store.freeze(saved.snapshot,r);closePreview();current=await store.snapshot(r.batchId);paint();
      if(!navigator.onLine){note('已保存測試批次，恢復網路後請按「查收據／重試本批」。');return;}
      await send(r,false);
    });
  }
  function retry(){return operation(async()=>{const s=await store.snapshot(active()),r=s.submissions.find(r=>r.status!=='REJECTED');if(!r)throw Error('本批尚無送出紀錄。');await send(r,true);});}
  document.addEventListener('change',e=>{if(e.target.id==='iqc31SubmitConfirm')$('iqc31SubmitAccept').disabled=!e.target.checked;});
  document.addEventListener('click',e=>{const b=e.target.closest?.('#iqc31SubmitAccept,#iqc31SubmitBack');if(!b)return;e.preventDefault();if(busy)return;b.id==='iqc31SubmitAccept'?commit():closePreview();});
  window.__DS_IQC_SUBMIT31={ready:configured,refresh,paint,openPreview,retry,frozen};
})();
