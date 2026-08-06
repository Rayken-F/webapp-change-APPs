// 43版：日報輸入端專用 deployment
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
    duplicates: Array.isArray(result.duplicates) ? result.duplicates : []
  };
}