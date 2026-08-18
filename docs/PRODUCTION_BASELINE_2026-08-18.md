# DS Production Baseline｜2026-08-18

> 建立目的：先鎖定目前 GitHub Pages 前端的實際 Production 快照，不修改任何既有前端檔案、不改 Pages 路徑、不影響現場。

## 1. Baseline Source

- Repository: `Rayken-F/webapp-change-APPs`
- Production branch: `main`
- Snapshot source commit: `dabfeeabcdb2a78c1a3e841d0d5ad86fad978374`
- Audit branch: `baseline/2026-08-18-production-audit`
- Baseline date: `2026-08-18`

## 2. Current Frontend Modules

| Path | System | Current observed state |
|---|---|---|
| `ds-app/` | DS Workstation / 鼎世工作台 | Production entry shell |
| `ds-report-pwa/` | 正式日報系統輸入端 | Production |
| `ds-report-pwa-beta/` | Grinding WIP | Title identifies BETA v2.0.7 |
| `DS-IQC-WIP/` | IQC 異常處理台 | Production frontend |
| `ds-system-diagnostics/` | DS System Diagnostics | Maintenance / diagnostics tool |

## 3. Current Routing Observed in `ds-app/config.js`

- Daily Report -> `../ds-report-pwa/`
- Grinding WIP -> `../ds-report-pwa-beta/`
- IQC Correction -> `../DS-IQC-WIP/`
- Dashboard -> public Apps Script URL

Dashboard remains the public exception; internal modules are routed through the DS Workstation gate.

## 4. Version Observations / Open Questions

### DS App Shell

`ds-app/config.js` currently reports:

`CLIENT_VERSION: DS_APP_SHELL_V1_3_20260816`

However, handover documentation states the latest Shell fix line reached `v1.4.3`.

**Status: VERSION_STRING_MISMATCH / NEEDS CODE-LEVEL VERIFICATION**

Do not overwrite GitHub based only on either label. Verify actual code behavior and commit history first.

### Grinding WIP

`ds-report-pwa-beta/index.html` title currently identifies:

`Grinding WIP BETA v2.0.7`

This matches the handover stable baseline naming for Grinding WIP.

### IQC Correction

The frontend is routed through the DS Workstation gate and includes SSO-related files. Handover baseline identifies backend/system baseline as:

`IQC_CORRECTION_V0_9_7_20260810`

GitHub frontend should be treated as a deployed frontend snapshot until backend alignment is completed.

## 5. Non-Regression Rules To Preserve

### Daily Report
- submission_id idempotency
- Response write lock
- Daily_Submission_Log permanent receipt
- immediate receipt behavior
- ERP background queue / worker
- retry must not duplicate writes

### IQC
- IQC writes to IQC_Log, not Response
- does not refresh Dashboard
- does not enter legacy ERP worker
- CTN / RT validation and uppercase status rules must not regress

### Grinding WIP
- does not directly modify IQC_Log
- Current State and Transaction Log remain separated
- `RELEASE_TO_SANDBLAST` is the formal customer ERP export point
- internal transport frame CTN must never be exported as customer Frame/Bottle

### Permissions
- `active` is the DS Workstation login master switch
- `xxx_enabled` controls module access only
- `iqc_correction_enabled` must not gate overall login
- `iqc_approval_enabled` controls IQC approval authority

## 6. Current P0

The current highest-priority unfinished integration is:

**CUTOVER_DATE = 2026-08-14 Grinding WIP -> ERP_CTN_EXPORT -> customer API formal field validation**

The Phase 2 code was produced previously, but must not be marked Production until formal deployment and an actual `RELEASE_TO_SANDBLAST` field validation passes.

## 7. Governance Rule From This Baseline Forward

1. `main` represents current production frontend only.
2. New work should not be edited directly on `main`.
3. Create a task / staging branch for changes.
4. Compare changes before deployment.
5. User performs field validation for production-impacting changes.
6. Only after explicit PASS should a candidate be treated as Production.
7. Keep a rollback point for every Production promotion.

## 8. Remaining Baseline Gap

The GitHub repository currently represents mainly the frontend layer. The Google Apps Script backend baseline still needs to be aligned, especially:

- DailyReportApi.gs
- ErpSync.gs
- ErpSyncQueue.gs
- DashboardApi.gs
- Grinding backend
- IQC Correction backend
- DS Workstation / portal backend

Until backend alignment is completed, this document is the **Frontend Production Baseline**, not yet the complete DS Platform Production Baseline.
