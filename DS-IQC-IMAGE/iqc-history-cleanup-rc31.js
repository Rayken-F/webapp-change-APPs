if(window.IqcProduction?.allowed){
/* RC31.17: opt-in, device/account-local cleanup of receipted image assets only. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),ctl=()=>window.__DS_IQC_RC31;
  const week=7*24*60*60*1000,prefix=window.IqcProduction.key("ds_iqc_history_photo_cleanup_v1:");
  let running=false,history=false,retryAt=0,checkTimer=null,lastAccount='',notice='';
  function account(){const c=window.DS_PORTAL_BRIDGE?.getSessionContext?.();return c?.token&&c.profile?.permissions?.iqc_image_enabled===true?c.profile.user?.account||'':'';}
  const key=a=>prefix+encodeURIComponent(a);
  function settings(a){const raw=JSON.parse(localStorage.getItem(key(a))||'{}');return {enabled:raw.enabled===true,nextAt:Number(raw.nextAt)||0,lastResult:String(raw.lastResult||'')};}
  function save(a,value){localStorage.setItem(key(a),JSON.stringify(value));}
  function shown(){const p=$('iqcImageRc');return !!p&&!p.classList.contains('hidden')&&document.visibilityState==='visible';}
  function idle(){return !running&&!ctl().isBusy()&&!$('iqc31ReviewEditor')&&!$('iqc31SubmitPreview')&&!$('iqc31PhotoPreview');}
  function install(){
    if($('iqc31CleanupOptions')||!$('iqc31BatchActions'))return;
    const button=document.createElement('button');button.id='iqc31ClearAllHistoryPhotos';button.type='button';button.className='iqc-rc-btn danger';button.textContent='清除所有歷史照片';$('iqc31BatchActions').append(button);
    const option=document.createElement('label');option.id='iqc31WeeklyCleanupOption';
    option.innerHTML='<input id="iqc31WeeklyCleanup" type="checkbox" style="appearance:auto;width:22px;height:22px;min-height:0;flex:none"><span>每週自動清理歷史照片</span>';$('iqc31BatchActions').append(option);
    const box=document.createElement('div');box.id='iqc31CleanupOptions';
    box.innerHTML='<p id="iqc31CleanupSchedule" class="iqc-rc-note"></p><p id="iqc31CleanupResult" class="iqc-rc-note" role="status" aria-live="polite"></p>';
    $('iqc31BatchActions').after(box);
    const style=document.createElement('style');style.textContent='#iqc31BatchControls [hidden]{display:none!important}#iqc31CleanupResult{overflow-wrap:anywhere;color:#ffe4a3}#iqc31BatchActions.iqc31-history-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:stretch}#iqc31BatchActions.iqc31-history-actions>.iqc-rc-btn{min-width:0;padding:8px 5px;min-height:48px;font-size:clamp(11px,3.2vw,14px)}#iqc31WeeklyCleanupOption{display:flex;gap:6px;align-items:center;min-width:0;font-size:clamp(11px,3.2vw,14px);line-height:1.4}#iqc31CleanupOptions>p:empty{display:none}';document.head.append(style);
  }
  function render(asHistory=history,busy=ctl().isBusy()){
    history=asHistory;install();if(!$('iqc31CleanupOptions'))return;
    const a=account();if(lastAccount!==a){lastAccount=a;notice='';retryAt=0;}
    $('iqc31ClearAllHistoryPhotos').hidden=!history;$('iqc31WeeklyCleanupOption').hidden=!history;$('iqc31CleanupOptions').hidden=!history;
    $('iqc31BatchActions').classList.toggle('iqc31-history-actions',history);
    $('iqc31ClearAllHistoryPhotos').disabled=busy||running||!a;
    $('iqc31WeeklyCleanup').disabled=busy||running||!a;
    try{const p=a?settings(a):{enabled:false};$('iqc31WeeklyCleanup').checked=p.enabled;
      const schedule=!a?'請先登入工作台。':p.enabled?'已啟用｜下次清理：'+new Date(p.nextAt).toLocaleString('zh-TW',{hour12:false})+'（到期後開啟此頁執行）':'';
      if($('iqc31CleanupSchedule').textContent!==schedule)$('iqc31CleanupSchedule').textContent=schedule;
      $('iqc31CleanupSchedule').hidden=!schedule;
      const message=notice||p.lastResult||'';if($('iqc31CleanupResult').textContent!==message)$('iqc31CleanupResult').textContent=message;
      if(p.enabled&&p.nextAt<=Date.now()&&Date.now()>=retryAt&&shown()&&idle()&&!checkTimer)checkTimer=setTimeout(()=>{checkTimer=null;check();},0);
    }catch(_){$('iqc31WeeklyCleanup').checked=false;$('iqc31CleanupSchedule').hidden=false;$('iqc31CleanupSchedule').textContent='本機清理設定讀取失敗，未啟動自動清理。';}
  }
  function progress(value){notice=value;ctl().submissionStatus(value.split('。')[0]);render();}
  function valid(s,a){const r=s.submissions.find(r=>r.status==='SYNCED'),m=window.IqcSubmitModel31;
    return s.batch?.status==='SYNCED'&&r?.account===a&&m.receipt({ok:true,protocol:m.protocol,environment:m.environment,receipt:r.receipt},r);
  }
  async function clean(automatic){
    if(!shown()||!idle())return;
    const a=account();if(!a)return;
    if(!automatic&&!confirm('清除此裝置、目前帳號「所有歷史批次」的原照片與縮圖？包含其他歷史頁，清除後無法還原照片。\nCTN、歸類、收據及尚未入帳的照片保留。'))return;
    running=true;let count=0,bytes=0,skipped=0,completed=0,total=0,problem='';render();
    try{
      await ctl().submissionOperation(async()=>{
        // Recheck after obtaining the cross-tab OCR/edit/submission lock.
        if(account()!==a)throw Error('登入帳號已變更，已停止清理。');
        if(automatic){const p=settings(a);if(!p.enabled||p.nextAt>Date.now())return;}
        const targets=(await ctl().listBatches()).filter(b=>b.status==='SYNCED'&&!b.photosClearedAt);total=targets.length;
        progress(`正在清理歷史照片｜0／${total} 批`);
        for(const b of targets){
          if(!shown()||account()!==a)throw Error('頁面已離開或帳號已變更，剩餘照片保留。');
          if(automatic&&!settings(a).enabled)throw Error('自動清理已關閉，剩餘照片保留。');
          const snapshot=await IqcSubmitStore31.snapshot(b.id);
          if(!valid(snapshot,a)){skipped++;continue;}
          // Each batch is atomic. Report only deletions that actually committed.
          const r=await IqcSubmitStore31.clearPhotos(b.id,a);count+=r.count;bytes+=r.bytes;completed++;
          progress(`正在清理歷史照片｜${completed+skipped}／${total} 批｜已清除 ${count} 張`);
        }
        const result=`${automatic?'每週清理完成':'歷史照片清理完成'}：已清除 ${count} 張照片，釋放約 ${(bytes/1048576).toFixed(2)} MB。文字資料與收據保留。${skipped?'另有 '+skipped+' 批非目前帳號或收據未通過核對，照片保留。':''}`;
        const p=settings(a),nextAt=p.nextAt+Math.max(1,Math.floor((Date.now()-p.nextAt)/week)+1)*week;
        save(a,{...p,...(automatic&&p.enabled?{nextAt}:{}),lastResult:new Date().toLocaleString('zh-TW',{hour12:false})+'｜'+result});progress(result);
      });
    }catch(e){problem=e.code==='OTHER_TAB_BUSY'?'另一分頁正在處理資料，稍後再試。':e.message||'本機清理未完成。';
      progress(`清理未全部完成：已清除 ${count} 張照片，釋放約 ${(bytes/1048576).toFixed(2)} MB；其餘保留。${problem}`);
      try{const p=settings(a);save(a,{...p,lastResult:notice});}catch(_){}
    }finally{
      retryAt=Date.now()+(problem?60000:1000);
      await ctl().refresh().catch(()=>{});await window.__DS_IQC_BATCHES31?.reload().catch(()=>{});
      running=false;render();
    }
    return {count,bytes,skipped,completed,total,problem};
  }
  async function check(){if(!shown()||!idle()||Date.now()<retryAt)return;const a=account();if(!a)return;
    try{const p=settings(a);if(p.enabled&&p.nextAt<=Date.now())await clean(true);}catch(_){retryAt=Date.now()+60000;}
  }
  document.addEventListener('click',e=>{if(e.target.closest?.('#iqc31ClearAllHistoryPhotos'))clean(false);});
  document.addEventListener('change',e=>{if(e.target.id!=='iqc31WeeklyCleanup')return;const a=account();if(!a||!idle()){render();return;}
    try{const p=settings(a),enabled=e.target.checked;save(a,{...p,enabled,nextAt:enabled?Date.now()+week:0});notice=enabled?'每週清理已啟用；設定僅適用此裝置與目前帳號。':'每週清理已關閉。';retryAt=0;}
    catch(_){notice='設定未保存，請確認瀏覽器允許本機儲存後重試。';}render();
  });
  addEventListener('storage',e=>{if(e.key?.startsWith(prefix))render();});
  document.addEventListener('visibilitychange',()=>{if(shown())render();});
  setInterval(()=>{if(shown())render();},30000);
  window.__DS_IQC_CLEANUP31={render,check};
})();

}
