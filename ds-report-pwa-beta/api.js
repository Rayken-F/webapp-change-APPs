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

/**
 * 2026-08-28｜Grinding WIP 精確 CTN 狀態提示 hotfix
 * - 不變更 BETA_CLIENT_VERSION / API URL / token。
 * - WIP Barcoder 找不到目前 Grinding asset 時，改向後端 wip_lookup 查真實狀態。
 * - 禁止再用「CTN不在站內」這種無法追料的模糊提示。
 * - TRANSFER_HT 僅為 DS 內部狀態，不代表 HT 站已收料；本 hotfix 不做任何業主對外傳送。
 */
function normalizeBetaPreciseCtnStatusMessage_(result) {
  const data = result && typeof result === "object" ? result : {};
  const code = String(data.code || "").trim();
  const exact = {
    iqc_not_created: "CTN未建立IQC",
    ctn_in_grinding_wip: "CTN已進入Grinding WIP",
    ctn_in_sandblast_frame: "CTN已入噴砂框",
    ctn_exited_grinding: "CTN已經出站",
    ctn_dcyl: "CTN已轉DCYL",
    ctn_ht_internal: "CTN已轉HT"
  };
  if (exact[code]) return exact[code];
  return String(data.message || "").trim();
}

window.addEventListener("DOMContentLoaded", function() {
  // 等 index.html inline script 完成函式宣告後再覆寫，避免改動既有 v2.0.7 主流程。
  setTimeout(function() {
    if (typeof findAssetByCtnInList_ !== "function" ||
        typeof pushBarcodeRecent_ !== "function") return;

    window.describeRejectedBarcode_ = function(ctn) {
      const waiting = findAssetByCtnInList_(
        state.wip && state.wip.waitSandblastAssets,
        ctn
      );
      if (waiting) return "CTN已入噴砂框";

      const disposed = findAssetByCtnInList_(
        state.wip && state.wip.dispositions,
        ctn
      );
      if (disposed) {
        const status = String(
          disposed.lifecycleStatus || disposed.stationStatus || ""
        ).toUpperCase();
        if (status === "DCYL") return "CTN已轉DCYL";
        if (status === "HT") return "CTN已轉HT";
      }
      return "";
    };

    window.scanGrindingWipBarcode = async function() {
      if (!ensureClientWriteAllowed()) return;
      const input = document.getElementById("wipBarcodeInput");
      const ctn = normalizeCtn(input && input.value || "");
      if (input) input.value = "";

      if (!CTN_RE.test(ctn)) {
        pushBarcodeRecent_(
          ctn || "格式錯誤",
          "bad",
          "Barcoder CTN 格式錯誤，需為 7 碼。未寫入任何資料。"
        );
        if (navigator.vibrate) navigator.vibrate([80,40,80]);
        focusWipBarcode();
        return;
      }

      let assets = findGrindingAssetsByCtn_(ctn);
      if (!assets.length &&
          Date.now() - Number(state.lastBootstrapAt || 0) > 15000 &&
          !state.refreshing) {
        await checkRemoteRevision(true);
        assets = findGrindingAssetsByCtn_(ctn);
      }

      if (!assets.length) {
        let message = describeRejectedBarcode_(ctn);
        if (!message) {
          try {
            const result = await fetchBetaWipLookup(ctn);
            message = normalizeBetaPreciseCtnStatusMessage_(result);
          } catch (err) {
            message = "CTN狀態查詢失敗，請確認連線後重試";
          }
        }
        if (!message) message = "CTN狀態無法判定，請重新查詢";
        pushBarcodeRecent_(ctn, "bad", message);
        if (navigator.vibrate) navigator.vibrate([100,50,100]);
        focusWipBarcode();
        return;
      }

      const unselected = assets.filter(function(asset) {
        return !state.selected[asset.assetKey];
      });
      if (!unselected.length) {
        assets.forEach(function(asset) {
          state.barcodeSelected[asset.assetKey] = true;
        });
        pushBarcodeRecent_(
          ctn,
          "warn",
          "CTN已進入Grinding WIP｜此 CTN 已經選取，不會重複計數。"
        );
        if (navigator.vibrate) navigator.vibrate(70);
        focusWipBarcode();
        return;
      }

      unselected.forEach(function(asset) {
        state.selected[asset.assetKey] = true;
        state.selectedQty[asset.assetKey] = Number(asset.qty || 1);
        state.barcodeSelected[asset.assetKey] = true;
        updateAssetSelectionDom_(asset.assetKey, true);
      });
      renderWipAssets();
      renderSticky();

      const selectedQty = unselected.reduce(function(sum, asset) {
        return sum + Number(asset.qty || 1);
      }, 0);
      const segmentText = unselected.length > 1
        ? `｜${unselected.length}筆在製片段`
        : "";
      pushBarcodeRecent_(
        ctn,
        "ok",
        `CTN已進入Grinding WIP｜已選取 ${selectedQty} 支${segmentText}。尚未改帳。`
      );
      if (navigator.vibrate) navigator.vibrate(35);
      focusWipBarcode();
    };
  }, 0);
});
