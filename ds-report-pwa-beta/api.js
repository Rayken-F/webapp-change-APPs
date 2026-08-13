// Grinding WIP BETA v2.0.7｜弱網交易確認＋同 submission_id 安全續傳
const BETA_API_URL = "https://script.google.com/macros/s/AKfycbw3Xg0ev3zoTO-WFfe7sTIUlr6wF4P-qAgZEZUF3uUhioT63bQYT-9QRgZqLU0IhB6G/exec";
const BETA_API_TOKEN = "-M-yiaurzifieaJyYS4838MCYiuDh4wB";
const BETA_CLIENT_VERSION = "BETA_GRINDING_WIP_V2_0_7_WEAK_NETWORK_RECOVERY_20260813";

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

function createBetaApiError(message, options) {
  const opts = options || {};
  const error = new Error(String(message || "BETA API 請求失敗"));
  error.code = String(opts.code || "");
  error.ambiguous = !!opts.ambiguous;
  error.definitive = !!opts.definitive;
  error.requiredClientVersion = String(opts.requiredClientVersion || "");
  error.receivedClientVersion = String(opts.receivedClientVersion || "");
  error.updateUrl = String(opts.updateUrl || "");
  return error;
}

function isBetaAmbiguousApiError(error) {
  return !!(error && error.ambiguous === true);
}

async function parseBetaApiJsonResponse(response) {
  let text = "";
  try {
    text = await response.text();
  } catch (err) {
    throw createBetaApiError(
      "BETA 回應讀取中斷；後端可能已完成交易，系統會用 submission_id 確認。",
      { code: "RESPONSE_READ_FAILED", ambiguous: true }
    );
  }

  if (!text || !String(text).trim()) {
    throw createBetaApiError(
      "BETA 沒有收到完整回應；這不代表交易失敗，系統會確認後台收據。",
      { code: "EMPTY_RESPONSE", ambiguous: true }
    );
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw createBetaApiError(
      "BETA 回應未完整（不是有效 JSON）；系統會確認 submission_id 後再決定是否續傳。",
      { code: "INVALID_JSON_RESPONSE", ambiguous: true }
    );
  }

  if (!response.ok || !data || data.ok !== true) {
    if (data && data.code === "CLIENT_UPDATE_REQUIRED") {
      emitBetaClientUpdateRequired(data);
    }
    const status = Number(response && response.status || 0);
    throw createBetaApiError(
      data && data.message ? data.message : "BETA API 請求失敗",
      {
        code: data && data.code ? String(data.code) : (status ? "HTTP_" + status : "BETA_API_FAILED"),
        ambiguous: !data || status >= 500 || status === 0,
        definitive: !!data && data.ok === false && data.code !== "CLIENT_UPDATE_REQUIRED",
        requiredClientVersion: data && data.requiredClientVersion,
        receivedClientVersion: data && data.receivedClientVersion,
        updateUrl: data && data.updateUrl
      }
    );
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
      throw createBetaApiError(
        "BETA API 連線逾時；後端可能仍在處理，系統會先確認 submission_id 收據。",
        { code: "NETWORK_TIMEOUT", ambiguous: true }
      );
    }
    if (err && (err.definitive || err.ambiguous)) throw err;
    throw createBetaApiError(
      "BETA 網路連線中斷；後端可能已收到交易，系統會先確認收據。",
      { code: "NETWORK_ERROR", ambiguous: true }
    );
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

async function fetchBetaWipSubmissionStatus(submissionId) {
  return betaGetApi("wip_submission_status", {
    submission_id: String(submissionId || "").trim()
  }, 12000);
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
