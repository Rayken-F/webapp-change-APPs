// 日報輸入端 Apps Script Web App（固定 URL；更新部署版本後 URL 不變）
const API_URL = "https://script.google.com/macros/s/AKfycbwYjPR-mHy_UCRAAsvU84-3T_MMQcfKHX9PSR8Da7E2gQq3xVEcK0Fnz0JvrHaIHpem/exec";

// P0 弱網可靠層：避免把逾時／HTML 錯誤頁誤判成「資料格式錯誤」。
const DS_API_TIMEOUT_MS = {
  submit: 55000,
  status: 12000,
  master: 15000,
  precheck: 18000,
  normal: 18000
};

function createDsApiError(message, options) {
  const opts = options || {};
  const error = new Error(String(message || "API 請求失敗"));
  error.code = String(opts.code || "");
  error.ambiguous = !!opts.ambiguous;
  error.definitive = !!opts.definitive;
  error.httpStatus = Number(opts.httpStatus || 0);
  return error;
}

function isAmbiguousApiError(error) {
  return !!(error && error.ambiguous === true);
}

async function dsFetchWithTimeout(url, options, timeoutMs) {
  const timeout = Math.max(1000, Number(timeoutMs || DS_API_TIMEOUT_MS.normal));
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : 0;

  try {
    return await fetch(url, Object.assign({}, options || {}, {
      signal: controller ? controller.signal : undefined
    }));
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw createDsApiError(
        "連線逾時，伺服器可能仍在處理；系統會改用 submission_id 確認結果。",
        { code: "NETWORK_TIMEOUT", ambiguous: true }
      );
    }
    throw createDsApiError(
      "網路連線中斷，伺服器可能已收到資料；系統會確認收據後再決定是否重送。",
      { code: "NETWORK_ERROR", ambiguous: true }
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function parseApiJsonResponse(res) {
  let text = "";
  try {
    text = await res.text();
  } catch (err) {
    throw createDsApiError(
      "伺服器回應讀取中斷，系統會確認 submission_id 的實際寫入狀態。",
      { code: "RESPONSE_READ_FAILED", ambiguous: true, httpStatus: res && res.status }
    );
  }

  if (!text || !String(text).trim()) {
    throw createDsApiError(
      "伺服器沒有回傳完整結果，系統會確認 submission_id 的實際寫入狀態。",
      { code: "EMPTY_RESPONSE", ambiguous: true, httpStatus: res && res.status }
    );
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw createDsApiError(
      "伺服器回應未完整（不是有效 JSON），這不代表輸入資料格式錯誤；系統會確認收據。",
      { code: "INVALID_JSON_RESPONSE", ambiguous: true, httpStatus: res && res.status }
    );
  }

  if (!res.ok) {
    const status = Number(res.status || 0);
    throw createDsApiError(
      data && data.message ? data.message : "API 請求失敗",
      {
        code: "HTTP_" + status,
        ambiguous: status >= 500 || status === 0,
        definitive: status > 0 && status < 500,
        httpStatus: status
      }
    );
  }

  // Apps Script 多數業務驗證錯誤仍以 HTTP 200 回傳 {ok:false}；這類屬於確定失敗，不能自動重送。
  if (data && data.ok === false) {
    throw createDsApiError(
      data.message || "後端拒絕送出",
      { code: String(data.code || "BUSINESS_REJECTED"), definitive: true }
    );
  }

  return data;
}

async function submitDailyReportAPI(payload, timeoutMs) {
  const res = await dsFetchWithTimeout(API_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  }, timeoutMs || DS_API_TIMEOUT_MS.submit);

  return parseApiJsonResponse(res);
}

/**
 * 讀取目前日報送出的真實處理狀態。
 * 只有後端偵測到 Response 寫入鎖被占用時，才會回傳 state=queued。
 */
async function fetchDailySubmissionStatus(submissionId) {
  const id = String(submissionId || "").trim();
  if (!id) return null;

  const res = await dsFetchWithTimeout(
    `${API_URL}?api=daily_submission_status&submission_id=${encodeURIComponent(id)}`,
    { method: "GET", cache: "no-store" },
    DS_API_TIMEOUT_MS.status
  );

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "送出狀態讀取失敗");
  }

  return result.status || null;
}

async function fetchProjectOptions() {
  const res = await dsFetchWithTimeout(`${API_URL}?api=projects`, {
    method: "GET", cache: "no-store"
  }, DS_API_TIMEOUT_MS.normal);

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "專案清單讀取失敗");
  }

  return Array.isArray(result.projects) ? result.projects : [];
}

/**
 * 「下一步」的處理對象只列出同一專案、仍在處理中的阻塞／風險／變更。
 */
async function fetchOpenProjectEvents(projectName) {
  const name = String(projectName || "").trim();
  if (!name) return [];

  const res = await dsFetchWithTimeout(
    `${API_URL}?api=project_events&project_name=${encodeURIComponent(name)}`,
    { method: "GET", cache: "no-store" },
    DS_API_TIMEOUT_MS.normal
  );

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "處理中事件讀取失敗");
  }

  return Array.isArray(result.events) ? result.events : [];
}

async function validateSandblastPairsAPI(reportDate, ctnList) {
  const res = await dsFetchWithTimeout(`${API_URL}?api=ctn_check`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      date: reportDate || "",
      ctnList: Array.isArray(ctnList) ? ctnList : []
    })
  }, DS_API_TIMEOUT_MS.precheck);

  const result = await parseApiJsonResponse(res);

  return {
    duplicates: Array.isArray(result.duplicates) ? result.duplicates : [],
    duplicateDetails: Array.isArray(result.duplicateDetails) ? result.duplicateDetails : []
  };
}

/**
 * IQC 區域主檔：只回傳 IQC_Region_Master 中目前啟用的資料。
 * 前端依集束／散支再做欄位顯示過濾；送出時後端仍會再次驗證。
 */
async function fetchIqcRegions() {
  const res = await dsFetchWithTimeout(`${API_URL}?api=iqc_regions`, {
    method: "GET",
    cache: "no-store"
  }, DS_API_TIMEOUT_MS.master);

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "IQC 區域主檔讀取失敗");
  }

  return Array.isArray(result.regions) ? result.regions : [];
}

/**
 * IQC RT主檔：集束與散支分欄回傳。
 * 前端載入後做即時提示；正式寫入仍由 IqcLog 後端再次核對 RT list。
 */
async function fetchIqcRtMaster() {
  const res = await dsFetchWithTimeout(`${API_URL}?api=iqc_rt_master`, {
    method: "GET",
    cache: "no-store"
  }, DS_API_TIMEOUT_MS.master);

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "IQC RT主檔讀取失敗");
  }

  return {
    bundle: Array.isArray(result.bundle) ? result.bundle : [],
    loose: Array.isArray(result.loose) ? result.loose : [],
    bundleCount: Number(result.bundleCount || 0),
    looseCount: Number(result.looseCount || 0),
    generatedAt: String(result.generatedAt || "")
  };
}

/**
 * IQC「CTN」欄永久唯一＋運輸框容量檢查。
 *
 * - 集束 CTN 與散支鋼瓶 CTN 都做全歷史唯一性檢查。
 * - 運輸框架 CTN 可於後續獨立填報再次使用；同一次填報只能出現在一張散支卡片。
 */
async function validateIqcCtnsAPI(reportDate, ctnEntries, transportLoads) {
  const entries = (Array.isArray(ctnEntries) ? ctnEntries : [])
    .map(item => {
      if(item && typeof item === "object"){
        return {
          ctn:String(item.ctn || "").trim().toUpperCase(),
          role:String(item.role || "散支鋼瓶CTN").trim(),
          entityType:String(item.entityType || "BOTTLE").trim().toUpperCase(),
          label:String(item.label || "").trim()
        };
      }

      return {
        ctn:String(item || "").trim().toUpperCase(),
        role:"散支鋼瓶CTN",
        entityType:"BOTTLE",
        label:""
      };
    })
    .filter(item => !!item.ctn);

  const loads = (Array.isArray(transportLoads) ? transportLoads : [])
    .map(item => ({
      frameCtn:String(item && item.frameCtn || "").trim().toUpperCase(),
      bottleCtns:(Array.isArray(item && item.bottleCtns) ? item.bottleCtns : [])
        .map(ctn => String(ctn || "").trim().toUpperCase())
        .filter(Boolean),
      incomingCount:Number(item && item.incomingCount || 0),
      cardIndex:Number(item && item.cardIndex || 0),
      label:String(item && item.label || "").trim()
    }))
    .filter(item => !!item.frameCtn);

  const res = await dsFetchWithTimeout(`${API_URL}?api=iqc_ctn_check`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      date: reportDate || "",
      entries: entries,
      transportLoads: loads,
      ctnList: entries.map(item => item.ctn)
    })
  }, DS_API_TIMEOUT_MS.precheck);

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "IQC CTN／運輸框容量驗證失敗");
  }

  return {
    duplicates: Array.isArray(result.duplicates) ? result.duplicates : [],
    duplicateDetails: Array.isArray(result.duplicateDetails) ? result.duplicateDetails : [],
    frameCardConflicts: Array.isArray(result.frameCardConflicts) ? result.frameCardConflicts : [],
    capacityConflicts: Array.isArray(result.capacityConflicts) ? result.capacityConflicts : [],
    frameOccupancy: Array.isArray(result.frameOccupancy) ? result.frameOccupancy : []
  };
}
