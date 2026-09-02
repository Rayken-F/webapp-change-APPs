# OQC 庫存掃描 RC V0.1

## 定位

此版本用於驗證「掃描鋼瓶 CTN → IQC 反查 RT → 依 RT 建立 OQC 待檢批次」的現場操作流程。

## 已包含

- 沿用 DS／IQC session，不建立獨立帳號。
- 只接受正式 7 碼鋼瓶 CTN。
- 由 IQC lookup 取得 RT、鋼瓶狀態及所屬運輸框。
- 同一 RT 自動加入既有 OPEN 批次；無批次時自動建立。
- 支援分次掃描、關閉頁面後繼續。
- IndexedDB 裝置持久化，不是記憶體草稿。
- 同一 CTN 防重複。
- 鎖定目前 RT。
- 標籤總量可填、可留空。
- 左滑或「•••」露出「作廢誤掃」。
- 作廢採軟刪除，事件歷史永久保留於 RC 本機資料庫。
- 5 秒復原。
- 完成掃描批次與 RC 重新開放。
- 匯出 RC JSON、清除本機 RC 測試資料。

## 刻意未包含

- 尚未寫入正式 OQC Google Sheet。
- 尚未跨裝置同步。
- 尚未做 OQC PASS／HOLD／REWORK。
- 尚未支援集束。
- 尚未接 SAP／ERP 除帳。
- 尚未加入正式 DS 工作台選單。

## 安全邊界

此 RC 只讀取 IQC lookup；不修改 IQC_Log、Grinding、ERP、Response 或 Timestamp。
