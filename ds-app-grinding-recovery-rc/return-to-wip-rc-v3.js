"use strict";

(function installGrindingReturnToWipRcV4(){
  const VERSION="GRINDING_RETURN_TO_WIP_UI_RC_V4_20260820";
  const CFG=window.DS_GRINDING_RETURN_RC_CONFIG||{};

  function getFrame(){return document.querySelector("#moduleFrameHost iframe[data-module-key='grinding']");}

  function install(){
    const frame=getFrame();
    if(!frame)return false;
    let doc;
    try{doc=frame.contentDocument;}catch(_){return false;}
    if(!doc||!doc.body)return false;
    if(doc.getElementById("dsGrindingReturnV4Script"))return true;
    if(!doc.getElementById("historyList"))return false;

    const style=doc.createElement("style");
    style.id="dsGrindingReturnV4Style";
    style.textContent=`
      #dsReturnV4Card{padding:12px 13px;border-color:rgba(88,214,141,.28);background:linear-gradient(180deg,rgba(38,113,105,.16),rgba(32,42,114,.20))}
      #dsReturnV4Details{margin:0;border:0;background:transparent;overflow:visible}
      #dsReturnV4Details>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0;list-style:none;cursor:pointer}
      #dsReturnV4Details>summary::-webkit-details-marker{display:none}
      .ds-ret4-title{font-weight:900;font-size:15px}.ds-ret4-count{font-size:11px;color:var(--sub);font-weight:800;white-space:nowrap}
      .ds-ret4-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:11px}
      .ds-ret4-search{min-height:40px!important;padding:8px 10px!important;font-size:13px}
      .ds-ret4-filter{display:flex;gap:5px}.ds-ret4-filter button{min-height:40px;padding:7px 9px;border-radius:11px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.11);font-size:11px}.ds-ret4-filter button.active{background:rgba(117,103,255,.34);border-color:rgba(189,180,255,.44)}
      .ds-ret4-note{margin-top:8px;color:var(--soft);font-size:11px;line-height:1.45}
      #dsReturnV4List{display:grid;gap:6px;max-height:36vh;overflow:auto;margin-top:9px;padding-right:2px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
      .ds-ret4-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:center;padding:8px 9px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.085)}
      .ds-ret4-row.selected{border-color:rgba(67,198,232,.58);background:rgba(67,198,232,.08)}
      .ds-ret4-row.disabled-other{opacity:.42}
      .ds-ret4-row input{width:20px;height:20px;accent-color:#7767ff}
      .ds-ret4-name{font-size:13px;font-weight:900;overflow-wrap:anywhere}.ds-ret4-sub{margin-top:2px;color:var(--sub);font-size:10px;line-height:1.35}
      #dsReturnV4Status{display:none;margin-top:8px;padding:8px 9px;border-radius:11px;background:rgba(67,198,232,.08);border:1px solid rgba(67,198,232,.22);color:#d7f8ff;font-size:11px;line-height:1.45}
      #dsReturnV4Status.show{display:block}#dsReturnV4Status.bad{background:rgba(255,113,136,.08);border-color:rgba(255,113,136,.28);color:#ffd0d8}
      #dsReturnV4Sticky{position:fixed;left:50%;bottom:calc(10px + env(safe-area-inset-bottom));z-index:1200;width:min(740px,calc(100vw - 20px));transform:translateX(-50%);padding:9px;border-radius:17px;background:rgba(17,25,79,.97);border:1px solid rgba(88,214,141,.38);box-shadow:0 18px 48px rgba(2,7,34,.52);backdrop-filter:blur(16px);display:none}
      #dsReturnV4Sticky.show{display:block}.ds-ret4-sticky-info{font-size:11px;color:var(--sub);font-weight:800;margin-bottom:7px}.ds-ret4-sticky-actions{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px}
      .ds-ret4-cancel,.ds-ret4-submit{min-height:42px;border-radius:12px;font-size:12px;font-weight:900}.ds-ret4-cancel{padding:8px 11px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.13)}.ds-ret4-submit{background:linear-gradient(135deg,#39b978,#248750)}.ds-ret4-submit:disabled{opacity:.45}
      @media(max-width:620px){.ds-ret4-tools{grid-template-columns:1fr}.ds-ret4-filter{overflow-x:auto}.ds-ret4-filter button{flex:1 0 auto}}
    `;
    doc.head.appendChild(style);

    const script=doc.createElement("script");
    script.id="dsGrindingReturnV4Script";
    script.textContent=`
      (function(){
        if(window.__DS_GRINDING_RETURN_TO_WIP_RC_V4)return;
        const VERSION=${JSON.stringify(VERSION)};
        const RETURN_RC_API_URL=${JSON.stringify(String(CFG.API_URL||""))};
        const upper=v=>String(v||"").trim().toUpperCase();
        const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const configured=()=>/^https:\\/\\/script\\.google\\.com\\/macros\\/s\\/.+\\/exec$/.test(RETURN_RC_API_URL);
        const selected=new Map();
        let filter='ALL';
        let query='';
        let selectionLife='';
        let busy=false;

        async function parseRc(response){
          let text='';try{text=await response.text();}catch(_){const e=new Error('RC 回應讀取中斷');e.ambiguous=true;throw e;}
          if(!String(text||'').trim()){const e=new Error('RC 回應為空白');e.ambiguous=true;throw e;}
          let data;try{data=JSON.parse(text);}catch(_){const e=new Error('RC 回應不是有效 JSON');e.ambiguous=true;throw e;}
          if(!response.ok||!data||data.ok!==true){const e=new Error(data&&data.message||'RC API 失敗');e.definitive=true;e.code=data&&data.code||'RC_API_FAILED';throw e;}
          return data;
        }
        async function rcPost(api,payload){
          if(!configured())throw new Error('Return Backend RC 尚未部署／設定；目前不會修改資料。');
          const controller=typeof AbortController==='function'?new AbortController():null;const timer=controller?setTimeout(()=>controller.abort(),60000):0;
          try{return await parseRc(await fetch(RETURN_RC_API_URL,{method:'POST',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},payload,{api:api,token:BETA_API_TOKEN,client_version:BETA_CLIENT_VERSION})),signal:controller?controller.signal:undefined}));}
          catch(err){if(err&&err.name==='AbortError'){const e=new Error('RC 退回交易逾時，需確認 submission_id');e.ambiguous=true;throw e;}throw err;}
          finally{if(timer)clearTimeout(timer);}
        }
        async function rcStatus(id){
          const q=new URLSearchParams({api:'wip_submission_status',token:BETA_API_TOKEN,client_version:BETA_CLIENT_VERSION,submission_id:String(id||''),request_nonce:String(Date.now())});
          return parseRc(await fetch(RETURN_RC_API_URL+'?'+q.toString(),{method:'GET',cache:'no-store'}));
        }
        const allItems=()=>((state&&state.wip&&Array.isArray(state.wip.dispositions))?state.wip.dispositions:[]).filter(x=>['HT','DCYL'].includes(upper(x&&x.lifecycleStatus)));
        const itemKey=item=>String(item&&item.assetKey||'');
        const itemLabel=item=>upper(item&&item.trackingType)==='BUNDLE_LOT'?('集束來源 '+(item.sourceCtn||item.assetCtn||'-')):(item.assetCtn||item.sourceCtn||item.assetKey||'-');

        function ensureUi(){
          let card=document.getElementById('dsReturnV4Card');
          if(!card){
            const history=document.getElementById('historyList');const historyCard=history&&history.closest('.card');if(!historyCard||!historyCard.parentNode)return null;
            card=document.createElement('section');card.id='dsReturnV4Card';card.className='card';
            card.innerHTML='<details id="dsReturnV4Details"><summary><span class="ds-ret4-title">↩ HT／DCYL 返回 Grinding</span><span id="dsReturnV4Count" class="ds-ret4-count">0 項</span></summary><div class="ds-ret4-tools"><input id="dsReturnV4Search" class="input ds-ret4-search" autocomplete="off" autocapitalize="characters" placeholder="搜尋 CTN／RT"><div class="ds-ret4-filter"><button type="button" data-ret-filter="ALL" class="active">全部</button><button type="button" data-ret-filter="HT">HT</button><button type="button" data-ret-filter="DCYL">DCYL</button></div></div><div class="ds-ret4-note">管理功能｜原始紀錄保留。請只在確定帳面需要補償時使用。</div><div id="dsReturnV4Status"></div><div id="dsReturnV4List"></div></details>';
            historyCard.parentNode.insertBefore(card,historyCard);
          }
          let sticky=document.getElementById('dsReturnV4Sticky');
          if(!sticky){
            sticky=document.createElement('aside');sticky.id='dsReturnV4Sticky';
            sticky.innerHTML='<div id="dsReturnV4StickyInfo" class="ds-ret4-sticky-info"></div><div class="ds-ret4-sticky-actions"><button id="dsReturnV4Cancel" type="button" class="ds-ret4-cancel">取消選取</button><button id="dsReturnV4Submit" type="button" class="ds-ret4-submit">↩ 返回 Grinding</button></div>';
            document.body.appendChild(sticky);
          }
          return card;
        }
        function setStatus(text,bad){const el=document.getElementById('dsReturnV4Status');if(el){el.textContent=String(text||'');el.className=text?('show'+(bad?' bad':'')):'';}}
        function pruneSelection(){
          const current=new Map(allItems().map(item=>[itemKey(item),item]));
          Array.from(selected.keys()).forEach(key=>{if(!current.has(key))selected.delete(key);});
          if(!selected.size)selectionLife='';
        }
        function filteredItems(){
          const q=String(query||'').trim().toUpperCase();
          return allItems().filter(item=>{
            const life=upper(item.lifecycleStatus);if(filter!=='ALL'&&life!==filter)return false;
            if(!q)return true;
            const hay=[itemLabel(item),item.rt,item.assetKey,item.sourceCtn,item.assetCtn,life].join(' ').toUpperCase();
            return hay.includes(q);
          });
        }
        function updateSticky(){
          const sticky=document.getElementById('dsReturnV4Sticky');if(!sticky)return;
          const list=Array.from(selected.values());const qty=list.reduce((n,item)=>n+Number(item.qty||0),0);
          sticky.classList.toggle('show',list.length>0);
          const regular=document.getElementById('stickyActions');
          if(list.length&&regular)regular.classList.add('hidden');
          if(!list.length&&typeof renderSticky==='function')renderSticky();
          const info=document.getElementById('dsReturnV4StickyInfo');if(info)info.textContent=list.length?('已選 '+list.length+' 項｜'+qty+' 支｜來源 '+(selectionLife||'-')):'';
          const submit=document.getElementById('dsReturnV4Submit');if(submit){submit.disabled=busy||!configured();submit.textContent=configured()?'↩ 返回 Grinding':'↩ 返回 Grinding｜RC未連線';}
        }
        function render(){
          const card=ensureUi();if(!card)return;
          pruneSelection();
          const all=allItems();const list=filteredItems();
          const count=document.getElementById('dsReturnV4Count');if(count)count.textContent=all.length+' 項'+(selected.size?'｜已選 '+selected.size:'');
          const host=document.getElementById('dsReturnV4List');if(!host)return;
          host.innerHTML=list.length?list.map(item=>{
            const key=itemKey(item);const life=upper(item.lifecycleStatus);const checked=selected.has(key);const disabled=!!selectionLife&&selectionLife!==life;
            return '<label class="ds-ret4-row '+(checked?'selected ':'')+(disabled?'disabled-other':'')+'"><input type="checkbox" data-ret-key="'+escapeHtml(key)+'" '+(checked?'checked ':'')+(disabled?'disabled':'')+'><div><div class="ds-ret4-name">'+escapeHtml(itemLabel(item))+'</div><div class="ds-ret4-sub">'+escapeHtml(life)+'｜'+Number(item.qty||0)+' 支｜RT '+escapeHtml(item.rt||'-')+'</div></div></label>';
          }).join(''):'<div class="empty">沒有符合搜尋條件的 HT／DCYL 項目。</div>';
          if(!configured())setStatus('前端操作已完成；等待獨立 Apps Script Return Backend RC，現在不會改帳。',false);else if(!busy)setStatus('',false);
          updateSticky();
        }
        function clearSelection(){selected.clear();selectionLife='';render();}
        async function confirmUnknown(body){
          for(let i=0;i<4;i++){try{const s=await rcStatus(body.submission_id);if(s&&s.found){const st=String(s.status||'').toLowerCase();if(st==='completed')return s.result||s;if(st==='failed')throw new Error(s.message||'後端確認交易失敗');}}catch(err){if(err&&err.definitive)throw err;}if(i<3)await sleep(1500);}throw new Error('仍無法確認退回交易結果；submission_id 已保留，請勿重複操作。');
        }
        async function submitSelected(){
          if(busy||!selected.size)return;
          if(!configured()){setStatus('Return Backend RC 尚未設定，不會修改資料。',true);return;}
          const list=Array.from(selected.values());const life=selectionLife||upper(list[0]&&list[0].lifecycleStatus);
          if(!life||!list.every(item=>upper(item.lifecycleStatus)===life)){setStatus('同一次返回只能選 HT 或 DCYL 其中一種來源。',true);return;}
          const qty=list.reduce((n,item)=>n+Number(item.qty||0),0);const names=list.slice(0,8).map(item=>itemLabel(item)).join('、')+(list.length>8?'…':'');
          if(!confirm('第一次確認：將 '+list.length+' 項／'+qty+' 支從 '+life+' 返回 Grinding？\\n\\n'+names))return;
          if(!confirm('第二次確認：此操作會直接改變 Grinding／'+life+' 系統帳面，並新增不可刪除的補償交易。\\n\\n確定繼續？'))return;
          const reason=prompt('請輸入返回 Grinding 原因（必填）','帳面修正／現場確認返回 Grinding');if(reason===null)return;const note=String(reason||'').trim();if(!note){showToast('返回原因必填',true);return;}
          const body={submission_id:'GRDRET_'+Date.now()+'_'+Math.random().toString(36).slice(2,10).toUpperCase(),report_date:state.reportDate,operator:state.operator,base_revision:Number(state.revision||0),action:life==='DCYL'?'RETURN_FROM_DCYL':'RETURN_FROM_HT',items:list.map(item=>({asset_key:String(item.assetKey||''),qty:Number(item.qty||0),expected_version:Number(item.stateVersion||0)})),note:note};
          busy=true;render();setStatus('正在送出返回 Grinding 補償交易，請勿重複操作…',false);
          try{let result;try{result=await rcPost('grinding_return',body);}catch(err){if(err&&err.ambiguous){setStatus('回應不完整，正在用 submission_id 確認…',false);result=await confirmUnknown(body);}else throw err;}showToast(result&&result.message||'返回 Grinding 完成');selected.clear();selectionLife='';await refreshAll(false);setStatus(result&&result.message||'返回 Grinding 完成',false);}catch(err){setStatus(err&&err.message||'返回失敗',true);showToast(err&&err.message||'返回失敗',true);}finally{busy=false;render();}
        }

        const card=ensureUi();
        card.addEventListener('input',event=>{if(event.target&&event.target.id==='dsReturnV4Search'){query=event.target.value||'';render();}});
        card.addEventListener('click',event=>{const btn=event.target.closest&&event.target.closest('[data-ret-filter]');if(btn){filter=btn.dataset.retFilter||'ALL';card.querySelectorAll('[data-ret-filter]').forEach(x=>x.classList.toggle('active',x===btn));render();}});
        card.addEventListener('change',event=>{const box=event.target.closest&&event.target.closest('[data-ret-key]');if(!box)return;const key=box.dataset.retKey;const item=allItems().find(x=>itemKey(x)===key);if(!item)return;const life=upper(item.lifecycleStatus);if(box.checked){if(selectionLife&&selectionLife!==life){box.checked=false;showToast('同一次返回請只選 HT 或 DCYL 其中一種',true);return;}selectionLife=life;selected.set(key,item);if(state&&state.selected){state.selected={};state.selectedQty={};}}else{selected.delete(key);if(!selected.size)selectionLife='';}render();});
        document.getElementById('dsReturnV4Cancel').addEventListener('click',clearSelection);
        document.getElementById('dsReturnV4Submit').addEventListener('click',submitSelected);

        const oldHistory=renderHistory;renderHistory=function(){const r=oldHistory.apply(this,arguments);setTimeout(render,0);return r;};
        const oldBootstrap=applyBootstrap;applyBootstrap=function(){const r=oldBootstrap.apply(this,arguments);setTimeout(render,0);return r;};
        window.__DS_GRINDING_RETURN_TO_WIP_RC_V4={version:VERSION,render:render,backendConfigured:configured(),clearSelection:clearSelection};
        render();
      })();
    `;
    doc.body.appendChild(script);
    return true;
  }

  function schedule(){[200,650,1300,2300,3800].forEach(ms=>setTimeout(install,ms));}
  document.addEventListener("click",event=>{const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");if(nav)schedule();},true);
  setTimeout(schedule,3400);
  window.__DS_GRINDING_RETURN_RC_V4={version:VERSION,install};
})();
