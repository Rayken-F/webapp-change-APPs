// Grinding WIP BETA v1.8｜Barcoder＋低負載同步＋後端版本鎖
const BETA_API_URL = "https://script.google.com/macros/s/AKfycbw3Xg0ev3zoTO-WFfe7sTIUlr6wF4P-qAgZEZUF3uUhioT63bQYT-9QRgZqLU0IhB6G/exec";
const BETA_API_TOKEN = "-M-yiaurzifieaJyYS4838MCYiuDh4wB";
const BETA_CLIENT_VERSION = "BETA_GRINDING_WIP_V1_9_ALL_WIP_CTN_BARCODER_20260801";

function isBetaApiConfigured() {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(
    String(BETA_API_URL || "").trim()
  );
}

function emitBetaClientUpdateRequired(data) {
  try {
    window.dispatchEvent(new CustomEvent("beta-client-update-required", {
      detail: {
        code: "CLIENT_UPDATE_REQUIRED",
        message: data && data.message ? data.message : "Grinding WIP 版本已更新。",
        receivedClientVersion: data && data.receivedClientVersion
          ? data.receivedClientVersion
          : BETA_CLIENT_VERSION,
        requiredClientVersion: data && data.requiredClientVersion
          ? data.requiredClientVersion
          : "",
        updateUrl: data && data.updateUrl ? data.updateUrl : ""
      }
    }));
  } catch (ignore) {}
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
    if (data && data.code === "CLIENT_UPDATE_REQUIRED") {
      emitBetaClientUpdateRequired(data);
    }
    const error = new Error(
      data && data.message ? data.message : "BETA API 請求失敗"
    );
    error.code = data && data.code ? String(data.code) : "";
    error.requiredClientVersion =
      data && data.requiredClientVersion
        ? String(data.requiredClientVersion)
        : "";
    error.receivedClientVersion =
      data && data.receivedClientVersion
        ? String(data.receivedClientVersion)
        : "";
    error.updateUrl = data && data.updateUrl ? String(data.updateUrl) : "";
    throw error;
  }
  return data;
}

async function betaGetApi(api, params) {
  if (!isBetaApiConfigured()) throw new Error("尚未設定 BETA_API_URL");
  const query = new URLSearchParams(Object.assign({}, params || {}, {
    api: api,
    token: BETA_API_TOKEN,
    client_version: BETA_CLIENT_VERSION,
    request_nonce: String(Date.now())
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
    token: BETA_API_TOKEN,
    client_version: BETA_CLIENT_VERSION
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

async function fetchBetaCtnLookup(ctn) {
  return betaGetApi("ctn_lookup", {
    ctn: String(ctn || "").trim().toUpperCase()
  });
}

async function submitBetaOperations(payload) {
  return betaPostApi("submit_operations", payload);
}
