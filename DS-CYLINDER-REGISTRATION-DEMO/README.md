# 鋼瓶註冊系統 — 本機 DEMO 0.2

Build: `CYL-REG-DEMO-0.2-20261021`

新鋼瓶註冊、註冊紙本辨識、checklist生成。

這是獨立、單張紙本的流程 DEMO，不是正式註冊服務。沒有登入正式系統、呼叫業務 API、更新 IQC 或寫入註冊資料庫。沒有雲端辨識功能；照片及草稿保存在此瀏覽器專用 IndexedDB，使用者可匯出／匯入 JSON 備份。原始測試照片與實際候選結果不在公開儲存庫。

## 操作

1. 選擇 JPEG／PNG／WebP 紙本照片（20 MB 以下）。
2. 確認資料列數與 CTN 分欄位置。可依「左上、右上、右下、左下」點選 CTN／鋼號兩欄的資料區；不包含表頭、RT 欄或備註區。「套用 DEMO 紙本版型」只有幾何位置，不含預填的辨識答案。
3. 按「建立校對列」。每張最多 60 列，保持由上到下的來源列對應。
4. 可直接輸入，或按「試辨識未修改的列」。放大原列核對完整 CTN 與鋼號；手動補列處理漏列。OCR 不覆蓋人工修改或已核對的值。
5. 舊紙本只填尾碼時，由人員填寫共用前綴後按「確認並補全尾碼」。只處理 CTN 尾 3 碼與鋼號尾 6 碼，完整值不重複補全，變更列須重新核對。
6. 每列勾選核對完成。空值、非 7 碼 CTN、異常字元、重複 CTN／鋼號阻擋輸出。改字或變更裁圖會取消相關核對標記。
7. 產生 checklist 預覽、列印／存成 PDF，或下載 CSV。預設欄位為序號、CTN、鋼號、紙本列、現場註冊確認；CSV 另有核對狀態。這是暫定清單，不是紙本底部維修勾選表，也不代表已完成註冊。

## 辨識界線

- DEMO 0.1 的 Tesseract 印刷引擎已由使用者回報辨識驗收失敗。本版替換成支援英文手寫的 PaddleOCR `en_PP-OCRv5_mobile_rec`，不再載入 IQC 的辨識核心；正式 IQC 原碼不變。
- 原圖與藍筆去除格線／相鄰列碎筆後各辨識一次，保留不同候選。格式相符優先，再依模型分數選候選；分數不是正確率，兩次相同也不能視為正確。黑筆僅走原圖，仍待不同紙本測試。
- ONNX Runtime Web 1.21.0 在專用 worker 的 WASM 本機推論。模型 7,848,423 bytes，固定官方 revision `3fafbc3b5dcf93dd72add9f48368be8a3a2cd33b`，下載及快取讀回皆驗證 SHA-256。第一次從 Hugging Face 下載模型、jsDelivr 下載執行元件；只有 GET，沒有傳圖。初始化上限 180 秒、單欄上限 45 秒，停止會終止 worker，保留已完成列與手動修改。
- 實際 16 列紙本已在桌面 Chromium 跑過；有明顯改善，但第 1、2、7、11 列仍見 CTN 或鋼號誤讀。尚無使用者確認的完整答案表，不能公布正式正確率，也未達自動註冊標準。所有候選都待人工核對；原始照片、結果及對照表保存在私人驗證目錄。
- 完整填寫每格能消除「省略前綴」的不確定性，仍不能消除手寫字形差異。沒有自動把 O 改成 0、I 改成 1，也沒有硬編碼範例正確答案。
- 目前依四角與等分列建立裁圖；保留底部邊界供查看跨線筆畫。嚴重彎曲、跨列或不同高度表格仍可能切錯，需人工重新框選／補列。未實作自動表格偵測或任意表格辨識。
- CTN 暫沿用既有 7 碼格式。鋼號不指定固定長度，必須由人員確認完整值。只有單一草稿，換照片前會提醒先備份。多裝置／多分頁同步及正式帳號權限未接入。
- DEMO 0.1 舊草稿可讀回與匯入，人工修改／已核對值不被新辨識覆蓋。模型更新不會清除 IndexedDB。
- CSV 檔案內容保留前導 0，但 Excel 自動推斷可能轉為數字；請以文字欄匯入，或使用列印版。
- iPhone Safari、不同書寫人及新「完整填寫」照片仍待現場驗收；桌面 Chromium 手機視窗測試不代表 iPhone 實測。

## 驗證

```sh
node --test tests/cylinder-registration.test.cjs tests/cylinder-handwriting.test.cjs
node tests/cylinder-registration.browser.cjs
```

瀏覽器測試可用 `PLAYWRIGHT_MODULE`、`EDGE_EXECUTABLE`、`REG_ARTIFACTS` 指定已安裝執行環境及產物目錄。包含本機保存、重整、補列、重複阻擋、前綴、停止、下載、原圖縮放與關閉還原捲動位置。真實紙本基準與照片另存私人驗證目錄，不混同合成測試。

來源：[PaddleOCR 英文手寫模型說明](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/module_usage/text_recognition.en.md)、[官方 ONNX 權重](https://huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec_onnx)、[ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)。模型與字典採 Apache-2.0，參閱 `MODEL-LICENSE.txt`。沒有啟用雲端辨識。
