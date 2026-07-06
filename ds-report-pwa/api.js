// 日報輸入端 Apps Script Web App（固定 URL；更新部署版本後 URL 不變）
const API_URL = "https://script.google.com/macros/s/AKfycbwYjPR-mHy_UCRAAsvU84-3T_MMQcfKHX9PSR8Da7E2gQq3xVEcK0Fnz0JvrHaIHpem/exec";

async function parseApiJsonResponse(res) {
  const text = await res.text();
  let data = null;

  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("API 回傳格式錯誤");
  }

  if (!res.ok) {
    throw new Error(data && data.message ? data.message : "API 請求失敗");
  }

  return data;
}

async function submitDailyReportAPI(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "送出失敗");
  }

  return result;
}

/**
 * 讀取目前日報送出的真實處理狀態。
 * 只有後端偵測到 Response 寫入鎖被占用時，才會回傳 state=queued。
 */
async function fetchDailySubmissionStatus(submissionId) {
  const id = String(submissionId || "").trim();
  if (!id) return null;

  const res = await fetch(
    `${API_URL}?api=daily_submission_status&submission_id=${encodeURIComponent(id)}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "送出狀態讀取失敗");
  }

  return result.status || null;
}

async function fetchProjectOptions() {
  const res = await fetch(`${API_URL}?api=projects`, {
    method: "GET"
  });

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

  const res = await fetch(
    `${API_URL}?api=project_events&project_name=${encodeURIComponent(name)}`,
    { method: "GET" }
  );

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "處理中事件讀取失敗");
  }

  return Array.isArray(result.events) ? result.events : [];
}

async function validateSandblastPairsAPI(reportDate, ctnList) {
  const res = await fetch(`${API_URL}?api=ctn_check`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      date: reportDate || "",
      ctnList: Array.isArray(ctnList) ? ctnList : []
    })
  });

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "CTN 重複驗證失敗");
  }

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
  const res = await fetch(`${API_URL}?api=iqc_regions`, {
    method: "GET",
    cache: "no-store"
  });

  const result = await parseApiJsonResponse(res);

  if (!result.ok) {
    throw new Error(result.message || "IQC 區域主檔讀取失敗");
  }

  return Array.isArray(result.regions) ? result.regions : [];
}
