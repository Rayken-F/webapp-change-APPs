/* RC31: stable cards use 160px thumbnails; full images stay in IndexedDB. */
(function(){
  "use strict";
  const controller=window.__DS_IQC_RC31,cards=new Map();let previewUrl="",previewGeneration=0,releasePreview=()=>{},previewTrigger=null,previewPanel=null;
  const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function closePreview(restoreFocus=true){const panel=previewPanel,trigger=previewTrigger;previewPanel=null;previewTrigger=null;previewGeneration++;releasePreview();releasePreview=()=>{};panel?.remove();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl="";if(panel)controller.previewEvent?.('closed');if(restoreFocus&&trigger?.isConnected)trigger.focus({preventScroll:true});}
  function zoomViewer(panel,img){
    const viewport=document.createElement('div'),surface=document.createElement('div'),controls=document.createElement('div');
    viewport.className='iqc31-photo-viewport';viewport.style.cssText='width:100%;overflow:auto;overscroll-behavior:contain;min-width:0;position:relative';
    surface.style.cssText='position:relative;margin:auto';surface.append(img);viewport.append(surface);
    img.draggable=false;img.style.cssText='display:block;width:100%;height:100%;max-width:none;max-height:none;user-select:none;pointer-events:none';
    controls.style.cssText='display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;width:100%;touch-action:manipulation';
    controls.innerHTML='<button type="button" class="iqc-rc-btn" data-preview-zoom="-1" aria-label="縮小照片" style="min-width:44px;min-height:48px">−</button><output aria-live="polite" style="min-width:3.5em;text-align:center">100%</output><button type="button" class="iqc-rc-btn" data-preview-zoom="1" aria-label="放大照片" style="min-width:44px;min-height:48px">＋</button>';
    const close=panel.querySelector('[data-preview-close]');controls.prepend(close);panel.querySelector('p').replaceWith(viewport);viewport.after(controls);
    let zoom=1,baseWidth=0,baseHeight=0,drag=null;
    const paint=()=>{surface.style.width=baseWidth*zoom+'px';surface.style.height=baseHeight*zoom+'px';viewport.style.height=baseHeight+'px';viewport.style.touchAction=zoom>1?'none':'pan-y';viewport.style.cursor=zoom>1?'grab':'auto';viewport.dataset.zoom=String(zoom);controls.querySelector('output').textContent=Math.round(zoom*100)+'%';controls.querySelector('[data-preview-zoom="-1"]').disabled=zoom===1;controls.querySelector('[data-preview-zoom="1"]').disabled=zoom===4;};
    const fit=()=>{const width=viewport.clientWidth;if(!width)return;const scale=Math.min(width/img.naturalWidth,innerHeight*.65/img.naturalHeight);const w=img.naturalWidth*scale,h=img.naturalHeight*scale;if(w===baseWidth&&h===baseHeight)return;baseWidth=w;baseHeight=h;paint();};
    let tap=null,lastTap=null;
    const change=b=>{if(!b||b.disabled)return;const old=zoom,x=(viewport.scrollLeft+viewport.clientWidth/2)/(baseWidth*old),y=(viewport.scrollTop+baseHeight/2)/(baseHeight*old);zoom=Math.max(1,Math.min(4,zoom+Number(b.dataset.previewZoom)*.5));paint();viewport.scrollLeft=x*baseWidth*zoom-viewport.clientWidth/2;viewport.scrollTop=y*baseHeight*zoom-baseHeight/2;};
    const click=e=>{const b=e.target.closest('[data-preview-zoom]');if(lastTap?.button===b&&Date.now()-lastTap.at<700&&e.detail)return;change(b);};
    const touchStart=e=>{const b=e.target.closest('[data-preview-zoom]');tap=b&&!b.disabled&&e.touches.length===1?{button:b,x:e.touches[0].clientX,y:e.touches[0].clientY}:null;};
    const touchMove=e=>{if(tap&&(e.touches.length!==1||Math.hypot(e.touches[0].clientX-tap.x,e.touches[0].clientY-tap.y)>12))tap=null;};
    const touchEnd=e=>{if(!tap)return;const t=tap;tap=null;if(e.cancelable)e.preventDefault();lastTap={button:t.button,at:Date.now()};change(t.button);};
    const down=e=>{if(zoom===1||e.isPrimary===false||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);};
    const move=e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();viewport.scrollLeft=drag.left+drag.x-e.clientX;viewport.scrollTop=drag.top+drag.y-e.clientY;};
    const up=e=>{if(drag?.id===e.pointerId){drag=null;if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);}};
    controls.addEventListener('click',click);controls.addEventListener('touchstart',touchStart,{passive:true});controls.addEventListener('touchmove',touchMove,{passive:true});controls.addEventListener('touchend',touchEnd,{passive:false});controls.addEventListener('touchcancel',()=>{tap=null;});viewport.addEventListener('pointerdown',down);viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',up);viewport.addEventListener('pointercancel',up);viewport.addEventListener('lostpointercapture',up);
    const observer=new ResizeObserver(fit);observer.observe(viewport);addEventListener('resize',fit);fit();
    return ()=>{observer.disconnect();removeEventListener('resize',fit);drag=null;tap=null;};
  }
  async function preview(id,trigger){
    closePreview(false);const generation=previewGeneration,started=Date.now();previewTrigger=trigger;
    controller.previewEvent?.('requested');
    // Stay in the same scrolling panel as the editor. No full-page overlay,
    // forced focus or visualViewport geometry while iOS dismisses its keyboard.
    const panel=document.createElement('section');previewPanel=panel;panel.id='iqc31PhotoPreview';panel.dataset.photoId=id;panel.setAttribute('role','region');panel.setAttribute('aria-label','照片檢視');
    panel.innerHTML='<div class="iqc31-preview-content" style="display:flex;flex-direction:column;align-items:center;gap:12px;max-width:100%;min-height:0"><p role="status">正在讀取本機照片…</p><button type="button" class="iqc-rc-btn" data-preview-close style="flex:none;min-height:48px">關閉照片</button></div>';
    panel.style.cssText='display:block;grid-column:1 / -1;min-width:0;max-width:100%;margin:12px 0;padding:12px;box-sizing:border-box;border:1px solid #52638c;border-radius:14px;background:#08112f;color:white';
    (trigger.closest('.iqc-photo')||trigger).after(panel);
    let deadline=0,settled=false,abandonImage=()=>{},releaseZoom=()=>{};
    const observer=new MutationObserver(()=>{if(!panel.isConnected)closePreview(false);});
    observer.observe(document.getElementById('iqcImageRc'),{childList:true,subtree:true});
    releasePreview=()=>{clearTimeout(deadline);abandonImage();releaseZoom();observer.disconnect();};
    const current=()=>generation===previewGeneration&&panel.isConnected&&!settled;
    const failed=code=>{if(!current())return;settled=true;clearTimeout(deadline);abandonImage();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl="";panel.querySelector('p').textContent=code==='PHOTO_PREVIEW_TIMEOUT'?'照片讀取逾時，請關閉後重試；已保存的更正仍保留。':'照片無法顯示，請關閉後重試；已保存的更正仍保留。';controller.previewEvent?.('failed',code,Date.now()-started);};
    controller.previewEvent?.('opened');deadline=setTimeout(()=>failed('PHOTO_PREVIEW_TIMEOUT'),15000);
    try{
      if(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))document.activeElement.blur();
      // Yield before reading/decoding so the status and close button can paint.
      await new Promise(resolve=>setTimeout(resolve,0));if(!current())return;
      controller.previewEvent?.('reading',undefined,Date.now()-started);
      const p=await controller.readPhoto(id);if(!current())return;if(!p?.blob?.size)throw Error();
      controller.previewEvent?.('read',undefined,Date.now()-started);
      previewUrl=URL.createObjectURL(p.blob);const img=document.createElement('img');img.alt='第 '+p.seq+' 張原照片';img.decoding='async';img.style.cssText='display:block;width:auto;height:auto;max-width:100%;max-height:65vh;max-height:65svh;object-fit:contain;min-height:0;flex:0 1 auto';
      const loaded=new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;abandonImage=()=>{img.removeAttribute('src');reject(Error());};});img.src=previewUrl;
      try{await loaded;}catch(_){failed('PHOTO_PREVIEW_DECODE');return;}finally{img.onload=null;img.onerror=null;abandonImage=()=>{};}
      if(!current())return;settled=true;clearTimeout(deadline);releaseZoom=zoomViewer(panel,img);controller.previewEvent?.('ready',undefined,Date.now()-started);
    }catch(_){failed('PHOTO_PREVIEW_READ');}
  }
  controller.renderPhotoCards=function(list){
    const host=document.getElementById('iqcRcPhotoList');if(!host)return;
    const ids=new Set(list.map(p=>p.id));
    for(const [id,card] of cards){if(!ids.has(id)){card.element.remove();if(card.url)URL.revokeObjectURL(card.url);cards.delete(id);}}
    host.querySelector('.iqc-empty')?.remove();
    if(!list.length){host.innerHTML='<div class="iqc-empty">尚未加入照片</div>';return;}
    for(const p of list){
      let card=cards.get(p.id);
      if(!card){const element=document.createElement('div');element.className='iqc-photo';element.dataset.photoId=p.id;
        element.innerHTML='<button class="iqc-rc-btn" style="padding:0;overflow:hidden" type="button" data-preview-photo="'+escape(p.id)+'" aria-label="查看第 '+p.seq+' 張照片"><span style="display:block;font-size:11px;padding:8px">查看照片</span></button><div class="meta"><strong></strong><small class="rc31-photo-meta"></small></div><button class="iqc-photo-del" type="button" data-photo-delete="'+escape(p.id)+'" aria-label="移除第 '+p.seq+' 張照片">×</button>';
        host.appendChild(element);card={element,url:""};cards.set(p.id,card);
      }
      if(p.photosClearedAt){if(card.url)URL.revokeObjectURL(card.url);card.url="";const button=card.element.querySelector("[data-preview-photo]");button.disabled=true;button.textContent="照片已清除";}
      if(!card.url&&p.thumbnail?.size){card.url=URL.createObjectURL(p.thumbnail);const image=document.createElement('img');image.alt='photo '+p.seq;image.decoding='async';image.src=card.url;card.element.querySelector('[data-preview-photo]').replaceChildren(image);}
      const title='第 '+p.seq+' 張｜'+p.name,meta=p.photosClearedAt?'已入帳照片已清除；辨識文字保留':Math.round((p.size||0)/1024)+' KB｜原照片已存本機';
      if(card.element.querySelector('strong').textContent!==title)card.element.querySelector('strong').textContent=title;
      if(card.element.querySelector('.rc31-photo-meta').textContent!==meta)card.element.querySelector('.rc31-photo-meta').textContent=meta;
    }
  };
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button');if(!button)return;
    if(button.hasAttribute('data-preview-close'))closePreview();
    else if(button.dataset.previewPhoto&&!controller.isBusy())preview(button.dataset.previewPhoto,button);
    else if(button.id==='iqcRcClose')closePreview();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('iqc31PhotoPreview')){event.preventDefault();closePreview();}});
  addEventListener('pagehide',()=>closePreview(false));
})();
