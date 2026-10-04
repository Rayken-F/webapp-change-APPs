'use strict';
(function(){
  if(window.__DS_RT_SCHEDULE_BOARD)return;
  const model=window.DS_RT_SCHEDULE_MODEL;
  const list=$('priorityList'),modal=$('rtNoteModal');
  let press=null,returnFocus=null;
  function cancelPress(){if(press)clearTimeout(press.timer);press=null;}
  function showNote(card){
    const item=state.priorities.find(x=>x.priorityId===card.dataset.priorityId);if(!item)return;
    cancelPress();returnFocus=card;
    $('rtNoteTitle').textContent='RT '+item.rtNo+' 備註';
    $('rtNoteContext').textContent=[item.plantCode,item.capacity,item.demandSource,item.status].filter(Boolean).join(' · ');
    $('rtNoteText').textContent=item.note||'這筆 RT 沒有進度備註。';
    modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
    $('closeRtNoteBtn').focus({preventScroll:true});
  }
  function closeNote(){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');returnFocus?.focus({preventScroll:true});returnFocus=null;}
  $('closeRtNoteBtn').addEventListener('click',closeNote);
  modal.addEventListener('click',e=>{if(e.target===modal)closeNote();});
  modal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeNote();}else if(e.key==='Tab'){e.preventDefault();$('closeRtNoteBtn').focus();}});
  list.addEventListener('pointerdown',e=>{
    cancelPress();if(e.isPrimary===false||e.button!==0||e.target.closest('button'))return;
    const card=e.target.closest('[data-priority-id]');if(!card)return;
    press={x:e.clientX,y:e.clientY,timer:setTimeout(()=>showNote(card),550)};
  });
  list.addEventListener('pointermove',e=>{if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)cancelPress();},{passive:true});
  ['pointerup','pointercancel','pointerleave'].forEach(type=>list.addEventListener(type,cancelPress));
  document.addEventListener('scroll',cancelPress,true);
  list.addEventListener('contextmenu',e=>{const card=e.target.closest('[data-priority-id]');if(card&&!e.target.closest('button'))e.preventDefault();});
  list.addEventListener('click',e=>{const btn=e.target.closest('[data-note-id]');if(btn)showNote(btn.closest('[data-priority-id]'));});
  list.addEventListener('keydown',e=>{const card=e.target.closest('[data-priority-id]');if(card&&e.target===card&&['Enter',' '].includes(e.key)){e.preventDefault();showNote(card);}});
  function number(value){return value==null||value===''||!Number.isFinite(Number(value))?'--':String(Number(value));}
  renderPriorities=function(){
    cancelPress();if(renderHomeLoadState())return;
    const rows=model.visible(state.priorities,state.filter),canEdit=permission('production_priority_edit_enabled');
    const source=state.rtSchedule;
    $('rtScheduleStatus').textContent=source?.sourceDate?'RT 排程：'+source.sourceDate+(source.syncMessage?' · '+source.syncMessage:''):'';
    if(!rows.length){list.innerHTML='<div class="empty-state">目前沒有符合條件的生產需求。</div>';return;}
    list.innerHTML=rows.map(item=>{
      const scheduled=item.source==='RT_SCHEDULE';
      const unit=scheduled?item.unit:(item.rtType==='BUNDLE'||/^\d+X/.test(item.capacity||'')?'框':'ea');
      return `<article class="priority-card" tabindex="0" aria-label="RT ${escapeHtml(item.rtNo)}，按 Enter 或長按查看備註" data-priority-id="${escapeHtml(item.priorityId)}" data-status="${escapeHtml(item.status)}">
        ${canEdit&&!item.readOnly?`<button class="edit-priority" data-edit-id="${escapeHtml(item.priorityId)}" type="button" aria-label="編輯 RT ${escapeHtml(item.rtNo)}">✎</button>`:''}
        <div class="priority-line1"><span>${escapeHtml(item.rtNo)}</span><span class="priority-divider">|</span><span>${escapeHtml(item.capacity||'規格待確認')}</span><span class="priority-divider">|</span><span class="ds-demand-source">${escapeHtml(item.demandSource)}</span><span class="priority-divider">|</span><span class="ds-plant">廠區：${escapeHtml(item.plantCode)}</span></div>
        <div class="priority-desc" title="${escapeHtml(item.description||'')}">${escapeHtml(item.description||'RT敘述待確認')}</div>
        <div class="priority-line3"><span class="ds-demand-metric">${scheduled?'未完成量':'需求量'}：${escapeHtml(item.demandQty)}${escapeHtml(unit||'（單位待確認）')}</span>
        ${scheduled?'':`<span class="priority-divider">|</span><span class="ds-process-metric">製程中：${number(item.processQty??item.inProcessQty??item.wipQty)}ea</span><span class="priority-divider">|</span><span class="ds-loaded-metric">裝框：${number(item.loadedQty??item.frameQty??item.readyQty)}ea</span>`}
        <span class="status-badge">${escapeHtml(item.status)}</span>${item.note?`<button class="rt-note-link" type="button" data-note-id="${escapeHtml(item.priorityId)}">備註</button>`:''}</div>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-edit-id]').forEach(btn=>btn.addEventListener('click',()=>openPriorityModal(btn.dataset.editId)));
  };
  window.__DS_RT_SCHEDULE_BOARD={version:'RT-SCHEDULE-P1-20261004'};
  renderPriorities();
})();
