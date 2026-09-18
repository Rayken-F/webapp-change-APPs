# OQC V1.0 release — OQC-PROD-20260918-01

Google backend version 9 is deployed to the original endpoint. The original OQC spreadsheet was backed up and verified before initialization on 2026-09-18. All five data tables were read back empty, with original headers, tabs and formatting preserved. The seven requested users' OQC permission flags were enabled and read back. Frontend publication uses this repository's Pages deployment after merge; browser acceptance of the new production entry and permission integration is still pending.

- Source: accepted DEMO G1.2, frontend `6f6981495c9fb72f1d6e142ce13d17fce5820503` and Google backend version 8.
- DS Workstation → More → OQC inventory scanning / packing uses `System_Access_Master.stamp_shipping_enabled`. The original `inventory_enabled` reservation remains separate.
- Backend checks the server-returned Portal permission on every authenticated request. ADMIN and the DEMO allowlist do not override an unchecked permission. OQC permission includes read-only IQC and RT lookup; it does not grant IQC corrections or approval.
- The existing Apps Script endpoint and spreadsheet tables remain in place. Production has a distinct request environment and local database; old DEMO requests are rejected and old pending operations are not imported.
- The original five data-table layouts, RT logic, command IDs, retry behavior and packing receipts are retained. Packing still does not mean shipped or quality released.

Deployment order: back up current code → deploy production backend with the old sheet guard still blocking production → mark the original sheet in maintenance → acquire/release the backend script lock via the health check to drain old writes → back up/verify all five tables → atomically clear their data rows and set the production guard → verify empty tables and production health → release the portal/frontend → verify granted and denied access.

Data initialization never clears IQC, RT list, System_Access_Master, original headers, formatting or unrelated sheets. Retain the private data backup and old Google version for recovery. Do not restore an old backend after production writes without reconciling those writes.

The existing 56 G1/G1.2 checks and 10 production-specific checks passed. Four additional migration checks cover wrong-target/guard rejection, verified-backup requirements, data changes since backup, and clearing only data values while preserving formats. Automated backend permission tests and the synthetic RT-change-to-packing receipt are not live account or production write/readback verification.

Field acceptance: refresh DS Workstation, open More → OQC inventory scanning / packing, and confirm OQC V1.0. Verify an enabled account can enter, an unchecked account is refused, no DEMO history/pending operations appear, and one real CTN can be saved and read back after refresh in the original spreadsheet. Previously accepted RT behavior and existing packing acceptance remain recorded; this rollout does not claim a new completed packing batch was tested.
