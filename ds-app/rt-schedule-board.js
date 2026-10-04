'use strict';
(function(){
  if(window.__DS_RT_SCHEDULE_BOARD)return;
  const model=window.DS_RT_SCHEDULE_MODEL;
  const list=$('priorityList'),modal=$('rtNoteModal');
  let press=null,gesture=null,returnFocus=null,editing=null,saveTask=null,pending=null,conflict=false,epoch=0;
  function cancelPress(){if(press)clearTimeout(press.timer);press=null;}
  function applyNote(note){state.priorities.forEach(item=>{if(item.noteKey===note.noteKey)Object.assign(item,note);});}
  function author(item){$('rtNoteAuthor').textContent=item.noteUpdatedAt?[item.noteAuthor,item.noteUpdatedAt].filter(Boolean).join(' · '):'';}
  function resetNote(){
    epoch++;cancelPress();gesture=null;saveTask?.controller.abort();saveTask=null;pending=null;editing=null;returnFocus=null;conflict=false;
    $('rtNoteInput').value='';$('rtNoteStatus').textContent='';$('rtNoteAuthor').textContent='';
    modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');
  }
  function showNote(card){
    const item=state.priorities.find(x=>x.priorityId===card.dataset.priorityId);if(!item)return;
    cancelPress();gesture=null;returnFocus=card;editing={...item};conflict=false;pending=null;epoch++;
    const editable=permission('production_priority_edit_enabled')&&!!item.noteKey;
    $('rtNoteTitle').textContent='RT '+item.rtNo+' 鼎世備註';
    $('rtNoteContext').textContent=[item.plantCode,item.demandSource].filter(Boolean).join(' · ');
    $('rtNoteText').textContent=item.note||'尚無鼎世人員備註。';$('rtNoteText').classList.toggle('hidden',editable);
    $('rtNoteForm').classList.toggle('hidden',!editable);$('rtNoteInput').value=item.note||'';$('rtNoteInput').readOnly=false;
    $('rtNoteStatus').textContent='';$('saveRtNoteBtn').disabled=false;$('saveRtNoteBtn').textContent='儲存備註';
    $('reloadRtNoteBtn').classList.add('hidden');author(item);
    modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
    $('closeRtNoteBtn').focus({preventScroll:true});
  }
  function closeNote(){const target=returnFocus;resetNote();target?.focus({preventScroll:true});}
  $('closeRtNoteBtn').addEventListener('click',closeNote);
  modal.addEventListener('click',e=>{if(e.target===modal)closeNote();});
  modal.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();closeNote();}
    else if(e.key==='Tab'){
      const nodes=[...modal.querySelectorAll('button,textarea')].filter(n=>!n.disabled&&!n.closest('.hidden'));
      const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  $('reloadRtNoteBtn').addEventListener('click',()=>{
    const latest=state.priorities.find(x=>x.noteKey===editing?.noteKey);if(!latest)return;
    editing={...latest};$('rtNoteInput').value=latest.note||'';author(latest);pending=null;conflict=false;
    $('rtNoteStatus').textContent='已載入最新備註，可繼續編輯。';$('saveRtNoteBtn').disabled=false;$('reloadRtNoteBtn').classList.add('hidden');
  });
  $('rtNoteForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!editing||saveTask||conflict||!permission('production_priority_edit_enabled'))return;
    const text=$('rtNoteInput').value.trim();if(text.length>2000)return;
    if(pending&&pending.note!==text){$('rtNoteStatus').textContent='上次儲存尚未確認，請先重試原文字，或關閉後重新整理確認。';return;}
    pending=pending||{note_key:editing.noteKey,note_version:editing.noteVersion||0,note:text,request_id:crypto.randomUUID()};
    const task={controller:new AbortController(),token:getToken(),epoch:epoch};saveTask=task;
    const timer=setTimeout(()=>task.controller.abort(),30000);
    $('saveRtNoteBtn').disabled=true;$('rtNoteInput').readOnly=true;$('saveRtNoteBtn').textContent='儲存中…';$('rtNoteStatus').textContent='正在儲存鼎世備註…';
    try{
      const result=await portalPost('portal_rt_note_save',pending,{signal:task.controller.signal});
      if(task.epoch!==epoch||task.token!==getToken())return;
      applyNote(result.item);Object.assign(editing,result.item);pending=null;$('rtNoteInput').value=result.item.note;author(editing);renderPriorities();
      $('rtNoteStatus').textContent='備註已儲存。';
    }catch(err){
      if(task.epoch!==epoch||task.token!==getToken())return;
      if(err.code==='RT_NOTE_CONFLICT'&&err.item){
        applyNote(err.item);conflict=true;pending=null;$('reloadRtNoteBtn').classList.remove('hidden');
        $('rtNoteStatus').textContent='其他人已更新備註，你的文字尚未儲存。\n最新備註：'+(err.item.note||'（空白）')+'\n可先保留上方文字，再按「載入最新備註」重新編輯。';
      }else $('rtNoteStatus').textContent=(task.controller.signal.aborted?'儲存結果尚未確認，可按原文字重試。':err.message||'儲存失敗，可重試。');
    }finally{
      clearTimeout(timer);if(saveTask===task){saveTask=null;$('rtNoteInput').readOnly=!!pending;$('saveRtNoteBtn').disabled=conflict;$('saveRtNoteBtn').textContent='儲存備註';}
    }
  });
  const filters=$('statusFilters');
  function switchPlant(direction){
    const buttons=[...filters.querySelectorAll('[data-status]')],index=buttons.findIndex(b=>b.dataset.status===state.filter),next=buttons[index+direction];
    if(!next)return;
    const before=filters.getBoundingClientRect().top;next.click();
    next.scrollIntoView({block:'nearest',inline:'nearest'});
    if(before<=parseFloat(getComputedStyle(filters).top)+2){
      list.style.setProperty('scroll-margin-top',Math.ceil(parseFloat(getComputedStyle(filters).top)+filters.getBoundingClientRect().height+12)+'px');
      list.scrollIntoView({block:'start'});
    }
  }
  list.addEventListener('pointerdown',e=>{
    cancelPress();gesture=null;if(e.isPrimary===false||e.button!==0||e.target.closest('button,input,textarea,a'))return;
    if(e.pointerType==='touch')gesture={id:e.pointerId,x:e.clientX,y:e.clientY};
    const card=e.target.closest('[data-priority-id]');if(!card)return;
    press={x:e.clientX,y:e.clientY,timer:setTimeout(()=>showNote(card),550)};
  });
  list.addEventListener('pointermove',e=>{
    if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)cancelPress();
    if(gesture&&e.pointerId===gesture.id){const dx=Math.abs(e.clientX-gesture.x),dy=Math.abs(e.clientY-gesture.y);if(dy>12&&dy>dx)gesture=null;}
  },{passive:true});
  list.addEventListener('pointerup',e=>{
    const move=gesture;gesture=null;cancelPress();if(!move||e.pointerId!==move.id)return;
    const dx=e.clientX-move.x,dy=Math.abs(e.clientY-move.y);
    if(Math.abs(dx)>=60&&Math.abs(dx)>dy*1.5)switchPlant(dx<0?1:-1);
  });
  ['pointercancel','pointerleave'].forEach(type=>list.addEventListener(type,()=>{cancelPress();gesture=null;}));
  document.addEventListener('scroll',()=>{cancelPress();gesture=null;},true);
  list.addEventListener('contextmenu',e=>{const card=e.target.closest('[data-priority-id]');if(card&&!e.target.closest('button'))e.preventDefault();});
  list.addEventListener('click',e=>{const btn=e.target.closest('[data-note-id]');if(btn)showNote(btn.closest('[data-priority-id]'));});
  list.addEventListener('keydown',e=>{const card=e.target.closest('[data-priority-id]');if(card&&e.target===card&&['Enter',' '].includes(e.key)){e.preventDefault();showNote(card);}});
  function number(value){return (typeof value!=='number'&&typeof value!=='string')||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0?'--':String(Number(value));}
  renderPriorities=function(){
    cancelPress();if(renderHomeLoadState())return;
    const rows=model.visible(state.priorities,state.filter),canEdit=permission('production_priority_edit_enabled');
    const source=state.rtSchedule;
    $('rtScheduleStatus').textContent=source?.sourceDate?'RT 排程：'+source.sourceDate+(source.syncMessage?' · '+source.syncMessage:''):'';
    if(!rows.length){list.innerHTML='<div class="empty-state">目前沒有符合條件的生產需求。</div>';return;}
    list.innerHTML=rows.map(item=>{
      const scheduled=item.source==='RT_SCHEDULE';
      const unit=scheduled?item.unit:(item.rtType==='BUNDLE'||/^\d+X/.test(item.capacity||'')?'框':'ea');
      return `<article class="priority-card${scheduled?' rt-schedule-card':''}" tabindex="0" aria-label="RT ${escapeHtml(item.rtNo)}，按 Enter 或長按查看備註" data-priority-id="${escapeHtml(item.priorityId)}" data-status="${escapeHtml(item.status)}">
        ${canEdit&&!item.readOnly?`<button class="edit-priority" data-edit-id="${escapeHtml(item.priorityId)}" type="button" aria-label="編輯 RT ${escapeHtml(item.rtNo)}">✎</button>`:''}
        <div class="priority-line1"><span>${escapeHtml(item.rtNo)}</span><span class="priority-divider">|</span><span class="rt-capacity${model.size(item)[0]===0?' rt-capacity-bundle':''}">${escapeHtml(item.capacity||'規格待確認')}</span><span class="priority-divider">|</span><span class="ds-demand-source" title="${escapeHtml(item.demandSource)}">${escapeHtml(item.demandSource)}</span><span class="priority-divider">|</span><span class="ds-plant">廠區：${escapeHtml(item.plantCode)}</span></div>
        <div class="priority-desc" title="${escapeHtml(item.description||'')}">${escapeHtml(item.description||'RT敘述待確認')}</div>
        <div class="priority-line3"><span class="ds-demand-metric">需求量：${number(item.demandQty)}${escapeHtml(unit||'（單位待確認）')}</span>
        <span class="priority-divider">|</span><span class="ds-process-metric">製程中：${number(item.processQty??item.inProcessQty??item.wipQty)}ea</span><span class="priority-divider">|</span><span class="ds-loaded-metric">裝框：${number(item.loadedQty??item.frameQty??item.readyQty)}ea</span>
        <span class="status-badge">${escapeHtml(item.status)}</span>${item.note?`<button class="rt-note-link" type="button" data-note-id="${escapeHtml(item.priorityId)}">備註</button>`:''}</div>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-edit-id]').forEach(btn=>btn.addEventListener('click',()=>openPriorityModal(btn.dataset.editId)));
  };
  const topbar=document.querySelector('#appShell .topbar');
  function measureTop(){if(topbar){const h=topbar.getBoundingClientRect().height;if(h>0)filters.style.setProperty('--rt-board-top',Math.ceil(h)+'px');}}
  if(topbar&&typeof ResizeObserver==='function')new ResizeObserver(measureTop).observe(topbar);
  window.addEventListener('resize',measureTop);measureTop();
  window.__DS_RT_SCHEDULE_BOARD={version:'RT-SCHEDULE-P2.1-20261004',reset:resetNote};
  renderPriorities();
})();
