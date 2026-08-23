# RC v15 — IQC Hybrid Second Reader
Date: 2026-08-24
Status: TESTING ONLY / CLOUD BACKEND LOCKED UNTIL CONFIGURED

## Field decision
Local Tesseract OCR remains useful as a weak-network first reader, but repeated iPhone PWA field tests produced only ~2/5 reliable multi-photo batch completion in v14. Stop optimizing Tesseract as the Production primary engine.

Production-oriented target changes from "Local OCR >=95%" to:

- Hybrid system automatic completion >=95%
- suspicious/unverified data automatically written to IQC = 0

## v15 architecture
1. Honeywell photos are compressed and saved to IndexedDB first.
2. Local OCR is allowed once per batch.
3. If Local OCR + DS rules fully reconcile the batch, mark LOCAL_PASS and do not call Cloud.
4. If Local OCR fails, stalls, has missing RT, incomplete label counts, or other validation gaps, queue AI_PENDING.
5. AI_PENDING remains local during weak/no network.
6. When online and DS Portal Cloud OCR RC reports ready, jobs are sent one at a time.
7. Cloud result is stored as cloudOcrText; localOcrText is preserved. RC combined ocrText is re-evaluated by the existing RT + status + plant grouping and DS rules.
8. Human review remains required before formal IQC creation.

## Cost / duplicate-call protection
- Each photo uses a stable job id: IQCAI_<batchId>_<photoId>.
- Backend Receipt is the source of idempotency. Retrying an already DONE job returns the saved text and must not call Google Vision again.
- Frontend does not store API keys.
- Cloud upload is disabled until the DS Portal backend candidate is deployed and Script Properties explicitly enable it.

## Weak-network behavior
- Local photo survives in IndexedDB.
- AI_PENDING does not block the next field batch.
- Sync occurs sequentially on online/manual retry; no parallel image uploads.
- Large Base64 strings exist only during one request and references are released afterward.

## Local OCR memory behavior
v14 memory protections remain:
- preview Blob URLs are revoked after load
- OCR worker is not allowed to accumulate across unlimited work
- Hybrid stops repeated manual Local OCR attempts for the same batch

## Headerless continuation photo
Existing meta grouping keeps the conservative continuation rule: CTNs before a header may attach to the immediately preceding incomplete RT only when sequential context makes it unambiguous. It must never invent an RT when multiple destinations are plausible.

## Backend candidates
Private staging:
- DS-Portal/candidates/IqcCloudVisionSecondReader_RC_20260824.gs
- DS-Portal/candidates/IqcCloudVisionSecondReader_INTEGRATION_PATCH_20260824.txt

Backend defaults to disabled and no API key is committed.

## Current RC state
The frontend v15 queue is active, but Google Cloud Vision is NOT live until all of the following are done:
1. Google Cloud Billing is configured.
2. Cloud Vision API is enabled and an API key is created/restricted.
3. DS Portal RC candidate is added/deployed.
4. API key is stored only in Apps Script Script Properties.
5. DS_PORTAL_IQC_CLOUD_VISION_ENABLED is explicitly set to true.

Until then, AI_PENDING must remain queued locally and show Cloud waiting/not enabled.

## Rollback
Frontend rollback:
- restore index.html to v14
- remove script includes:
  - iqc-hybrid-second-reader-v15.js
  - iqc-hybrid-stuck-guard-v15.js
- the separate IndexedDB `ds_iqc_hybrid_rc_v15` can remain harmlessly or be cleared later.

Backend fast rollback:
- set DS_PORTAL_IQC_CLOUD_VISION_ENABLED=false

Backend full rollback:
- remove two RC doPost dispatch lines
- remove/disable candidate script
- retain IQC_AI_Receipt_RC for audit

No formal IQC_Log, Grinding, or Production DS App changes are required for rollback.
