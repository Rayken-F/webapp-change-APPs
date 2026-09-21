/* RC31.1 photo review. Does not change OCR text or submit IQC records. */
(function(){
  "use strict";
  const model=window.IqcReviewModel31,$=id=>document.getElementById(id),controller=()=>window.__DS_IQC_RC31;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let snapshot=[],groups=[],signature="",refreshId=0;
  controller().reviewActive=true;
  function photoButtons(){
    $("iqcRcPhotoList")?.querySelectorAll("[data-photo-delete]").forEach(del=>{
      const card=del.closest(".iqc-photo"),p=snapshot.find(p=>p.id===del.dataset.photoDelete);if(!p)return;
      let button=card.querySelector("[data-review-photo]");if(!button){button=document.createElement("button");button.type="button";button.className="iqc-rc-btn";button.dataset.reviewPhoto=p.id;button.style.gridColumn="2 / 4";button.textContent="手動歸類／核對 CTN";card.appendChild(button);}
      const count=model.candidates(p).length;button.disabled=controller().isBusy()||count===0;
      let detail=card.querySelector(".rc31-photo-result");if(!detail){detail=document.createElement("small");detail.className="rc31-photo-result";card.querySelector(".meta").appendChild(detail);}
      const status=p.status==="PROCESSING"?"處理中":p.status==="LOCAL_FAILED"?`未完成（${p.localFailure||"辨識中斷"}）`:p.status==="RECOGNIZED"?(count?`已讀出 ${count} 個 CTN 候選`:"辨識已完成，但未找到 CTN"):"等待辨識";
      if(detail.textContent!==status)detail.textContent=status;
    });
  }
  function render(){
    const host=$("iqcRcResultList");if(!host)return;
    host.innerHTML=groups.map(g=>`<section class="iqc-group ${g.ready?'good':'warn'} ds-iqc-v8-group"><div class="iqc-group-title"><div><strong>${g.rt?'RT '+esc(g.rt):'待歸類'}</strong><div class="iqc-group-sub">來源照片：${g.photoSeqs.map(n=>'第 '+n+' 張').join('、')}<br>狀態 ${esc(g.status||'待填')}｜廠區 ${esc(g.plant||'待填')}</div></div><span class="iqc-rc-status ${g.ready?'good':'warn'}">${g.ctns.length}/${g.expected||'?'} ${g.ready?'數量吻合':'需複查'}</span></div>${!g.rt?'<p class="iqc-issue">照片未拍到 RT，請選「手動歸類」指定；所有候選 CTN 均保留。</p>':''}${g.warnings.map(w=>'<p class="iqc-issue bad">'+esc(w)+'</p>').join('')}<div class="iqc-ctn-grid">${g.ctns.map(ctn=>'<span class="iqc-ctn-input">'+esc(ctn)+'</span>').join('')}</div><p class="iqc-rc-note">${g.rows.some(r=>r.manual)?'含人工歸類｜':''}${g.rows.some(r=>r.legacy)?'保留前版人工核對｜':''}數量吻合仍需核對字元。</p><div class="iqc-rc-row">${g.photoIds.map(id=>'<button type="button" class="iqc-rc-btn" data-review-photo="'+esc(id)+'">手動歸類：第 '+snapshot.find(p=>p.id===id)?.seq+' 張</button>').join('')}</div></section>`).join('')||'<div class="iqc-empty">尚無 CTN 候選。請先辨識照片；沒有 RT 也能在此手動歸類。</div>';
    const hint=$("iqcRcCommitHint");if(hint)hint.textContent="RC31.1：逐筆核對 RT／CTN／狀態／廠區／總量；本輪正式 IQC 寫入維持鎖定。";
  }
  async function refresh(list){
    const id=++refreshId,batch=localStorage.getItem('ds_iqc_image_rc_active_batch');
    const photos=Array.isArray(list)?list:await controller().readPhotos();
    if(id!==refreshId||batch!==localStorage.getItem('ds_iqc_image_rc_active_batch'))return;
    snapshot=photos;const next=batch+'|'+JSON.stringify(photos.map(p=>[p.id,p.updatedAt,p.status,p.ocrText,p.rc31Review]));
    if(next!==signature){signature=next;let legacy={};try{legacy=JSON.parse(localStorage.getItem('ds_iqc_v8_meta_override_'+batch)||'{}');}catch(_){}groups=model.build(photos,model.legacyDecisions(photos,legacy));render();}
    photoButtons();return groups;
  }
  function showEditor(photoId){
    if(controller().isBusy())return;
    const p=snapshot.find(p=>p.id===photoId);if(!p)return;const candidates=groups.flatMap(g=>g.rows).filter(r=>r.photoId===p.id);if(!candidates.length)return;
    $("iqc31ReviewEditor")?.remove();
    const editor=document.createElement('section');editor.id='iqc31ReviewEditor';editor.className='iqc-rc-card';editor.dataset.photoId=photoId;
    const same=candidates.every(x=>x.rt===candidates[0].rt&&x.status===candidates[0].status&&x.plant===candidates[0].plant)?candidates[0]:{};
    editor.innerHTML=`<div class="iqc-rc-row iqc-rc-between"><strong>第 ${p.seq} 張｜手動歸類與核對</strong><button type="button" class="iqc-rc-btn" data-review-close>關閉</button></div><p class="iqc-rc-note">預設勾選整張；如有多個 RT，可分次勾選 CTN。人工設定只修改歸類，原照片與 OCR 文字保留。</p><div class="iqc-rc-field"><label for="iqc31TargetGroup">沿用已辨識的群組（可選）</label><select id="iqc31TargetGroup"><option value="">自行填寫 RT 與資料</option>${groups.filter(g=>g.rt).map(g=>'<option value="'+esc(g.key)+'">RT '+esc(g.rt)+'｜'+esc(g.status||'狀態待填')+'｜'+esc(g.plant||'廠區待填')+'</option>').join('')}</select></div><div class="iqc-rc-grid" style="margin-top:10px">${[['rt','RT（必填）',same.rt||''],['status','鋼瓶狀態',same.status||''],['plant','廠區',same.plant||''],['expected','此 RT／狀態／廠區標籤總量（未知可留空）',same.expected||'']].map(([key,label,value])=>'<div class="iqc-rc-field"><label for="iqc31Review_'+key+'">'+label+'</label><input id="iqc31Review_'+key+'" value="'+esc(value)+'" '+(key==='rt'||key==='expected'?'inputmode="numeric"':'autocapitalize="characters"')+'></div>').join('')}</div><p>勾選本次要歸類的 CTN：</p><div class="iqc-rc-row"><button type="button" class="iqc-rc-btn" data-review-all="1">全選</button><button type="button" class="iqc-rc-btn" data-review-all="0">清除勾選</button></div><div class="rc31-review-candidates">${candidates.map(r=>'<label style="display:flex;gap:10px;align-items:center;margin:8px 0"><input type="checkbox" checked data-review-key="'+esc(r.original)+'"><input class="iqc-ctn-input" aria-label="核對 CTN" value="'+esc(r.ctn)+'" style="flex:1;min-width:0" autocapitalize="characters"><small>'+esc(r.manual?'人工':r.rt?'RT '+r.rt:'待歸類')+'</small></label>').join('')}</div><p id="iqc31ReviewMessage" role="status"></p><div class="iqc-rc-row"><button class="iqc-rc-btn good" type="button" data-review-save>套用歸類</button><button class="iqc-rc-btn" type="button" data-review-clear>取消所選人工設定</button></div>`;
    $("iqcRcResultList").before(editor);editor.scrollIntoView({block:'start'});
  }
  document.addEventListener('change',e=>{
    if(e.target.id!=='iqc31TargetGroup')return;const g=groups.find(g=>g.key===e.target.value);if(!g)return;
    ['rt','status','plant','expected'].forEach(key=>$("iqc31Review_"+key).value=g[key]||'');
  });
  document.addEventListener('click',async e=>{
    const button=e.target.closest?.('button');if(!button)return;
    if(button.dataset.reviewPhoto){showEditor(button.dataset.reviewPhoto);return;}
    if(button.hasAttribute('data-review-close')){$("iqc31ReviewEditor")?.remove();return;}
    if(button.dataset.reviewAll!==undefined){$("iqc31ReviewEditor").querySelectorAll('[data-review-key]').forEach(el=>el.checked=button.dataset.reviewAll==='1');return;}
    if(!button.hasAttribute('data-review-save')&&!button.hasAttribute('data-review-clear'))return;
    const editor=$("iqc31ReviewEditor"),id=editor.dataset.photoId;
    const selection=[...editor.querySelectorAll('[data-review-key]:checked')].map(el=>({original:el.dataset.reviewKey,ctn:el.nextElementSibling.value}));
    const meta=Object.fromEntries(['rt','status','plant','expected'].map(key=>[key,$("iqc31Review_"+key).value]));
    const message=$("iqc31ReviewMessage");editor.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);message.textContent='正在保存人工歸類…';
    try{await controller().saveReview(id,p=>model.updateReview(p,selection,meta,{clear:button.hasAttribute('data-review-clear')}));await refresh();message.textContent='已保存人工歸類。可關閉後查看群組，或继续勾選其他 CTN。';}
    catch(error){message.textContent=error.message||'保存失敗，請稍後重試。';}
    finally{editor.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);}
  });
  document.addEventListener('DOMContentLoaded',()=>{
    const style=document.createElement('style');style.textContent='#iqc31ReviewEditor{scroll-margin-top:70px}#iqc31ReviewEditor input[type=checkbox]{width:24px;height:24px;flex:none}#iqc31ReviewEditor input:not([type=checkbox]),#iqc31ReviewEditor select{font-size:16px;box-sizing:border-box}#iqc31ReviewMessage{color:#ffe4a3}';document.head.appendChild(style);
    const host=$("iqcRcPhotoList");if(host)new MutationObserver(photoButtons).observe(host,{childList:true});
  });
  window.__DS_IQC_META_GROUPING_V8={version:'RC31_REVIEW_S2',refresh,getModel:()=>groups};
  window.__DS_IQC_REVIEW31={refresh,showEditor,getModel:()=>groups};
})();
