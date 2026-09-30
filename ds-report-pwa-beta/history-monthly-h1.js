/* Grinding H1: read-only monthly counts, separate from the paged history list. */
function grindingMonthRange(value){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw Error('請選擇月份');
  const last=new Date(Date.UTC(Number(value.slice(0,4)),Number(value.slice(5)),0)).getUTCDate();
  return {start:value+'-01',end:value+'-'+last};
}
function changeHistoryMonth(delta){
  const el=document.getElementById('historyMonth'),value=el.value||localYmd().slice(0,7);
  const date=new Date(Date.UTC(Number(value.slice(0,4)),Number(value.slice(5))-1+delta,1));
  el.value=date.toISOString().slice(0,7);return loadHistoryMonth();
}
async function loadHistoryMonth(){
  const month=document.getElementById('historyMonth').value,box=document.getElementById('historyMonthly');
  const requestId=state.monthRequestId=(state.monthRequestId||0)+1;
  let range;try{range=grindingMonthRange(month);}catch(e){box.textContent=e.message;return;}
  state.historyDays=0;
  document.querySelectorAll('[data-history-days]').forEach(b=>b.classList.remove('active'));
  document.getElementById('historyStartDate').value=range.start;
  document.getElementById('historyEndDate').value=range.end;
  updateHistoryDateDisplays();loadHistory(true);
  box.innerHTML='<div class="empty">正在統計 '+escapeHtml(month)+' 全月紀錄…</div>';
  try{
    const result=await betaGetApi('wip_monthly',{month});
    if(requestId!==state.monthRequestId)return;
    if(result.ok===false||result.month!==month||!Array.isArray(result.daily)||!result.totals)throw Error(result.message||'每日數量回應不完整，請重試');
    const qty=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('zh-TW'):'—';
    box.innerHTML='<div class="history-month-totals"><strong>進站 '+qty(result.totals.checkInQty)+' 支</strong><strong>出站 '+qty(result.totals.releasedQty)+' 支／'+qty(result.totals.releasedFrames)+' 框</strong></div><div class="history-month-scroll"><table><thead><tr><th>日期</th><th>進站（支）</th><th>出站（支）</th><th>出站（框）</th></tr></thead><tbody>'+result.daily.map(row=>'<tr><td><button type="button" class="history-day" data-history-date="'+escapeHtml(row.date)+'">'+escapeHtml(row.date.slice(5))+'</button></td><td>'+qty(row.checkInQty)+'</td><td>'+qty(row.releasedQty)+'</td><td>'+qty(row.releasedFrames)+'</td></tr>').join('')+'</tbody></table></div><p class="muted">依操作日期統計全月；出站以「送往噴砂」完成為準，入框待送不計。點日期可查看當天明細。</p><div class="muted">更新：'+escapeHtml(result.serverTime||'')+'</div>';
  }catch(e){if(requestId===state.monthRequestId)box.innerHTML='<div class="error-box">'+escapeHtml(e.message||'每日數量讀取失敗')+'</div>';}
}
document.addEventListener('click',function(e){
  const button=e.target.closest?.('[data-history-date]');if(!button)return;
  document.getElementById('historyStartDate').value=button.dataset.historyDate;
  document.getElementById('historyEndDate').value=button.dataset.historyDate;
  document.getElementById('historyType').value='ALL';
  document.getElementById('historyQuery').value='';document.getElementById('historyOperator').value='';
  updateHistoryDateDisplays();loadHistory(true);
  document.getElementById('historyDetailsHeading').scrollIntoView({block:'start'});
});
