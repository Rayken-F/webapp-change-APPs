# OQC V1.0.1 / IQC RT type validation

Status: IQC backend version 16 deployed and verified on the original URL (patch `IQC-RT-TYPE-20260918-01`); frontend publication is tracked by this release PR. Field acceptance remains pending. Deployment evidence is recorded separately.

- OQC: remove duplicate top safe-area padding inside the workstation iframe, reduce the inventory title from 21px to 17px, remove only the OQC return link, and refresh the workstation context label when opening OQC.
- IQC: rename the existing correction action to 修改鋼瓶、集束CTN/RT and allow bundle selection. The existing request code, login/session protocol, permission checks, deployment URL and manifest remain compatible.
- The backend reads the original IQC kind and RT list at request creation and again within the approval transaction. Opposite-type, missing, conflicting and non-asset target RTs are rejected before business writes. Legacy RT-only requests use the same gate. A changed source RT/kind invalidates a pending request.
- Bundle correction updates IQC and matching bundle current-state / WIP source CTN and RT through the existing rollback transaction. LOT IDs, quantities, frame data and existing transaction history remain unchanged; new correction audit entries are appended. CTN-only changes retain the existing RT even when that old material number has been retired.
- Validation: 10 backend transaction tests (including rollback after a late failure and fresh checks on approval), 4 frontend selection tests, and 5 existing OQC production tests. The OQC header was inspected at 402×874 in a local browser preview. These are not real-account business write acceptance or iPhone device acceptance.

Live baseline: IQC Apps Script version 15, project `1Fm_UEk6eROo2AYk0Iv-G9vkoyHTvCGZov3UkeiaTWFq756lO__KY5iY5`. HEAD equals deployed source; complete source and original deployment metadata are preserved under `baselines/2026-09-18-v15/` in the private backend repository. No business data initialization is part of this release.

Acceptance: open the existing workstation → More → OQC and verify the compact header, no return arrow and correct context title. In IQC, verify the new action name, choose a loose cylinder then a bundle target RT, and reverse the roles; each request must be rejected without creating a correction or changing IQC. Test a same-type CTN/RT correction only on an intended business correction, follow the existing supervisor approval flow, and confirm the resulting IQC / related WIP values and audit. Existing unrelated workflows need not be retested.
