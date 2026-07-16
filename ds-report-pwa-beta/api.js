// 自動噴砂 CTN 流轉 BETA｜第二階段唯讀 API
// 部署獨立 Apps Script Web App 後，將下方網址替換成新的 /exec URL。
const BETA_API_URL = "https://script.google.com/macros/s/AKfycbw3Xg0ev3zoTO-WFfe7sTIUlr6wF4P-qAgZEZUF3uUhioT63bQYT-9QRgZqLU0IhB6G/exec";
const BETA_API_TOKEN = "-M-yiaurzifieaJyYS4838MCYiuDh4wB";

function isBetaApiConfigured() {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(
    String(BETA_API_URL || "").trim()
  );
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
    throw new Error(data && data.message ? data.message : "BETA API 請求失敗");
  }

  return data;
}

async function fetchBetaApiHealth() {
  if (!isBetaApiConfigured()) {
    throw new Error("尚未設定 BETA_API_URL");
  }

  const response = await fetch(`${BETA_API_URL}?api=health`, {
    method: "GET",
    cache: "no-store"
  });

  return parseBetaApiJsonResponse(response);
}

async function fetchBetaCtnLookup(ctn) {
  if (!isBetaApiConfigured()) {
    throw new Error("尚未設定 BETA_API_URL，請先部署第二階段唯讀 Apps Script 並更新 api.js。");
  }

  const normalizedCtn = String(ctn || "").trim().toUpperCase();
  const url =
    `${BETA_API_URL}?api=ctn_lookup` +
    `&ctn=${encodeURIComponent(normalizedCtn)}` +
    `&token=${encodeURIComponent(BETA_API_TOKEN)}`;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store"
  });

  return parseBetaApiJsonResponse(response);
}
