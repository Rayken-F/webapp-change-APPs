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

/**
 * IQC RT主檔：集束與散支分欄回傳。
 * 前端載入後做即時提示；正式寫入仍由 IqcLog 後端再次核對 RT list。
 */
async function fetchIqcRtMaster() {
  const res = await fetch(`${API_URL}?api=iqc_rt_master`, {
    method: "GET",
    cache: "no-store"
  });

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

  const res = await fetch(`${API_URL}?api=iqc_ctn_check`, {
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
  });

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
