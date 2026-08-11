// Grinding WIP BETA v2.0.3｜待噴砂框原子交易＋中斷恢復＋畫面一致性
const BETA_API_URL = "https://script.google.com/macros/s/AKfycbw3Xg0ev3zoTO-WFfe7sTIUlr6wF4P-qAgZEZUF3uUhioT63bQYT-9QRgZqLU0IhB6G/exec";
const BETA_API_TOKEN = "-M-yiaurzifieaJyYS4838MCYiuDh4wB";
const BETA_CLIENT_VERSION = "BETA_GRINDING_WIP_V2_0_6_CYLINDER_STATUS_DISPLAY_20260811";

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

async function betaFetchWithTimeout(url, options, timeoutMs) {
  const timeout = Math.max(1000, Number(timeoutMs || 30000));
  const controller = typeof AbortController === "function"
    ? new AbortController()
    : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeout)
    : 0;

  try {
    return await fetch(url, Object.assign({}, options || {}, {
      signal: controller ? controller.signal : undefined
    }));
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("BETA API 連線逾時，請重新辨識或重試。");
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function betaGetApi(api, params, timeoutMs) {
  if (!isBetaApiConfigured()) throw new Error("尚未設定 BETA_API_URL");
  const query = new URLSearchParams(Object.assign({}, params || {}, {
    api: api,
    token: BETA_API_TOKEN,
    client_version: BETA_CLIENT_VERSION,
    request_nonce: String(Date.now())
  }));
  const response = await betaFetchWithTimeout(
    `${BETA_API_URL}?${query.toString()}`,
    {
      method: "GET",
      cache: "no-store"
    },
    timeoutMs || 30000
  );
  return parseBetaApiJsonResponse(response);
}

async function betaPostApi(api, payload, timeoutMs) {
  if (!isBetaApiConfigured()) throw new Error("尚未設定 BETA_API_URL");
  const requestBody = Object.assign({}, payload || {}, {
    api: api,
    token: BETA_API_TOKEN,
    client_version: BETA_CLIENT_VERSION
  });
  const response = await betaFetchWithTimeout(
    BETA_API_URL,
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(requestBody)
    },
    timeoutMs || 60000
  );
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
  }, 30000);
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



async function fetchBetaWipFrameDetail(frameCtn) {
  return betaGetApi("wip_frame_detail", {
    frame_ctn: String(frameCtn || "").trim().toUpperCase()
  });
}

async function submitBetaGrindingFrameEdit(payload) {
  return betaPostApi("grinding_frame_edit", payload);
}

async function fetchBetaWipHistory(params) {
  return betaGetApi("wip_history", Object.assign({}, params || {}));
}
