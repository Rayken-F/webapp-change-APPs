"use strict";

(function installIqcResultRenderOwnerV17(){
  const VERSION="IQC_RESULT_RENDER_OWNER_RC_V17_20260824";
  if(window.__DS_IQC_RESULT_RENDER_OWNER_V17__)return;

  let host=null;
  let installed=false;
  let metaOwned=false;
  let descriptor=null;
  let observer=null;

  function isMetaMarkup(value){
    const html=String(value==null?"":value);
    return html.includes("ds-iqc-v8-group") || html.includes("尚未形成可辨識的 RT／狀態／廠區群組");
  }

  function markMetaOwned(){
    if(!host)return;
    if(host.querySelector(".ds-iqc-v8-group")){
      metaOwned=true;
      host.dataset.dsResultOwner="META_V8_LOCKED_V17";
    }
  }

  function installOnHost(){
    const target=document.getElementById("iqcRcResultList");
    if(!target)return false;
    if(target.dataset.dsRenderLockV17==="1"){
      host=target;
      markMetaOwned();
      return true;
    }

    descriptor=Object.getOwnPropertyDescriptor(Element.prototype,"innerHTML") ||
      Object.getOwnPropertyDescriptor(HTMLElement.prototype,"innerHTML");
    if(!descriptor||typeof descriptor.get!=="function"||typeof descriptor.set!=="function"){
      console.warn("[IQC RESULT OWNER V17] innerHTML descriptor unavailable");
      return false;
    }

    host=target;
    Object.defineProperty(host,"innerHTML",{
      configurable:true,
      enumerable:false,
      get(){ return descriptor.get.call(this); },
      set(value){
        const html=String(value==null?"":value);
        if(metaOwned && !isMetaMarkup(html)){
          console.debug("[IQC RESULT OWNER V17] blocked legacy renderer overwrite");
          return;
        }
        descriptor.set.call(this,value);
        if(isMetaMarkup(html) && html.includes("ds-iqc-v8-group")){
          metaOwned=true;
          this.dataset.dsResultOwner="META_V8_LOCKED_V17";
        }
      }
    });
    host.dataset.dsRenderLockV17="1";

    observer=new MutationObserver(()=>markMetaOwned());
    observer.observe(host,{childList:true,subtree:true});
    markMetaOwned();
    installed=true;
    return true;
  }

  async function requestMetaRefresh(){
    const meta=window.__DS_IQC_META_GROUPING_V8;
    if(meta&&typeof meta.refresh==="function"){
      try{await Promise.resolve(meta.refresh());}catch(err){console.warn("[IQC RESULT OWNER V17] meta refresh",err);}
      markMetaOwned();
    }
  }

  const bootstrap=new MutationObserver(()=>{
    if(installOnHost()){
      requestMetaRefresh();
      bootstrap.disconnect();
    }
  });
  bootstrap.observe(document.documentElement,{childList:true,subtree:true});

  if(installOnHost())requestMetaRefresh();
  setTimeout(()=>requestMetaRefresh(),250);
  setTimeout(()=>requestMetaRefresh(),900);

  window.__DS_IQC_RESULT_RENDER_OWNER_V17__={
    version:VERSION,
    refresh:requestMetaRefresh,
    status:()=>({installed,metaOwned,owner:host?.dataset?.dsResultOwner||""})
  };
})();
