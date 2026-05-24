// 版本43：日報輸入端獨立 deployment
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

async function fetchProjectOptionsAPI() {
  const url = `${API_URL}?api=projects`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store"
  });

  let result = null;
  try {
    result = await res.json();
  } catch (err) {
    throw new Error("專案清單回傳格式錯誤");
  }

  if (!res.ok || !result || !result.ok) {
    throw new Error((result && result.message) || "專案清單讀取失敗");
  }

  return Array.isArray(result.items) ? result.items : [];
}
