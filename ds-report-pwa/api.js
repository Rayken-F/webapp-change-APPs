// 版本43：日報輸入端專用 deployment
const API_URL = "https://script.google.com/macros/s/AKfycbwYjPR-mHy_UCRAAsvU84-3T_MMQcfKHX9PSR8Da7E2gQq3xVEcK0Fnz0JvrHaIHpem/exec";

async function submitDailyReportAPI(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  if (!result.ok) {
    throw new Error(result.message || "送出失敗");
  }

  return result;
}

async function fetchProjectOptions() {
  const res = await fetch(`${API_URL}?api=projects`, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  const result = await res.json();

  if (!res.ok || !result.ok) {
    throw new Error(result.message || "專案清單讀取失敗");
  }

  return Array.isArray(result.projects) ? result.projects : [];
}
