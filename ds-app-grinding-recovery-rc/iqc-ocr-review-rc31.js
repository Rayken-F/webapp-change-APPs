/* RC31.11 photo review. Does not change OCR text or submit IQC records. */
(function(){
  "use strict";
  const model=window.IqcReviewModel31,$=id=>document.getElementById(id),controller=()=>window.__DS_IQC_RC31;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let snapshot=[],groups=[],signature="",refreshId=0,saveNoticeTimer=0;
  function hideSaveNotice(){clearTimeout(saveNoticeTimer);const notice=$("iqc31SaveNotice");if(notice)notice.hidden=true;}
  function showSaveNotice(message){
    hideSaveNotice();let notice=$("iqc31SaveNotice");
    if(!notice){notice=document.createElement('div');notice.id='iqc31SaveNotice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.setAttribute('aria-atomic','true');$("iqcImageRc").appendChild(notice);}
    notice.textContent=message;notice.hidden=false;saveNoticeTimer=setTimeout(hideSaveNotice,2500);
  }
  controller().reviewActive=true;
  function photoButtons(){
    $("iqcRcPhotoList")?.querySelectorAll("[data-photo-delete]").forEach(del=>{
      const card=del.closest(".iqc-photo"),p=snapshot.find(p=>p.id===del.dataset.photoDelete);if(!p)return;
      let button=card.querySelector("[data-review-photo]");if(!button){button=document.createElement("button");button.type="button";button.className="iqc-rc-btn";button.dataset.reviewPhoto=p.id;button.style.gridColumn="2 / 4";button.textContent="手動歸類／核對 CTN";card.appendChild(button);}
      const rows=model.candidates(p),count=rows.length,unassigned=rows.some(r=>!r.rt);button.disabled=controller().isBusy();
      const action=unassigned?"指定 RT／手動歸類":"手動歸類／核對 CTN";if(button.textContent!==action)button.textContent=action;
      let detail=card.querySelector(".rc31-photo-result");if(!detail){detail=document.createElement("small");detail.className="rc31-photo-result";card.querySelector(".meta").appendChild(detail);}
      let status=p.status==="PROCESSING"?"處理中":p.status==="NEEDS_REVIEW"?(count?`已保留 ${count} 個 CTN 候選，補讀未完成；可重新辨識`:"未找到 CTN，可重試或人工補登"):p.status==="LOCAL_FAILED"?`未完成（${p.localFailure||"辨識中斷"}）`:p.status==="RECOGNIZED"?(count?`已讀出 ${count} 個 CTN 候選${unassigned?'｜RT 待指定，不影響後續照片辨識':''}`:"辨識已完成，但未找到 CTN"):"等待辨識";
      const quality=p.rc31Quality;if(quality?.unread?.length)status+=`｜疑似漏讀 ${quality.unread.length} 列，請核對`;
      if(p.status==="LOCAL_FAILED"&&/^WORKER_/.test(p.localFailure||""))status=`未完成｜${controller().workerLabel(p.localFailure)}（${p.localFailure}）；自動恢復仍未完成，請複製辨識紀錄`;
      if(p.status!=="PROCESSING"&&p.localFailure==="IMAGE_READ_ERROR")status="本機照片內容無法讀取，原紀錄保留；其他照片會繼續處理。請保留原照片並複製辨識紀錄";
      if(p.status!=="PROCESSING"&&(p.localFailure==="DECODE_ERROR"||p.localFailure==="IMAGE_PREPROCESS_ERROR"))status=`照片${p.localFailure==="DECODE_ERROR"?"解碼":"前處理"}失敗，其他照片會繼續處理（${p.localFailure}）`;
      if(p.localSaveFailure)status=`本機存檔失敗，本輪結果尚未保存；原照片與先前結果保留（${p.localSaveFailure}）`;
      if(quality?.uncertain?.length)status+=`｜${quality.uncertain.length} 筆字元需核對`;
      if(detail.textContent!==status)detail.textContent=status;
      const warnings=(quality?.unread?.length||0)+(quality?.uncertain?.length||0);
      let review=card.querySelector('[data-review-quality]');
      if(warnings&&!review){review=document.createElement('button');review.type='button';review.className='iqc-rc-btn';review.dataset.reviewQuality=p.id;review.style.cssText='grid-column:2 / 4;color:#ffe4a3;border-color:#b39a50';card.appendChild(review);}
      if(review){review.hidden=!warnings;review.disabled=controller().isBusy();const label=`查看需核對字元（${warnings} 筆）`;if(review.textContent!==label)review.textContent=label;}
    });
  }
  function render(){
    const host=$("iqcRcResultList");if(!host)return;
    const view=model.presentation(groups);
    const repeated=view.duplicates?'<p id="iqc31DuplicateSummary" class="iqc-issue">本批重複 '+view.duplicates+' 個 CTN（多出 '+view.repeatedRows+' 筆），清單只列一次；原照片與歸類保留。</p>':'';
    const conflicts=view.conflicts.length?'<section id="iqc31Conflicts" class="iqc-group bad"><strong>CTN 歸屬待核對</strong><p class="iqc-rc-note">以下 CTN 出現不同 RT／狀態／廠區，只在此列一次；尚未決定正確歸屬。</p>'+view.conflicts.map(c=>'<div class="iqc-issue bad"><strong class="iqc31-conflict-ctn">'+esc(c.ctn)+'</strong><ul>'+c.choices.map(x=>'<li>RT '+esc(x.rt)+'｜'+esc(x.status||'狀態待填')+'｜'+esc(x.plant||'廠區待填')+'</li>').join('')+'</ul><div class="iqc-rc-row">'+c.photoIds.map(id=>'<button type="button" class="iqc-rc-btn" data-review-photo="'+esc(id)+'">核對第 '+snapshot.find(p=>p.id===id)?.seq+' 張</button>').join('')+'</div></div>').join('')+'</section>':'';
    host.innerHTML=repeated+conflicts+(view.groups.map(g=>`<section class="iqc-group ${g.ready?'good':'warn'} ds-iqc-v8-group"><div class="iqc-group-title"><div><strong>${g.rt?'RT '+esc(g.rt):'待歸類'}</strong><div class="iqc-group-sub">來源照片：${g.photoSeqs.map(n=>'第 '+n+' 張').join('、')}<br>狀態 ${esc(g.status||'待填')}｜廠區 ${esc(g.plant||'待填')}</div></div><span class="iqc-rc-status ${g.ready?'good':'warn'}">${g.ctns.length}/${g.expected||'?'} ${g.ready?'數量吻合':'需複查'}</span></div>${!g.rt?'<p class="iqc-issue">照片未拍到 RT，請選「手動歸類」指定；所有候選 CTN 均保留。</p>':''}${g.warnings.map(w=>'<p class="iqc-issue bad">'+esc(w)+'</p>').join('')}<p class="iqc-rc-note">跨照片去重後 ${g.ctns.length} 支${g.overlapCount?`｜重疊 ${g.overlapCount} 筆已合併`:""}${g.expected?`｜${g.ctns.length<g.expected?"距參考總量少 "+(g.expected-g.ctns.length)+" 支":g.ctns.length>g.expected?"超過參考總量 "+(g.ctns.length-g.expected)+" 支":"與參考總量吻合"}`:"｜參考總量待確認"}</p>${g.collapsed?'<p class="iqc-rc-note">'+g.collapsed+' 個重複 CTN 已列在其他群組，此處不重列。</p>':''}${g.conflictCount?'<p class="iqc-issue bad">另有 '+g.conflictCount+' 個 CTN 歸屬衝突，請核對上方清單。</p>':''}<div class="iqc-ctn-grid">${g.displayCtns.map(ctn=>'<span class="iqc-ctn-input">'+esc(ctn)+'</span>').join('')}</div><p class="iqc-rc-note">${g.rows.some(r=>r.manual)?'含人工歸類｜':''}${g.rows.some(r=>r.legacy)?'保留前版人工核對｜':''}數量吻合仍需核對字元。</p>${g.rt&&groups.filter(x=>x.rt===g.rt).length>1?'<p class="iqc-issue">同一 RT 尚有其他群組：狀態／廠區不同或尚未確定。請核對後合併。</p><button type="button" class="iqc-rc-btn" data-merge-rt="'+esc(g.rt)+'">核對並合併相同 RT</button>':''}<div class="iqc-rc-row">${g.photoIds.map(id=>'<button type="button" class="iqc-rc-btn" data-review-photo="'+esc(id)+'">手動歸類：第 '+snapshot.find(p=>p.id===id)?.seq+' 張</button>').join('')}</div></section>`).join('')||'<div class="iqc-empty">尚無 CTN 候選。請先辨識照片；沒有 RT 也能在此手動歸類。</div>');
    const hint=$("iqcRcCommitHint");if(hint)hint.textContent="RC31.11：逐筆核對 RT／CTN／狀態／廠區／總量；本輪正式 IQC 寫入維持鎖定。";
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
    const p=snapshot.find(p=>p.id===photoId);if(!p)return;const candidates=groups.flatMap(g=>g.rows).filter(r=>r.photoId===p.id);
    $("iqc31ReviewEditor")?.remove();
    const editor=document.createElement('section');editor.id='iqc31ReviewEditor';editor.className='iqc-rc-card';editor.dataset.photoId=photoId;
    const same=candidates.length&&candidates.every(x=>x.rt===candidates[0].rt&&x.status===candidates[0].status&&x.plant===candidates[0].plant)?candidates[0]:{};
    editor.innerHTML=`<div class="iqc-rc-row iqc-rc-between"><strong>第 ${p.seq} 張｜手動歸類與核對</strong><button type="button" class="iqc-rc-btn" data-review-close>關閉</button></div><p class="iqc-rc-note">照片沒拍到 RT 也能指定到現有群組，或直接填入 RT。預設勾選整張；如有多個 RT，可分次勾選 CTN。人工設定只修改歸類，原照片與 OCR 文字保留。</p><div class="iqc-rc-field"><label for="iqc31TargetGroup">指定到現有 RT 群組（可選）</label><select id="iqc31TargetGroup"><option value="">自行填寫 RT 與資料</option>${groups.filter(g=>g.rt).map(g=>'<option value="'+esc(g.key)+'">RT '+esc(g.rt)+'｜'+esc(g.status||'狀態待填')+'｜'+esc(g.plant||'廠區待填')+'</option>').join('')}</select></div><div class="iqc-rc-grid" style="margin-top:10px">${[['rt','RT（必填）',same.rt||''],['status','鋼瓶狀態',same.status||''],['plant','廠區',same.plant||''],['expected','此 RT／狀態／廠區標籤總量（未知可留空）',same.expected||'']].map(([key,label,value])=>'<div class="iqc-rc-field"><label for="iqc31Review_'+key+'">'+label+'</label><input id="iqc31Review_'+key+'" value="'+esc(value)+'" '+(key==='rt'||key==='expected'?'inputmode="numeric"':'autocapitalize="characters"')+'></div>').join('')}</div><p>勾選本次要歸類的 CTN：</p><div class="iqc-rc-row"><button type="button" class="iqc-rc-btn" data-review-all="1">全選</button><button type="button" class="iqc-rc-btn" data-review-all="0">清除勾選</button></div><div class="rc31-review-candidates">${candidates.map(r=>'<label style="display:flex;gap:10px;align-items:center;margin:8px 0"><input type="checkbox" checked data-review-key="'+esc(r.original)+'"><input class="iqc-ctn-input" aria-label="核對 CTN" value="'+esc(r.ctn)+'" style="flex:1;min-width:0" autocapitalize="characters"><small>'+esc(r.manual?'人工':r.rt?'RT '+r.rt:'待歸類')+'</small></label>').join('')}</div><div class="iqc-rc-field"><label for="iqc31ManualCtns">漏讀的 CTN（可補登，每行一個；已列出的不必重填）</label><textarea id="iqc31ManualCtns" rows="3" autocapitalize="characters" placeholder="請對照原照片輸入完整 CTN" style="width:100%;box-sizing:border-box;font-size:16px"></textarea></div><details><summary>查看原始辨識文字</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc((p.rc31RawPasses||[]).map(r=>r.text).join("\n──\n")||p.ocrText||"尚無辨識文字")}</pre></details><p id="iqc31ReviewMessage" role="status"></p><div class="iqc-rc-row"><button class="iqc-rc-btn good" type="button" data-review-save>套用歸類</button><button class="iqc-rc-btn" type="button" data-review-clear>取消所選人工設定</button></div>`;
    if(p.rc31Quality?.unread?.length||p.rc31Quality?.uncertain?.length){
      const note=document.createElement('div');note.className='iqc-issue';note.setAttribute('role','status');note.dataset.characterWarnings='';
      const messages=[...(p.rc31Quality.unread||[]).map(r=>'疑似漏讀列：'+r.raw),...(p.rc31Quality.uncertain||[]).map(r=>'請核對 '+r.ctn+'（'+(r.reason==='CONFLICT'?'同一列另讀成 '+r.alternatives.filter(c=>c!==r.ctn).join('／'):r.reason==='AMBIGUOUS_END'?'尾碼 0／O、5／S 易混淆':'字元辨識信心偏低')+'）')];
      const title=document.createElement('strong');title.textContent='原始辨識的字元核對提醒';const list=document.createElement('ul');messages.forEach(message=>{const item=document.createElement('li');item.textContent=message;list.appendChild(item);});note.append(title,list);
      editor.firstElementChild.after(note);
      const preview=document.createElement('button');preview.type='button';preview.className='iqc-rc-btn';preview.dataset.previewPhoto=p.id;preview.textContent='查看原照片';note.after(preview);
    }
    $("iqcRcResultList").before(editor);editor.style.scrollMarginTop=(document.querySelector('#iqcImageRc .iqc-rc-top').offsetHeight+12)+'px';editor.scrollIntoView({block:'start'});
  }
  function showMerge(rt){
    if(controller().isBusy())return;const choices=groups.filter(g=>g.rt===rt);if(choices.length<2)return;
    $("iqc31ReviewEditor")?.remove();const editor=document.createElement('section');editor.id='iqc31ReviewEditor';editor.className='iqc-rc-card';editor.dataset.mergeRt=rt;
    const unique=key=>{const values=[...new Set(choices.map(g=>g[key]).filter(Boolean))];return values.length===1?values[0]:'';};
    editor.innerHTML=`<div class="iqc-rc-row iqc-rc-between"><strong>合併 RT ${esc(rt)}</strong><button type="button" class="iqc-rc-btn" data-review-close>關閉</button></div><p>勾選要合併的群組，再確認正確的狀態及廠區。相同 CTN 只計一次，來源照片和人工核對紀錄保留。</p>${choices.map(g=>'<label style="display:block;margin:12px 0"><input type="checkbox" data-merge-key="'+esc(g.key)+'"> 狀態 '+esc(g.status||'待填')+'｜廠區 '+esc(g.plant||'待填')+'｜'+g.ctns.length+' 支｜照片 '+g.photoSeqs.join('、')+'</label>').join('')}<div class="iqc-rc-grid">${[['status','合併後狀態'],['plant','合併後廠區'],['expected','合併後參考總量（未知留空）']].map(([key,label])=>'<div class="iqc-rc-field"><label>'+label+'</label><input data-merge-field="'+key+'" value="'+esc(key==='expected'?'':unique(key))+'" '+(key==='expected'?'inputmode="numeric"':'autocapitalize="characters"')+'></div>').join('')}</div><p class="iqc-rc-note">這是跨照片群組總量，不是單框的 16／18 支容量。若來源照片屬於不同狀態或廠區，請保留分組。</p><p id="iqc31ReviewMessage" role="status"></p><button type="button" class="iqc-rc-btn good" data-merge-save>確認資料並合併所選群組</button>`;
    $("iqcRcResultList").before(editor);editor.style.scrollMarginTop=(document.querySelector('#iqcImageRc .iqc-rc-top').offsetHeight+12)+'px';editor.scrollIntoView({block:'start'});
  }
  document.addEventListener('change',e=>{
    if(e.target.id!=='iqc31TargetGroup')return;const g=groups.find(g=>g.key===e.target.value);if(!g)return;
    ['rt','status','plant','expected'].forEach(key=>$("iqc31Review_"+key).value=g[key]||'');
  });
  document.addEventListener('click',async e=>{
    const button=e.target.closest?.('button');if(!button)return;
    if(button.dataset.mergeRt){showMerge(button.dataset.mergeRt);return;}
    if(button.hasAttribute('data-merge-save')){
      hideSaveNotice();
      const editor=$("iqc31ReviewEditor"),message=$("iqc31ReviewMessage"),keys=[...editor.querySelectorAll('[data-merge-key]:checked')].map(e=>e.dataset.mergeKey);
      const meta={rt:editor.dataset.mergeRt,...Object.fromEntries([...editor.querySelectorAll('[data-merge-field]')].map(e=>[e.dataset.mergeField,e.value]))};
      editor.querySelectorAll('button,input').forEach(e=>e.disabled=true);message.textContent='正在保存合併結果…';
      try{await controller().mergeReviews(keys,meta);editor.remove();$("iqcRcResultList").style.scrollMarginTop=(document.querySelector("#iqcImageRc .iqc-rc-top").offsetHeight+12)+"px";$("iqcRcResultList").scrollIntoView({block:'start'});showSaveNotice('歸類保存成功');}
      catch(error){message.textContent=error.message||'合併未完成，請重新核對。';}
      finally{editor.querySelectorAll('button,input').forEach(e=>e.disabled=false);}return;
    }
    if(button.dataset.reviewPhoto){showEditor(button.dataset.reviewPhoto);return;}
    if(button.dataset.reviewQuality){showEditor(button.dataset.reviewQuality);return;}
    if(button.hasAttribute('data-review-close')){$("iqc31ReviewEditor")?.remove();return;}
    if(button.dataset.reviewAll!==undefined){$("iqc31ReviewEditor").querySelectorAll('[data-review-key]').forEach(el=>el.checked=button.dataset.reviewAll==='1');return;}
    if(!button.hasAttribute('data-review-save')&&!button.hasAttribute('data-review-clear'))return;
    hideSaveNotice();
    const editor=$("iqc31ReviewEditor"),id=editor.dataset.photoId;
    const selection=[...editor.querySelectorAll('[data-review-key]:checked')].map(el=>({original:el.dataset.reviewKey,ctn:el.nextElementSibling.value}));
    if(button.hasAttribute('data-review-save')){const entered=$("iqc31ManualCtns").value.toUpperCase().split(/[\s,;，；]+/).filter(Boolean);selection.push(...entered.map(ctn=>({original:ctn,ctn,added:true})));}
    const meta=Object.fromEntries(['rt','status','plant','expected'].map(key=>[key,$("iqc31Review_"+key).value]));
    const message=$("iqc31ReviewMessage");editor.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);message.textContent='正在保存人工歸類…';
    try{await controller().saveReview(id,p=>model.updateReview(p,selection,meta,{clear:button.hasAttribute('data-review-clear')}));showEditor(id);$("iqc31ReviewMessage").textContent='已保存人工歸類。可關閉後查看群組，或繼續勾選其他 CTN。';showSaveNotice(button.hasAttribute('data-review-clear')?'所選人工設定已取消':'歸類保存成功');}
    catch(error){message.textContent=error.message||'保存失敗，請稍後重試。';}
    finally{editor.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);}
  });
  document.addEventListener('DOMContentLoaded',()=>{
    const style=document.createElement('style');style.textContent='#iqc31ReviewEditor{scroll-margin-top:70px}#iqc31ReviewEditor input[type=checkbox]{width:24px;height:24px;flex:none}#iqc31ReviewEditor input:not([type=checkbox]),#iqc31ReviewEditor select{font-size:16px;box-sizing:border-box}#iqc31ReviewMessage{color:#ffe4a3}';document.head.appendChild(style);
    style.textContent+='#iqc31SaveNotice{position:fixed;z-index:8;left:50%;top:50%;transform:translate(-50%,-50%);width:max-content;max-width:calc(100vw - 40px);box-sizing:border-box;padding:12px 18px;border:1px solid #60c998;border-radius:14px;background:#12392e;color:#d9ffeb;box-shadow:0 6px 24px #0006;font-size:15px;font-weight:700;line-height:1.5;text-align:center;pointer-events:none}#iqc31SaveNotice[hidden]{display:none}';
    const host=$("iqcRcPhotoList");if(host)new MutationObserver(photoButtons).observe(host,{childList:true});
  });
  window.__DS_IQC_META_GROUPING_V8={version:'RC31_REVIEW_S3',refresh,getModel:()=>groups};
  function allowLeave(){const editor=$("iqc31ReviewEditor");return !editor?.dataset.dirty||confirm("目前表單尚未按「套用歸類」。要離開這份未儲存的修改嗎？已保存的照片與歸類不會刪除。");}
  document.addEventListener('input',e=>{const editor=e.target.closest?.('#iqc31ReviewEditor');if(editor)editor.dataset.dirty='1';});
  document.addEventListener('change',e=>{const editor=e.target.closest?.('#iqc31ReviewEditor');if(editor)editor.dataset.dirty='1';});
  window.__DS_IQC_REVIEW31={refresh,showEditor,allowLeave,getModel:()=>groups};
})();
