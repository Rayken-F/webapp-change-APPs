/* RC31: stable cards use 160px thumbnails; full images stay in IndexedDB. */
(function(){
  "use strict";
  const controller=window.__DS_IQC_RC31,cards=new Map();let previewUrl="",previewGeneration=0,releasePreview=()=>{},previewTrigger=null;
  const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function closePreview(restoreFocus=true){const panel=document.getElementById('iqc31PhotoPreview'),trigger=previewTrigger;previewTrigger=null;previewGeneration++;releasePreview();releasePreview=()=>{};panel?.remove();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl="";if(panel)controller.previewEvent?.('closed');if(restoreFocus&&trigger?.isConnected)trigger.focus({preventScroll:true});}
  async function preview(id,trigger){
    closePreview(false);const generation=previewGeneration,started=Date.now();previewTrigger=trigger;
    // Explicitly dismiss the editing keyboard; Safari does not always focus a
    // tapped button. Keep the editor and its unsaved values in place.
    if(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))document.activeElement.blur();
    const panel=document.createElement('section');panel.id='iqc31PhotoPreview';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','照片檢視');
    panel.setAttribute('aria-modal','true');
    panel.innerHTML='<div class="iqc31-preview-content" style="display:flex;flex-direction:column;align-items:center;gap:12px;max-width:100%;min-height:0"><p role="status">正在讀取本機照片…</p><button type="button" class="iqc-rc-btn" data-preview-close style="flex:none;min-height:48px">關閉照片</button></div>';
    panel.style.cssText='position:fixed;inset:auto;z-index:120010;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));box-sizing:border-box;background:#08112f;color:white';document.body.appendChild(panel);
    // Use the visible viewport, including Safari's changing browser bars. Do not
    // inherit the workbench's stable form height or the underlying scroll position.
    let frame=0,deadline=0,settled=false,abandonImage=()=>{};const viewport=window.visualViewport;
    const style=(element,key,value)=>{if(element.style[key]!==value)element.style[key]=value;};
    const layout=()=>{
      frame=0;if(generation!==previewGeneration)return;
      style(panel,'left',(viewport?.offsetLeft||0)+'px');style(panel,'top',(viewport?.offsetTop||0)+'px');
      style(panel,'width',(viewport?.width||innerWidth)+'px');style(panel,'height',(viewport?.height||innerHeight)+'px');
      const image=panel.querySelector('img'),css=getComputedStyle(panel),button=panel.querySelector('[data-preview-close]');
      if(image){style(image,'maxHeight',Math.max(1,panel.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)-button.offsetHeight-12)+'px');style(image,'maxWidth','100%');}
    };
    // Coalesce keyboard/browser-bar events and only write changed dimensions.
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(layout);};
    layout();viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);window.addEventListener('resize',schedule);
    releasePreview=()=>{clearTimeout(deadline);cancelAnimationFrame(frame);abandonImage();viewport?.removeEventListener('resize',schedule);viewport?.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);};
    panel.querySelector('[data-preview-close]').focus({preventScroll:true});
    const current=()=>generation===previewGeneration&&!settled;
    const failed=code=>{if(!current())return;settled=true;clearTimeout(deadline);abandonImage();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl="";panel.querySelector('p').textContent=code==='PHOTO_PREVIEW_TIMEOUT'?'照片讀取逾時，請關閉後重試；已保存的更正仍保留。':'照片無法顯示，請關閉後重試；已保存的更正仍保留。';controller.previewEvent?.('failed',code,Date.now()-started);};
    controller.previewEvent?.('opened');deadline=setTimeout(()=>failed('PHOTO_PREVIEW_TIMEOUT'),15000);
    try{const p=await controller.readPhoto(id);if(!current())return;if(!p?.blob?.size)throw Error();
      controller.previewEvent?.('read',undefined,Date.now()-started);
      previewUrl=URL.createObjectURL(p.blob);const img=document.createElement('img');img.alt='第 '+p.seq+' 張原照片';img.decoding='async';img.style.cssText='display:block;width:auto;height:auto;object-fit:contain;min-height:0;flex:0 1 auto';
      const loaded=new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;abandonImage=()=>{img.removeAttribute('src');reject(Error());};});img.src=previewUrl;
      try{await loaded;if(img.decode)await img.decode();}catch(_){failed('PHOTO_PREVIEW_DECODE');return;}finally{img.onload=null;img.onerror=null;abandonImage=()=>{};}
      if(!current())return;settled=true;clearTimeout(deadline);panel.querySelector('p').replaceWith(img);layout();controller.previewEvent?.('ready',undefined,Date.now()-started);
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
