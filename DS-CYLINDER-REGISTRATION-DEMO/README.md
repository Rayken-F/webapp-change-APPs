# 鋼瓶註冊系統 — 本機 DEMO 0.7

Build: `CYL-REG-DEMO-0.7-20261106`

新鋼瓶註冊、註冊紙本辨識、checklist生成。獨立 DEMO；照片、草稿與人工確認進度保存在此瀏覽器，不呼叫正式註冊或 IQC 業務 API。

## 本版變更

- CTN：固定 7 碼，1–2 碼英文、3–4 碼數字、5–6 碼英文，第 7 碼可英文或數字。
- 鋼號：第 3 碼英文，其餘數字，不指定固定總長度；保留前導 0。
- 一般寫法的 0 即可。辨識 worker 不再載入斜線 0 模組，也不再要求找到斜線才能接受 0。舊模組僅保留作歷史回歸，未在現行頁面執行。
- 新增 USB／藍牙鍵盤式條碼掃描器 CTN 輸入。掃描值優先，OCR 只補未鎖定的欄位；人工修改也分 CTN／鋼號各自保護。
- 支援依紙本列序連掃與指定列補掃；重複及格式錯誤攔截，替換不同的既有 CTN 須確認。掃描成功不等於 CTN／鋼號配對已核對。

## 操作與驗收

1. 先匯出既有草稿備份，再重新整理頁面確認版本 0.7。舊版 0.1～0.6.1 草稿仍可讀回；文字、照片、幾何資料保留。不符新格式的舊值保持原文，但取消核對／完成資格，不猜補編號。
2. 選擇 JPEG／PNG／WebP 紙本（20 MB 以下）。載入後確認自動校正預覽；找不到格線時調整 CTN＋鋼號資料區四角，排除標題及底部備註。預設 16 列、最多 60 列。
3. 按「建立校對列」。沒有照片時可用「補一列」手動建立配對。
4. 在「掃描器輸入 CTN」選擇對應列，按「開始掃描」。掃描器須為鍵盤輸入模式，輸入末尾可用 Enter／Tab；沒有結束鍵時按「填入此列」。預設成功後切到下一列，可取消勾選改為固定指定列。
5. 先掃同一個 CTN 到另一列，應提示重複且不前進；掃錯格式也應保留目前列。選回指定列更換 CTN 時，取消應保留原值，確認才更換。最後一列不自動新增空列。此頁不讀取相機、序列埠或特定廠牌 SDK。
6. 按「辨識未鎖定的欄位」：已掃描 CTN 保留，仍辨識鋼號。人工修改的單一欄位及已核對整列均不覆寫。即使辨識已在等待，後續掃描／人工修改仍優先於遲到的辨識回應。
7. 逐列對照原圖，確認 CTN／鋼號配對。低分、候選分歧或格式錯誤用黃底提示；CTN 最後一碼有分歧會另提示。沒有黃底也須人工核對。兩欄空值、錯誤格式、重複編號均阻擋確認。舊紙本尾碼可使用人員確認的共用前綴補全。
8. 填寫本批 RT（最多 30 碼英數字／連字號），全列核對後進入逐支註冊。RT 固定於上方；每次一組 CTN／鋼號 Code 128。左下完成前進下一支，右下人工修改後即時更新有效條碼；錯誤／重複值不產生可用條碼。
9. 重整後檢查掃描來源、配對與完成進度仍存在。修改 RT 需重新完成整批，改 CTN／鋼號或裁圖需重新確認相關列。
10. 全部完成本機確認後才可輸出暫定 checklist。正式範本仍待下一階段提供。CSV 編號欄請以文字匯入 Excel，避免前導 0 消失。

## 辨識處理與限制

本版沒有重新訓練模型權重，也沒有啟用雲端辨識。使用既有 PaddleOCR 主要模型與獨立複核模型，兩欄都讀原圖與藍筆去線圖；黑筆改用原圖與加白邊圖。CTN 即使初次格式正確也複核，因為第 7 碼英數都可能合法。

格式規則優先排序模型實際讀出的候選。另從同一字形的 CTC 機率中保留前五個英數候選：不符合該位置時，僅接受分數至少 0.05、且至少為原字分數 15% 的可用字形候選。此類結果一定保留原候選並標記待核對，不插字、不刪字、不依固定樣本答案補前綴。這些門檻尚未用不同書寫人校準，不代表已測得的正確率。

多／少碼、斷筆、連筆、陰影、裁圖不完整及字形差異仍可能誤讀。鋼號沒有固定長度，不能靠長度判斷是否漏字；CTN 最後一碼沒有固定英數類別，必須依圖像證據或掃描器。掃描器減少 OCR 字形誤讀，但仍可能掃到別支或選錯紙本列。

照片及編號不會上傳。首次只下載模型與執行元件，兩模型合計約 29 MB。專用 worker 使用 ONNX Runtime Web 1.21.0 WASM；初始化上限 180 秒、單欄 45 秒，停止會中止 worker 並保留已完成結果。兩模型複核可能比原單模型路徑慢，iPhone／現場耗時未量測。

- 主模型：`en_PP-OCRv5_mobile_rec_onnx`，revision `3fafbc3b5dcf93dd72add9f48368be8a3a2cd33b`，7,848,423 bytes，SHA-256 `b5f833dfc5d0eb71da397b4efa06ebeee9b431b690a47d6af40d77d8eabc557f`。
- 複核模型：`PP-OCRv6_small_rec_onnx`，revision `b8f84f0b80c529de40b4fbb3544b84fa7233a513`，21,159,378 bytes，SHA-256 `5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634`。字典非 ASCII 輸出保留為無效字元，不默默刪除。
- 下載及快取讀回都檢查模型 SHA-256。模型與字典 Apache-2.0，見 `MODEL-LICENSE.txt`。
- 條碼元件 JsBarcode 3.11.6 Code 128，MIT，見 `vendor/JsBarcode-LICENSE.txt`。元件 SHA-256 `fce0a5e6129fde04b2e5f8a503b32a3d6d4b0116263c5369336ecccad57bf334`。
- IndexedDB 名稱維持 `ds-cylinder-registration-demo-v1`，沒有清空草稿。僅單張紙本／單一草稿，跨裝置與多分頁同步未實作。

來源：[PaddleOCR 官方文字辨識說明](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/module_usage/text_recognition.en.md)、[主模型](https://huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec_onnx)、[複核模型](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx)、[ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)。

## 本版已執行檢查

- 53 項單元／worker 測試，包含格式篩選、保護掃描／人工值、普通 0、CTN 最後一碼分歧、舊斜線函式隔離及校正回歸。
- 87 項獨立瀏覽器檢查：27 項既有流程、21 項逐支條碼／checklist、20 項校正、19 項新掃描流程。使用合成資料、模擬 Enter／Tab 掃描，不是現場掃描器驗收。
- 實際 WASM 及兩模型跑過 4 組合成字樣：普通 0、真實 R／6、兩種鋼號長度結果相符。這是執行流程測試，不是手寫正確率評估。
- 桌面與 402×874 手機視窗版面檢查無橫向溢出。iPhone Safari、實體掃描器設定與不同書寫人的普通 0 紙本，仍待現場驗收。

```sh
node --test tests/cylinder-registration.test.cjs tests/cylinder-handwriting.test.cjs tests/cylinder-slashed-zero.test.cjs tests/cylinder-rules-scanner.test.cjs tests/cylinder-alignment.test.cjs
node tests/cylinder-registration.browser.cjs
node tests/cylinder-registration-flow.browser.cjs
node tests/cylinder-alignment.browser.cjs
node tests/cylinder-scanner.browser.cjs
```

瀏覽器測試可透過 `PLAYWRIGHT_MODULE`、`EDGE_EXECUTABLE`、`REG_ARTIFACTS` 指定環境及產物。原始照片、既有實際辨識結果與本次私人測試證據不提交公開 GitHub。
