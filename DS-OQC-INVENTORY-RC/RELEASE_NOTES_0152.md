# OQC RC V0.1.5.2 — RT 轉出空批次收尾

## 範圍

僅更新 OQC RC 的 RT 更改狀態程式及載入版本；保留 V0.1.5.1 的兩行 CTN／狀態／RT 畫面。測試分支使用 DS-OQC-INVENTORY-RC，Pages 發布副本使用 DS-OQC-INVENTORY-RC-FAST。未修改正式 DS 工作台、IQC、Grinding、Timestamp、ERP 或 Apps Script。

## 行為

- 原批次鋼瓶全部轉至新 RT：原批次設為 ARCHIVED_RT_CHANGE，退出開放清單、目前批次下拉及開放批次計數；目前批次改到新 RT 批次。
- 只轉走部分鋼瓶：原批次保持 OPEN，未選取鋼瓶留在原批次。
- 新 RT 已有 OPEN 批次時沿用，不重複建立。封存的舊編號不重用。
- 原批次及事件保留在 IndexedDB，可隨 RC JSON 匯出；不硬刪資料、不回寫 IQC。
- 頁面初始化／重新整理時，依既有 BATCH_RT_CHANGE_OUT 事件整理旧版已全數轉出的空批次；重跑不重複追加封存事件。
- 沒有 RT 轉出證據的空批次、只因作廢而清空的批次、COMPLETED 批次不會被此修正封存。
- RT 更改使用同一 IndexedDB readwrite transaction 寫入 items、batches、events、meta；交易完成後才更新畫面。交易前重新檢查所選鋼瓶及來源批次狀態。
- RT 查詢尚未完成時暫不允許套用 RT 更改；套用中避免本頁掃描／作廢／完成批次競爭。

## 已執行驗證

Node.js 語法檢查通過。Node.js VM + 模擬 IndexedDB 交易的 11 項邏輯測試通過：全數轉出、部分轉出、合併既有目標、舊空批次整理與排除條件、重載冪等、多次轉換及回原 RT、無效／相同 RT、待查詢互斥、過期選取、注入事件儲存失敗、重複點擊（部分情境合併於同一測項）。

此為邏輯模擬，不等於瀏覽器真實 IndexedDB 整合或 iPhone／Honeywell 實機 UAT。當前執行環境的 Chromium 導航受管理政策阻擋，未宣稱已完成瀏覽器端整合測試。

## RC 與正式寫入界線

- 現在掃描及 RT 更改均保存於同裝置的 ds_oqc_inventory_rc_v1 IndexedDB。
- 「完成掃描批次」目前只將本機批次改成 COMPLETED，不送正式 OQC Sheet，也不等於 OQC PASS。
- 新 RT 目前僅有 5–10 碼數字格式檢查，尚非 RT 主檔存在性驗證。
- 待後續 RC 後端階段：獨立測試 Sheet、前後端權限、伺服器批次編號、RT 主檔驗證、送出冪等／收據確認、跨裝置續作、正式 OQC 與 IQC 唯讀界線驗收。
