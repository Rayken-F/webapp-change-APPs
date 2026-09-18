# OQC V1.0 production candidate

Status: candidate only. Do not merge the portal entry until the existing OQC spreadsheet has been backed up, initialized and verified with the production backend.

- Source: accepted DEMO G1.2, frontend `6f6981495c9fb72f1d6e142ce13d17fce5820503` and Google backend version 8.
- DS Workstation → More → OQC inventory scanning / packing uses `System_Access_Master.stamp_shipping_enabled`. The original `inventory_enabled` reservation remains separate.
- Backend checks the server-returned Portal permission on every authenticated request. ADMIN and the DEMO allowlist do not override an unchecked permission. OQC permission includes read-only IQC and RT lookup; it does not grant IQC corrections or approval.
- The existing Apps Script endpoint and spreadsheet tables remain in place. Production has a distinct request environment and local database; old DEMO requests are rejected and old pending operations are not imported.
- The original five data-table layouts, RT logic, command IDs, retry behavior and packing receipts are retained. Packing still does not mean shipped or quality released.

Deployment order: back up current code → deploy production backend with the old sheet guard still blocking production → mark the original sheet in maintenance → acquire/release the backend script lock via the health check to drain old writes → back up/verify all five tables → atomically clear their data rows and set the production guard → verify empty tables and production health → release the portal/frontend → verify granted and denied access.

Data initialization never clears IQC, RT list, System_Access_Master, original headers, formatting or unrelated sheets. Retain the private data backup and old Google version for recovery. Do not restore an old backend after production writes without reconciling those writes.

Automated checks cover production environment separation, shell permission gating, backend denial, stale DEMO requests, guard/lock behavior and a synthetic RT-change-to-packing receipt. They do not replace live permission and production write/readback verification.
