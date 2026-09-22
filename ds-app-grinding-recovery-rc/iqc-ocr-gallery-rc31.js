/* RC31: stable cards use 160px thumbnails; full images stay in IndexedDB. */
(function(){
  "use strict";
  const controller=window.__DS_IQC_RC31,cards=new Map();let previewUrl="",previewGeneration=0;
  const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function closePreview(){previewGeneration++;document.getElementById('iqc31PhotoPreview')?.remove();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl="";}
  async function preview(id){
    closePreview();const generation=previewGeneration;
    const panel=document.createElement('section');panel.id='iqc31PhotoPreview';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','照片檢視');
    panel.innerHTML='<button type="button" class="iqc-rc-btn" data-preview-close>關閉照片</button><p role="status">正在讀取本機照片…</p>';
    panel.style.cssText='position:fixed;inset:0;z-index:120010;overflow:auto;padding:16px;box-sizing:border-box;background:#08112f;color:white';document.body.appendChild(panel);
    try{const p=await controller.readPhoto(id);if(generation!==previewGeneration)return;if(!p?.blob)throw Error();
      previewUrl=URL.createObjectURL(p.blob);const img=document.createElement('img');img.alt='第 '+p.seq+' 張原照片';img.style.cssText='display:block;width:100%;height:auto;margin-top:12px';img.src=previewUrl;panel.querySelector('p').replaceWith(img);
    }catch(_){if(generation===previewGeneration)panel.querySelector('p').textContent='照片讀取失敗，請關閉後重試。';}
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
      if(!card.url&&p.thumbnail?.size){card.url=URL.createObjectURL(p.thumbnail);const image=document.createElement('img');image.alt='photo '+p.seq;image.decoding='async';image.src=card.url;card.element.querySelector('[data-preview-photo]').replaceChildren(image);}
      const title='第 '+p.seq+' 張｜'+p.name,meta=Math.round((p.size||0)/1024)+' KB｜原照片已存本機';
      if(card.element.querySelector('strong').textContent!==title)card.element.querySelector('strong').textContent=title;
      if(card.element.querySelector('.rc31-photo-meta').textContent!==meta)card.element.querySelector('.rc31-photo-meta').textContent=meta;
    }
  };
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button');if(!button)return;
    if(button.hasAttribute('data-preview-close'))closePreview();
    else if(button.dataset.previewPhoto&&!controller.isBusy())preview(button.dataset.previewPhoto);
    else if(button.id==='iqcRcClose')closePreview();
  });
  addEventListener('pagehide',closePreview);
})();
