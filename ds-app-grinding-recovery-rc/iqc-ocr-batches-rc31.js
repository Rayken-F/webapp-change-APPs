/* RC31.10: local transportation-frame batches; recognition owns one batch at a time. */
(function(){
  "use strict";
  const controller=window.__DS_IQC_RC31,$=id=>document.getElementById(id),active=()=>localStorage.getItem('ds_iqc_image_rc_active_batch');
  let batches=[],counts={},loaded=false,loading=null,signature='',shown='',nameDirty=false;
  const label=b=>b.label||('批次 '+new Date(b.createdAt).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' · '+b.id.slice(-6));
  function install(){
    if($('iqc31BatchSelect')||!$('iqcRcRegion'))return;
    const section=document.createElement('div');section.id='iqc31BatchControls';section.style.marginTop='12px';
    section.innerHTML='<div class="iqc-rc-field"><label for="iqc31BatchSelect">目前批次／運輸框架</label><select id="iqc31BatchSelect" aria-label="選擇影像批次"><option>讀取批次…</option></select></div><div class="iqc-rc-row" id="iqc31BatchActions" style="margin-top:8px"></div><details style="margin-top:8px"><summary>命名此批次</summary><div class="iqc-rc-field" style="margin-top:8px"><label for="iqc31BatchName">框架編號或名稱（選填）</label><input id="iqc31BatchName" maxlength="40" placeholder="例如：框架 A／上午第 1 框"></div><button id="iqc31BatchRename" class="iqc-rc-btn" type="button" style="margin-top:8px">儲存名稱</button></details><p class="iqc-rc-note">建議一個運輸框架一批，約 3～4 張照片。一次只辨識所選批次；切換可繼續原批的照片與歸類。批次保存在本機。</p><p id="iqc31BatchMessage" class="iqc-rc-note" role="status"></p>';
    $('iqcRcRegion').closest('.iqc-rc-grid').before(section);$('iqc31BatchActions').appendChild($('iqcRcNewBatch'));paint(controller.isBusy());
  }
  function paint(busy){['iqc31BatchSelect','iqc31BatchName','iqc31BatchRename','iqcRcRegion'].forEach(id=>{if($(id))$(id).disabled=busy;});}
  function render(){
    install();const select=$('iqc31BatchSelect');if(!select)return;const current=active();
    const next=JSON.stringify([current,batches.map(b=>[b.id,b.label,b.createdAt,counts[b.id]])]);
    if(signature!==next){signature=next;select.replaceChildren(...batches.map(b=>{const o=document.createElement('option');o.value=b.id;o.textContent=label(b)+'｜'+(counts[b.id]??0)+' 張';return o;}));select.value=current;}
    if(shown!==current){shown=current;nameDirty=false;}
    if(!nameDirty)$('iqc31BatchName').value=batches.find(b=>b.id===current)?.label||'';
    paint(controller.isBusy());
  }
  async function reload(){
    if(loading)return loading;
    loading=(async()=>{const list=await controller.listBatches(),totals=await controller.batchCounts(list.map(b=>b.id));batches=list.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||a.id.localeCompare(b.id));counts=totals;loaded=true;render();})().finally(()=>{loading=null;});return loading;
  }
  function refresh(photos){
    install();if(!loaded||!batches.some(b=>b.id===active())){reload().catch(()=>{if($('iqc31BatchMessage'))$('iqc31BatchMessage').textContent='批次清單讀取失敗，請重新開啟影像頁；原資料保留。';});return;}
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
    if(!e.target.closest('#iqc31BatchRename')||controller.isBusy())return;
    const message=$('iqc31BatchMessage');message.textContent='正在儲存名稱…';
    try{await controller.renameBatch($('iqc31BatchName').value);nameDirty=false;message.textContent='批次名稱已儲存。';render();}catch(error){message.textContent=error.message||'名稱未保存，請重試。';}
  });
  window.__DS_IQC_BATCHES31={refresh,reload,paint};
})();
