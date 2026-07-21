// 自動噴砂 CTN 流轉 BETA｜第三階段 API
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
    throw new Error("尚未設定 BETA_API_URL，請先部署第三階段 Apps Script。");
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

async function submitBetaOperations(payload) {
  if (!isBetaApiConfigured()) {
    throw new Error("尚未設定 BETA_API_URL，無法送出第三階段交易。");
  }

  const requestBody = Object.assign({}, payload || {}, {
    api: "submit_operations",
    token: BETA_API_TOKEN
  });

  // 使用 text/plain 避免跨網域預檢；後端仍以 JSON 解析內容。
  const response = await fetch(BETA_API_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(requestBody)
  });

  return parseBetaApiJsonResponse(response);
}
