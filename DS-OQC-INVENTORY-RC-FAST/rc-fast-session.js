(function installOqcRcFastSession(){
  "use strict";

  const VERSION="OQC_RC_FAST_SESSION_V0_1_3_20260902";
  const FAST_SESSION_KEY="ds_oqc_rc_fast_session_v1";
  const FAST_SESSION_TTL_MS=12*60*60*1000;

  if(window.__OQC_RC_FAST_SESSION__) return;

  function compactProfile(profile){
    const user=profile&&profile.user?profile.user:{};
    return {
      user:{
        account:String(user.account||""),
        displayName:String(user.displayName||user.display_name||user.name||""),
        role:String(user.role||"")
      }
    };
  }

  function readFastSession(){
    try{
      const row=JSON.parse(localStorage.getItem(FAST_SESSION_KEY)||"null");
      if(!row||!row.token) return null;
      if(Number(row.expiresAt||0)<=Date.now()){
        localStorage.removeItem(FAST_SESSION_KEY);
        return null;
      }
      return row;
    }catch(_){
      localStorage.removeItem(FAST_SESSION_KEY);
      return null;
    }
  }

  function saveFastSession(token,profile){
    const normalized=String(token||"").trim();
    if(!normalized) return null;

    const now=Date.now();
    const row={
      token:normalized,
      profile:compactProfile(profile||{}),
      savedAt:now,
      expiresAt:now+FAST_SESSION_TTL_MS,
      version:VERSION
    };

    localStorage.setItem(FAST_SESSION_KEY,JSON.stringify(row));
    return row;
  }

  function clearFastSession(){
    localStorage.removeItem(FAST_SESSION_KEY);
    try{sessionStorage.removeItem(TOKEN_KEY)}catch(_){ }
  }

  function authContext(){
    let parent=null;
    try{parent=typeof parentSessionContext==="function"?parentSessionContext():null}catch(_){ }

    const liveToken=String(
      parent?.token||
      sessionStorage.getItem(TOKEN_KEY)||
      localStorage.getItem(TOKEN_KEY)||
      ""
    ).trim();

    const stored=readFastSession();
    const token=liveToken||String(stored?.token||"").trim();
    const profile=parent?.profile||stored?.profile||null;

    if(liveToken) saveFastSession(liveToken,profile);
    if(token){
      try{sessionStorage.setItem(TOKEN_KEY,token)}catch(_){ }
    }

    return {token,profile,source:liveToken?"LIVE":stored?"RC_FAST":"NONE"};
  }

  function isSessionError(err){
    const code=String(err?.code||"").toUpperCase();
    const message=String(err?.message||err||"");
    return [
      "SESSION_REQUIRED",
      "SESSION_EXPIRED",
      "LOGIN_REQUIRED",
      "UNAUTHORIZED",
      "AUTH_REQUIRED",
      "ACCOUNT_DISABLED"
    ].includes(code)||/請先登入|登入已失效|SESSION.*失效|帳號已停用/i.test(message);
  }

  const originalPost=Api&&typeof Api.post==="function"?Api.post.bind(Api):null;
  if(originalPost){
    Api.post=async function(api,payload){
      authContext();
      try{
        const result=await originalPost(api,payload);
        if(api==="bootstrap"&&result){
          const token=String(
            sessionStorage.getItem(TOKEN_KEY)||
            localStorage.getItem(TOKEN_KEY)||
            ""
          ).trim();
          if(token) saveFastSession(token,result);
        }
        return result;
      }catch(err){
        if(isSessionError(err)) clearFastSession();
        throw err;
      }
    };
  }

  getStoredToken=function(){
    const context=authContext();
    return context.token||"";
  };

  hydrateAuth=async function(){
    if(!Api||typeof Api.post!=="function"){
      showAuthGate(true,"IQC API 模組載入失敗");
      return false;
    }

    const context=authContext();
    if(!context.token){
      state.authReady=false;
      state.profile=null;
      state.user=null;
      $("userPill").textContent="需登入一次";
      showAuthGate(true);
      return false;
    }

    state.authReady=true;
    showAuthGate(false);

    if(context.profile){
      state.profile=context.profile;
      state.user=context.profile.user||null;
    }

    const name=operatorName()==="RC使用者"?"RC 快速模式":operatorName();
    $("userPill").textContent=name;
    return true;
  };

  function patchUi(){
    const rcPill=document.querySelector(".rc-pill");
    if(rcPill) rcPill.textContent="RC V0.1.3";

    const status=document.querySelector(".status-strip");
    if(status){
      const title=status.querySelector("strong");
      const text=status.querySelector("p");
      if(title) title.textContent="RC 免重複登入模式";
      if(text) text.textContent="沿用這台裝置最近一次有效 DS session；12 小時內開啟 RC 不再等待登入，後端仍會驗證 session。";
    }

    const gate=$("authGate");
    if(gate){
      const title=gate.querySelector("h2");
      const text=gate.querySelector("p");
      const retry=$("retryAuthBtn");
      if(title) title.textContent="請先完成一次 DS 登入";
      if(text) text.textContent="RC 不再顯示獨立登入；只要先登入鼎世工作台一次，這台裝置 12 小時內可直接測試。";
      if(retry) retry.textContent="重新讀取 DS session";
    }

    const tools=document.querySelector(".rc-tools-body");
    if(tools&&!document.getElementById("clearRcFastSessionBtn")){
      const button=document.createElement("button");
      button.id="clearRcFastSessionBtn";
      button.type="button";
      button.className="danger-outline-btn";
      button.textContent="清除 RC 快速登入";
      button.addEventListener("click",()=>{
        clearFastSession();
        state.authReady=false;
        $("userPill").textContent="需登入一次";
        showAuthGate(true);
        toast("已清除這台裝置的 RC 快速登入；正式 DS 登入不受影響。","success");
      });
      const help=tools.querySelector("p");
      tools.insertBefore(button,help||null);
    }
  }

  patchUi();

  window.__OQC_RC_FAST_SESSION__=Object.freeze({
    version:VERSION,
    ttlMs:FAST_SESSION_TTL_MS,
    read:readFastSession,
    clear:clearFastSession,
    refresh:authContext
  });
})();
