"use strict";
(function installIqcImageMemoryGuardV14(){
  const VERSION="IQC_IMAGE_MEMORY_GUARD_V14_20260823";
  if(window.__DS_IQC_IMAGE_MEMORY_GUARD_V14)return;
  const revoked=new Set();

  function revoke(src){
    if(!src||!String(src).startsWith("blob:")||revoked.has(src))return;
    try{URL.revokeObjectURL(src);revoked.add(src);}catch(_){ }
  }
  function bindImage(img){
    if(!img||img.dataset.dsMemGuard==="1")return;
    img.dataset.dsMemGuard="1";
    const src=img.currentSrc||img.src||"";
    const done=()=>{revoke(src);img.removeEventListener("load",done);img.removeEventListener("error",done);};
    if(img.complete)setTimeout(done,0);else{img.addEventListener("load",done,{once:true});img.addEventListener("error",done,{once:true});}
  }
  function sweep(root=document){root.querySelectorAll?.("#iqcRcPhotoList img").forEach(bindImage);}
  function revokeVisible(){document.querySelectorAll("#iqcRcPhotoList img").forEach(img=>revoke(img.currentSrc||img.src||""));}

  const observer=new MutationObserver(records=>{
    records.forEach(rec=>rec.addedNodes.forEach(node=>{
      if(node.nodeType!==1)return;
      if(node.matches?.("#iqcRcPhotoList img"))bindImage(node);
      sweep(node);
    }));
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("click",e=>{if(e.target.closest?.("#iqcRcClose,#iqcRcNewBatch"))setTimeout(revokeVisible,0);},true);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)revokeVisible();});
  setInterval(()=>sweep(document),1500);
  sweep(document);
  window.__DS_IQC_IMAGE_MEMORY_GUARD_V14={version:VERSION,revokeVisible};
})();
