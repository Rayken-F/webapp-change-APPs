# DS Backend Baseline Registry

Audit started: 2026-08-18
Status: WORKING BASELINE — backend Production source still requires direct Apps Script export/alignment.

## 1. Daily Report backend

Known non-regression requirements:
- `submission_id` idempotency
- Response write lock
- permanent `Daily_Submission_Log` receipt
- immediate receipt behavior
- ERP background queue / worker
- retry must not duplicate Response rows
- IQC writes to `IQC_Log`, not Response

Candidate historical source located in File Library:
- `DailyReportApi.txt`

Production verification required before marking current because multiple historical copies exist.

## 2. Grinding WIP backend

Production/stable target identity from handover:
`BETA_GRINDING_WIP_V2_0_7_WEAK_NETWORK_RECOVERY_20260813`

Frontend in GitHub currently identifies itself as v2.0.7 weak-network recovery.

Known backend modules from historical source set include:
- `Config_Beta`
- `WebApp_Beta`
- `WipGrindingApi_Beta`
- WIP state / transaction / frame / audit helpers

Core runtime sheets:
- `WIP_Current_State_BETA`
- `WIP_Transaction_Log_BETA`
- `Process_Batch_BETA`
- `Frame_Load_State_BETA`
- `Frame_Load_Detail_BETA`
- `Station_WIP_Summary_BETA`
- `CTN_Current_State_BETA`
- `WIP_Submission_Log_BETA`

Production backend still requires direct Apps Script export because File Library contains older/intermediate copies as well as the handover version declaration.

## 3. IQC Correction backend

Locked baseline identity:
`IQC_CORRECTION_V0_9_7_20260810`

Recent source set located:
- `Config_IQC`
- `IqcCorrectionApi`
- `IqcCorrectionEngine`

Authorization invariants:
- `active` controls DS login only
- `iqc_correction_enabled` controls IQC query/request access
- `iqc_approval_enabled` controls review/approve/close
- ADMIN/MANAGER role alone must not implicitly grant IQC approval

Production export/alignment is still required before exact SHA/version freeze.

## 4. ERP / customer API bridge

CUTOVER date:
`2026-08-14`

Rules:
- through 2026-08-13: Legacy Response only
- from 2026-08-14: Legacy Response UNION Grinding WIP
- Frame and Bottle are deduplicated independently
- `BUNDLE_LOT` -> customer Frame from `source_ctn`
- `BOTTLE` -> customer Bottle from `asset_ctn`
- internal transport frame must never be exported as customer Frame/Bottle
- official export point is `RELEASE_TO_SANDBLAST`

Phase 2 candidate code:
- `ErpSync_CUTOVER_20260814_v2_20260817`
- `GrindingErpCutoverWorker_v2_20260817`

Status: CANDIDATE / NOT YET PROMOTED TO PRODUCTION.

Do not modify as part of CUTOVER deployment:
- `ErpSyncQueue.gs`
- `DashboardApi.gs`
- customer API URL / token / JSON schema
- Grinding WIP frontend/backend

Promotion requires Preview match + worker setup + real RELEASE_TO_SANDBLAST field validation.

## 5. DS Workstation / Portal backend

Frontend route shell is already under GitHub version control.
Backend authentication / portal API source has not yet been frozen into a backend Production baseline.

SSO invariants:
- DS Workstation is the single login entry
- Dashboard is the only anonymous/public exception
- internal modules reuse DS session
- standalone internal access without a valid session must return/gate to DS login

## Baseline status legend

- LOCKED: exact Production code/version verified
- CANDIDATE: intended next Production code, not yet field-approved
- WORKING: source located but exact Production instance not yet verified
- UNKNOWN: direct Production export still required
