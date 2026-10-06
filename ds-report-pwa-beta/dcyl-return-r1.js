/* Grinding DCYL R1: use the existing versioned, recoverable disposition transaction. */
(() => {
  const history = document.getElementById('historyList');
  const style = document.createElement('style');
  style.textContent = '[data-dcyl-key]{touch-action:pan-y;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;cursor:pointer}[data-dcyl-key]:focus-visible{outline:2px solid #5ce1e6;outline-offset:3px}#dcylReturnModal{align-items:center}#dcylReturnModal .modal-panel{max-width:520px}#dcylReturnModal textarea{width:100%;box-sizing:border-box;min-height:85px}#dcylReturnError:not(:empty){display:block}';
  document.head.appendChild(style);
  const modal = document.createElement('div');
  modal.id = 'dcylReturnModal';
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'dcylReturnTitle');
  modal.innerHTML = '<div class="modal-panel"><div id="dcylReturnTitle" class="modal-title">DCYL 返回 Grinding</div><div id="dcylReturnItem" class="asset-sub"></div><p>返回後列為「待研磨」，原 DCYL 紀錄保留。</p><div class="field"><label for="dcylReturnReason">返回原因</label><textarea id="dcylReturnReason" class="input" maxlength="500" placeholder="請填寫返回原因"></textarea></div><div id="dcylReturnError" class="modal-status" role="alert"></div><div class="modal-actions"><button id="dcylReturnCancel" class="btn ghost">取消</button><button id="dcylReturnConfirm" class="btn cyan">返回 Grinding</button></div></div>';
  document.body.appendChild(modal);
  const reason = document.getElementById('dcylReturnReason');
  const error = document.getElementById('dcylReturnError');
  const cancel = document.getElementById('dcylReturnCancel');
  let press = null, selection = null, originCard = null, scrollY = 0;
  const current = key => (state.wip?.dispositions || []).find(a => a.assetKey === key && a.lifecycleStatus === 'DCYL');
  const pending = () => [state.pendingCheckIn, state.pendingDisposition, state.pendingFrameEdit].some(p => p?.payload && p.status !== 'prepared' && p.status !== 'backend_failed');
  const busy = () => state.dispositionBusy || state.frameEditBusy;
  function cancelPress() {
    if (press) clearTimeout(press.timer);
    press = null;
  }
  function open(card) {
    cancelPress();
    if (!card?.isConnected || !ensureClientWriteAllowed() || selection) return;
    if (busy() || pending()) { showToast('前一筆操作尚在確認，請等待同步完成後再返回。', true); return; }
    const item = current(card.dataset.dcylKey);
    if (!item) return;
    selection = safeClone(item);
    originCard = card;
    scrollY = window.scrollY;
    document.getElementById('dcylReturnItem').textContent = `${item.assetCtn || item.sourceCtn}｜${Number(item.qty)} 支｜RT ${item.rt || '-'}`;
    reason.value = ''; error.textContent = '';
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    cancel.focus({preventScroll:true});
  }
  function close() {
    modal.classList.remove('show');
    selection = null;
    if (!document.querySelector('.modal.show')) document.body.classList.remove('modal-open');
    if (originCard?.isConnected) originCard.focus({preventScroll:true});
    window.scrollTo(0, scrollY);
  }
  history.addEventListener('pointerdown', e => {
    cancelPress();
    const card = e.target.closest('[data-dcyl-key]');
    if (!card || e.button !== 0 || !e.isPrimary) return;
    press = {id:e.pointerId, x:e.clientX, y:e.clientY, timer:setTimeout(() => open(card), 550)};
  });
  document.addEventListener('pointermove', e => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress();
  }, {passive:true});
  ['pointerup', 'pointercancel'].forEach(name => document.addEventListener(name, cancelPress, {passive:true}));
  document.addEventListener('scroll', cancelPress, {capture:true, passive:true});
  document.addEventListener('visibilitychange', cancelPress);
  window.addEventListener('blur', cancelPress);
  history.addEventListener('contextmenu', e => {
    const card = e.target.closest('[data-dcyl-key]');
    if (!card) return;
    e.preventDefault();
    if (e.pointerType === 'mouse' || e.button === 2) open(card);
  });
  history.addEventListener('keydown', e => {
    const card = e.target.closest('[data-dcyl-key]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(card); }
  });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const buttons = [reason, cancel, document.getElementById('dcylReturnConfirm')];
      const i = buttons.indexOf(document.activeElement);
      if (e.shiftKey && i === 0) { e.preventDefault(); buttons[2].focus(); }
      else if (!e.shiftKey && i === 2) { e.preventDefault(); reason.focus(); }
    }
  });
  cancel.addEventListener('click', close);
  document.getElementById('dcylReturnConfirm').addEventListener('click', async () => {
    if (!selection || busy()) return;
    const note = reason.value.trim();
    if (!note) { error.textContent = '請填寫返回原因。'; reason.focus(); return; }
    if (pending()) { error.textContent = '前一筆操作尚在確認，請等待同步完成。'; return; }
    const item = current(selection.assetKey);
    if (!item || Number(item.stateVersion) !== Number(selection.stateVersion) || Number(item.qty) !== Number(selection.qty)) {
      error.textContent = '此項目已更新，請關閉後重新整理。'; return;
    }
    const items = [{asset_key:item.assetKey, qty:Number(item.qty), expected_version:Number(item.stateVersion)}];
    close();
    await submitDisposition('RETURN_FROM_DCYL', {items, note});
  });
})();
