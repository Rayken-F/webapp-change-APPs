/**
 * DS 日報系統｜IQC 異常處理台 v0.2
 * GitHub Pages 前端 API 設定
 */
(function(global){
  "use strict";

  const CLIENT_VERSION = "IQC_CORRECTION_V0_9_4_20260809";

  // 部署 Apps Script 後，將下方網址替換成固定 /exec URL。
  const API_URL = "https://script.google.com/macros/s/AKfycbzgOpdC9aStQBaqMjR9MORMFcmWi-DTbP3f_RLtb5lq_U48e1kv_7vu9z_9IHtJqQDs/exec";

  const TOKEN_KEY = "ds_iqcc_session_v2";

  function assertConfigured(){
    return API_URL;
  }

  async function post(api, payload){
    const apiUrl = assertConfigured();

    const body = Object.assign({}, payload || {}, {
      api,
      client_version: CLIENT_VERSION
    });

    const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
    if(token && api !== "login") body.session_token = token;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      cache: "no-store"
    });

    const text = await response.text();
    let data;
    try{
      data = JSON.parse(text);
    }catch(err){
      throw new Error("API 回傳不是 JSON：" + text.slice(0, 160));
    }

    if(!data.ok){
      if(data.code === "CLIENT_UPDATE_REQUIRED"){
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      }
      throw new Error(data.message || "API 執行失敗");
    }
    return data;
  }

  function saveToken(token, remember){
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  }

  function clearToken(){
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  function hasToken(){
    return !!(sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY));
  }

  function makeIdempotencyKey(prefix){
    const random = (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return String(prefix || "IQCC").toUpperCase() + "_" + random.toUpperCase();
  }

  global.IqcCorrectionApi = {
    CLIENT_VERSION,
    API_URL,
    post,
    saveToken,
    clearToken,
    hasToken,
    makeIdempotencyKey
  };
})(window);
