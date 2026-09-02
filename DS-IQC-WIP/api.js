/**
 * DS 日報系統｜IQC 異常處理台
 * Frontend API transport + weak-network guard
 */
(function(global){
  "use strict";

  const CLIENT_VERSION = "IQC_CORRECTION_V0_9_7_20260810";
  const API_URL = "https://script.google.com/macros/s/AKfycbzgOpdC9aStQBaqMjR9MORMFcmWi-DTbP3f_RLtb5lq_U48e1kv_7vu9z_9IHtJqQDs/exec";
  const TOKEN_KEY = "ds_iqcc_session_v2";
  const PENDING_CREATE_KEY = "ds_iqcc_pending_create_v1";
  const PENDING_CREATE_TTL_MS = 30 * 60 * 1000;

  const READ_RETRY_APIS = new Set([
    "bootstrap",
    "session_profile",
    "lookup",
    "list_requests",
    "notification_summary",
    "mark_notifications_viewed",
    "frame_capacity"
  ]);

  function assertConfigured(){
    return API_URL;
  }

  function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function makeTransportError(code, message, cause){
    const err = new Error(message);
    err.code = code;
    if(cause) err.cause = cause;
    return err;
  }

  function canonicalize(value){
    if(Array.isArray(value)) return value.map(canonicalize);
    if(value && typeof value === "object"){
      const out = {};
      Object.keys(value).sort().forEach(key => {
        out[key] = canonicalize(value[key]);
      });
      return out;
    }
    return value;
  }

  function createRequestFingerprint(payload){
    const source = Object.assign({}, payload || {});
    delete source.idempotency_key;
    return JSON.stringify(canonicalize(source));
  }

  function readPendingCreate(){
    try{
      const value = JSON.parse(sessionStorage.getItem(PENDING_CREATE_KEY) || "null");
      if(!value || !value.key || !value.fingerprint) return null;
      if(Date.now() - Number(value.createdAt || 0) > PENDING_CREATE_TTL_MS){
        sessionStorage.removeItem(PENDING_CREATE_KEY);
        return null;
      }
      return value;
    }catch(_){
      sessionStorage.removeItem(PENDING_CREATE_KEY);
      return null;
    }
  }

  function prepareCreateRequest(payload){
    const next = Object.assign({}, payload || {});
    const fingerprint = createRequestFingerprint(next);
    const pending = readPendingCreate();

    if(pending && pending.fingerprint === fingerprint){
      next.idempotency_key = pending.key;
      return { payload: next, fingerprint, key: pending.key };
    }

    const key = String(next.idempotency_key || makeIdempotencyKey("IQCR")).toUpperCase();
    next.idempotency_key = key;
    sessionStorage.setItem(PENDING_CREATE_KEY, JSON.stringify({
      fingerprint,
      key,
      createdAt: Date.now()
    }));
    return { payload: next, fingerprint, key };
  }

  function clearPendingCreate(expected){
    const pending = readPendingCreate();
    if(!pending) return;
    if(expected && (pending.key !== expected.key || pending.fingerprint !== expected.fingerprint)) return;
    sessionStorage.removeItem(PENDING_CREATE_KEY);
  }

  function timeoutForApi(api){
    if(api === "login") return 20000;
    if(api === "create_request" || api === "review_request" || api === "close_request") return 25000;
    return 15000;
  }

  function attemptsForApi(api){
    if(api === "create_request") return 2;
    if(READ_RETRY_APIS.has(api)) return 2;
    return 1;
  }

  async function fetchTextWithTimeout(url, options, timeoutMs){
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try{
      const response = await fetch(url, Object.assign({}, options, controller ? { signal: controller.signal } : {}));
      const text = await response.text();
      return { response, text };
    }catch(err){
      if(err && err.name === "AbortError"){
        throw makeTransportError("NETWORK_TIMEOUT", `連線超過 ${Math.round(timeoutMs / 1000)} 秒，系統已停止等待。`, err);
      }
      throw makeTransportError("NETWORK_ERROR", "目前網路不穩定或無法連線後端。", err);
    }finally{
      if(timer) clearTimeout(timer);
    }
  }

  function rewriteAmbiguousWriteMessage(api, err){
    if(api === "create_request"){
      err.message = "異常單回應待確認；系統會保留同一交易編號。網路恢復後再次按「建立異常單」，不會重複建單。";
      return err;
    }
    if(api === "review_request" || api === "close_request"){
      err.message = "後端結果待確認；請先更新異常單清單確認狀態，不要連續重複操作。";
      return err;
    }
    if(api === "login"){
      err.message = "登入連線逾時或中斷；請確認網路後再按一次登入。系統不會自動重送密碼。";
      return err;
    }
    return err;
  }

  async function post(api, payload){
    const apiUrl = assertConfigured();
    const normalizedApi = String(api || "").trim();
    let createState = null;
    let requestPayload = Object.assign({}, payload || {});

    if(normalizedApi === "create_request"){
      createState = prepareCreateRequest(requestPayload);
      requestPayload = createState.payload;
    }

    const body = Object.assign({}, requestPayload, {
      api: normalizedApi,
      client_version: CLIENT_VERSION
    });

    const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
    if(token && normalizedApi !== "login") body.session_token = token;

    const serializedBody = JSON.stringify(body);
    const attempts = attemptsForApi(normalizedApi);
    let lastError = null;

    for(let attempt = 1; attempt <= attempts; attempt += 1){
      if(attempt > 1) await sleep(700);

      try{
        const result = await fetchTextWithTimeout(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: serializedBody,
          redirect: "follow",
          cache: "no-store"
        }, timeoutForApi(normalizedApi));

        if(!result.response.ok && result.response.status >= 500){
          throw makeTransportError("HTTP_SERVER_ERROR", `後端暫時無法服務（HTTP ${result.response.status}）。`);
        }

        let data;
        try{
          data = JSON.parse(result.text);
        }catch(err){
          throw makeTransportError("INVALID_JSON_RESPONSE", "API 回應不完整，無法確認交易結果。", err);
        }

        if(!data.ok){
          if(data.code === "CLIENT_UPDATE_REQUIRED"){
            localStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(TOKEN_KEY);
          }
          if(normalizedApi === "create_request") clearPendingCreate(createState);
          const apiError = new Error(data.message || "API 執行失敗");
          apiError.code = data.code || "API_ERROR";
          throw apiError;
        }

        if(normalizedApi === "create_request") clearPendingCreate(createState);
        return data;
      }catch(err){
        lastError = err;
        const retryable = ["NETWORK_TIMEOUT", "NETWORK_ERROR", "HTTP_SERVER_ERROR", "INVALID_JSON_RESPONSE"].includes(String(err && err.code || ""));
        if(!retryable || attempt >= attempts){
          if(retryable) throw rewriteAmbiguousWriteMessage(normalizedApi, err);
          throw err;
        }
      }
    }

    throw lastError || new Error("API 執行失敗");
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
