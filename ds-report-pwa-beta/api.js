// Grinding WIP BETA v1.6｜前端 API（路由不變）
const BETA_API_URL = "https://script.google.com/macros/s/AKfycbw3Xg0ev3zoTO-WFfe7sTIUlr6wF4P-qAgZEZUF3uUhioT63bQYT-9QRgZqLU0IhB6G/exec";
const BETA_API_TOKEN = "-M-yiaurzifieaJyYS4838MCYiuDh4wB";

function isBetaApiConfigured() {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(
    String(BETA_API_URL || "").trim()
  );
}

async function parseBetaApiJsonResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("BETA API 回傳格式錯誤");
  }
  if (!response.ok || !data || data.ok !== true) {
    throw new Error(data && data.message ? data.message : "BETA API 請求失敗");
  }
  return data;
}

async function betaGetApi(api, params) {
  if (!isBetaApiConfigured()) throw new Error("尚未設定 BETA_API_URL");
  const query = new URLSearchParams(Object.assign({}, params || {}, {
    api: api,
    token: BETA_API_TOKEN
  }));
  const response = await fetch(`${BETA_API_URL}?${query.toString()}`, {
    method: "GET",
    cache: "no-store"
  });
  return parseBetaApiJsonResponse(response);
}

async function betaPostApi(api, payload) {
  if (!isBetaApiConfigured()) throw new Error("尚未設定 BETA_API_URL");
  const requestBody = Object.assign({}, payload || {}, {
    api: api,
    token: BETA_API_TOKEN
  });
  const response = await fetch(BETA_API_URL, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(requestBody)
  });
  return parseBetaApiJsonResponse(response);
}

async function fetchBetaApiHealth() {
  return betaGetApi("health", {});
}

async function fetchBetaWipLookup(ctn) {
  return betaGetApi("wip_lookup", {
    ctn: String(ctn || "").trim().toUpperCase()
  });
}

async function fetchBetaWipLookupBatch(ctns) {
  return betaPostApi("wip_lookup_batch", {
    ctns: (Array.isArray(ctns) ? ctns : [])
      .map(value => String(value || "").trim().toUpperCase())
      .filter(Boolean)
  });
}

async function fetchBetaGrindingSummary(reportDate) {
  return betaGetApi("grinding_summary", {
    date: String(reportDate || "").trim()
  });
}

async function fetchBetaGrindingWip(reportDate) {
  return betaGetApi("grinding_wip", {
    date: String(reportDate || "").trim()
  });
}

async function fetchBetaGrindingBootstrap(reportDate) {
  return betaGetApi("wip_bootstrap", {
    date: String(reportDate || "").trim()
  });
}

async function fetchBetaGrindingRevision(reportDate) {
  return betaGetApi("wip_revision", {
    date: String(reportDate || "").trim()
  });
}

async function submitBetaGrindingCheckIn(payload) {
  return betaPostApi("grinding_check_in", payload);
}

async function submitBetaGrindingDisposition(payload) {
  return betaPostApi("grinding_disposition", payload);
}

// 保留舊 Stage 3 API，方便必要時回查既有測試資料。
async function fetchBetaCtnLookup(ctn) {
  return betaGetApi("ctn_lookup", {
    ctn: String(ctn || "").trim().toUpperCase()
  });
}

async function submitBetaOperations(payload) {
  return betaPostApi("submit_operations", payload);
}
