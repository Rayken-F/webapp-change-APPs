//版本43 沒問題的板
const API_URL = "https://script.google.com/macros/s/AKfycbwYjPR-mHy_UCRAAsvU84-3T_MMQcfKHX9PSR8Da7E2gQq3xVEcK0Fnz0JvrHaIHpem/exec";
//版本59(與AP的api共用所以這是預備方案，目前不啟動)
//const API_URL = "https://script.google.com/macros/s/AKfycbxtef9i0HrL15Y0JhBPvfr_OPC9zZFMW5zC3vrKzDZg4AWVNDniOCc5LcMSRscuR-n6/exec";

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
