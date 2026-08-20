"use strict";

(function installReturnAdminLoaderRcV4(){
  const VERSION="GRINDING_RETURN_ADMIN_LOADER_RC_V4_20260820";
  let loading=false;
  let loaded=false;

  function isAdmin(){
    const role=String(document.getElementById("userRole")?.textContent||"").trim().toUpperCase();
    return role==="ADMIN";
  }

  function loadScript(src,id){
    return new Promise((resolve,reject)=>{
      const existing=document.getElementById(id);
      if(existing){resolve();return;}
      const script=document.createElement("script");
      script.id=id;script.src=src;script.async=false;
      script.onload=()=>resolve();
      script.onerror=()=>reject(new Error("RC script load failed: "+src));
      document.body.appendChild(script);
    });
  }

  async function ensureLoaded(){
    if(loaded||loading||!isAdmin())return loaded;
    loading=true;
    try{
      await loadScript("./return-rc-config.js?v=20260820-4","dsReturnRcConfigV4");
      await loadScript("./return-to-wip-rc-v3.js?v=20260820-4","dsReturnUiV4");
      loaded=true;
      return true;
    }catch(err){
      console.error("Grinding Return RC loader",err);
      return false;
    }finally{loading=false;}
  }

  document.addEventListener("click",event=>{
    const nav=event.target.closest&&event.target.closest("[data-nav='grinding']");
    if(nav)setTimeout(ensureLoaded,120);
  },true);

  [800,1800,3200].forEach(ms=>setTimeout(ensureLoaded,ms));
  window.__DS_GRINDING_RETURN_ADMIN_LOADER_RC_V4={version:VERSION,ensureLoaded,isAdmin};
})();
