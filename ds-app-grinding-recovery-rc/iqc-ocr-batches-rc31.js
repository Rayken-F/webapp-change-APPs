/* RC31.12: local transportation-frame batches; recognition owns one batch at a time. */
(function(){
  "use strict";
  const controller=window.__DS_IQC_RC31,$=id=>document.getElementById(id),active=()=>localStorage.getItem('ds_iqc_image_rc_active_batch');
  let batches=[],counts={},loaded=false,loading=null,signature='',shown='',nameDirty=false,removing=false;
  const label=b=>b.label||('批次 '+new Date(b.createdAt).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' · '+b.id.slice(-6));
  function install(){
    if($('iqc31BatchSelect')||!$('iqcRcRegion'))return;
    const section=document.createElement('div');section.id='iqc31BatchControls';section.style.marginTop='12px';
    section.innerHTML='<div class="iqc-rc-field"><label for="iqc31BatchSelect">目前批次／運輸框架</label><select id="iqc31BatchSelect" aria-label="選擇影像批次"><option>讀取批次…</option></select></div><div class="iqc-rc-row" id="iqc31BatchActions" style="margin-top:8px"></div><details style="margin-top:8px"><summary>命名此批次</summary><div class="iqc-rc-field" style="margin-top:8px"><label for="iqc31BatchName">框架編號或名稱（選填）</label><input id="iqc31BatchName" maxlength="40" placeholder="例如：框架 A／上午第 1 框"></div><button id="iqc31BatchRename" class="iqc-rc-btn" type="button" style="margin-top:8px">儲存名稱</button></details><p class="iqc-rc-note">建議一個運輸框架一批，約 3～4 張照片。一次只辨識所選批次；切換可繼續原批的照片與歸類。批次保存在本機。</p><p id="iqc31BatchMessage" class="iqc-rc-note" role="status"></p>';
    $('iqcRcRegion').closest('.iqc-rc-grid').before(section);$('iqc31BatchActions').appendChild($('iqcRcNewBatch'));
    const remove=document.createElement('button');remove.id='iqc31BatchRemove';remove.type='button';remove.className='iqc-rc-btn danger';remove.textContent='移除目前批次';$('iqc31BatchActions').appendChild(remove);
    const check=document.createElement('button');check.id='iqc31BatchPreflight';check.type='button';check.className='iqc-rc-btn';check.textContent='送出前檢查空批次';
    const result=document.createElement('p');result.id='iqc31PreflightResult';result.className='iqc-rc-note';result.setAttribute('role','status');
    $('iqcRcCommit').before(check,result);paint(controller.isBusy());
  }
  function paint(busy){$('iqc31BatchControls')?.setAttribute('aria-busy',String(busy||removing));['iqc31BatchSelect','iqc31BatchName','iqc31BatchRename','iqcRcRegion','iqc31BatchRemove'].forEach(id=>{if($(id))$(id).disabled=busy||removing||!active();});if($('iqc31BatchPreflight'))$('iqc31BatchPreflight').disabled=busy||removing;}
  function render(){
    install();const select=$('iqc31BatchSelect');if(!select)return;const current=active();
    const next=JSON.stringify([current,batches.map(b=>[b.id,b.label,b.createdAt,counts[b.id]])]);
    if(signature!==next){signature=next;select.replaceChildren(...batches.map(b=>{const o=document.createElement('option');o.value=b.id;o.textContent=label(b)+'｜'+(counts[b.id]?counts[b.id]+' 張':'空批次');return o;}));if(!batches.length){const o=document.createElement('option');o.value='';o.textContent='目前沒有批次，請新增或加入照片';select.appendChild(o);}select.value=current||'';}
    if(shown!==current){shown=current;nameDirty=false;}
    if(!nameDirty)$('iqc31BatchName').value=batches.find(b=>b.id===current)?.label||'';
    paint(controller.isBusy());
  }
  async function reload(){
    if(loading)return loading;
    loading=(async()=>{const list=await controller.listBatches(),totals=await controller.batchCounts(list.map(b=>b.id));batches=list.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||a.id.localeCompare(b.id));counts=totals;loaded=true;render();})().finally(()=>{loading=null;});return loading;
  }
  function refresh(photos){
    install();if(!loaded||active()&&!batches.some(b=>b.id===active())){reload().catch(()=>{if($('iqc31BatchMessage'))$('iqc31BatchMessage').textContent='批次清單讀取失敗，請重新開啟影像頁；原資料保留。';});return;}
    if(Array.isArray(photos))counts[active()]=photos.length;render();
  }
  document.addEventListener('input',e=>{if(e.target.id==='iqc31BatchName')nameDirty=true;});
  document.addEventListener('change',async e=>{
    if(e.target.id!=='iqc31BatchSelect')return;const id=e.target.value;e.target.value=active();
    if(id===active()||controller.isBusy()||window.__DS_IQC_REVIEW31?.allowLeave()===false)return;
    const message=$('iqc31BatchMessage');message.textContent='正在讀取所選批次…';
    try{await controller.selectBatch(id);message.textContent='已切換，原批次保留。';}catch(error){message.textContent=error.message||'切換失敗，請重試。';}render();
  });
  document.addEventListener('click',async e=>{
    if(e.target.closest('#iqc31BatchPreflight')){
      if(controller.isBusy()||removing)return;
      const result=$('iqc31PreflightResult');result.textContent='正在檢查本機批次…';
      try{const list=await controller.listBatches(),r=await controller.checkSubmissionBatches(list.map(b=>b.id));
        result.textContent=`有 CTN 的批次 ${r.nonempty.length} 批；空批次 ${r.empty.length} 批已排除，不建立待傳資料。${r.blocked.length?'另有 '+r.blocked.length+' 批需處理：'+r.blocked.map(x=>(list.find(b=>b.id===x.id)?.label||'未命名批次')+'（'+x.reason+'）').join('、')+'。':''}本次僅檢查，尚未送出；正式 IQC 寫入仍鎖定。`;
      }catch(_){result.textContent='檢查未完成，沒有送出任何批次，請重試。';}return;
    }
    if(e.target.closest('#iqc31BatchRemove')){
      if(controller.isBusy()||removing||!active())return;
      removing=true;paint(false);const message=$('iqc31BatchMessage');
      try{
        const snapshot=await controller.inspectBatch(active());
        if(!snapshot.batch)throw new Error('此批次已不存在，請重新開啟影像頁。');
        if(snapshot.protected)throw new Error('此批次已有待傳資料、送出紀錄或收據，不能移除。');
        if(!confirm(`移除「${label(snapshot.batch)}」？\n將刪除本機 ${snapshot.photos.length} 張照片、辨識結果及人工歸類，無法復原。其他批次保留。`)){message.textContent='已取消移除，原批次保留。';return;}
        message.textContent='正在移除批次及本機照片…';await controller.removeBatch(snapshot);
        for(const key of ['ds_iqc_v8_meta_override_','ds_iqc_hybrid_v15_local_attempted_','ds_iqc_hybrid_v15_local_evaluated_'])localStorage.removeItem(key+snapshot.batch.id);
        message.textContent='批次與本機照片已移除。';
        try{await window.__DS_IQC_HYBRID_V21?.removeBatchJobs(snapshot.batch.id);}catch(_){message.textContent='批次與本機照片已移除；輔助辨識紀錄清理失敗，請保留此訊息交給 CG。';}
        $('iqc31PreflightResult').textContent='';
      }catch(error){message.textContent=error.message||'移除未完成，請重試。';}
      finally{removing=false;paint(controller.isBusy());}return;
    }
    if(!e.target.closest('#iqc31BatchRename')||controller.isBusy())return;
    const message=$('iqc31BatchMessage');message.textContent='正在儲存名稱…';
    try{await controller.renameBatch($('iqc31BatchName').value);nameDirty=false;message.textContent='批次名稱已儲存。';render();}catch(error){message.textContent=error.message||'名稱未保存，請重試。';}
  });
  window.__DS_IQC_BATCHES31={refresh,reload,paint};
})();
