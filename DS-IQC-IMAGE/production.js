(function(){
  'use strict';
  let initial=null;
  function parentContext(){try{return parent!==window&&parent.location.origin===location.origin?parent.DS_PORTAL_BRIDGE?.getSessionContext?.():null;}catch(_){return null;}}
  initial=parentContext();
  const owner=initial?.profile?.user?.account||'',allowed=!!(initial?.token&&owner&&initial.profile.permissions?.iqc_image_enabled===true);
  const endpoint='https://script.google.com/macros/s/AKfycbxIHXEN1jucDXRqViPwmhxAZM41OO1jZgtZO6QnkGlKiWstL782yXuHcnlOIc3BEFxr/exec';
  function context(){const c=parentContext();if(!allowed||!c?.token||c.profile?.user?.account!==owner||c.profile.permissions?.iqc_image_enabled!==true)throw Error('請從 DS 工作台以有權限的帳號開啟 IQC 影像辨識。');return c;}
  window.IqcProduction=Object.freeze({allowed,owner,endpoint,key:s=>'ds_iqc_prod_v1:'+encodeURIComponent(owner)+':'+s,async masters(){const c=context(),ac=new AbortController(),timer=setTimeout(()=>ac.abort(),45000);try{const res=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({api:'iqc_image_masters',session_token:c.token}),signal:ac.signal}),data=await res.json();context();if(!data.ok||data.environment!=='IQC_IMAGE_PRODUCTION_V1')throw Error(data.message||'區域資料載入失敗，請重新開啟。');return data;}finally{clearTimeout(timer);}}});
  window.DS_PORTAL_BRIDGE=Object.freeze({getSessionContext:context});
  window.toast=(message,error)=>{const el=document.getElementById('toast');el.textContent=message;el.hidden=false;el.style.background=error?'#713c47':'#244b46';clearTimeout(window.toast.timer);window.toast.timer=setTimeout(()=>el.hidden=true,2800);};
  // Cloud assistance has not been enabled/accepted for this production release.
  window.portalPost=async api=>{context();if(api==='portal_iqc_cloud_ocr_status_rc')return {ok:true,ready:false,enabled:false,configured:false};throw Error('本版使用已驗收的本機辨識。');};
  if(allowed){window.__DS_IQC_RC31={booting:true,reviewActive:true,isBusy:()=>true};document.getElementById('entryMessage').hidden=true;}
  else document.getElementById('entryMessage').innerHTML='此帳號尚未開啟 IQC 影像辨識權限。請由 <a href="../ds-app/" target="_top">DS 工作台</a>登入後使用。';
})();
