# OQC DEMO V0.2.2 — real CTN acceptance entry and non-destructive recovery

Build: 20260910-real-entry01. Scope: isolated DS-OQC-SHIPPING-DEMO only; not production promotion.

## Confirmed root cause
The supplied diagnostic is V0.2.1, mode SIM, endpointConfigured false, tokenPresent false, with no real API call. Two active CTNs repeatedly received fixture-miss results. Three other captures were already voided. This evidence does not establish whether those CTNs have IQC records or what RT they should have.

## Fix
Default entry, including old unqualified links and saved SIM preferences, now selects RC real acceptance. Simulation requires explicit mode=sim. Real entry never falls back to synthetic IQC or simulated receipts. Missing endpoint/session produces a connection gate before new scanning, not a later fictitious lookup failure. Synthetic sample buttons are hidden on real entry. Endpoint setup is located above scanning.

A successful environment health check precedes sending DS credentials. The verified endpoint is retained if login has expired, without marking the session authenticated. Retry can then resume after DS login. Wrong environment, permission rejection and actual upstream errors are not disguised as success or NOT_FOUND.

## Existing data
Same database and per-endpoint storage keys. Old RC and SIM records are not deleted or rewritten. Real entry lists active non-fixture captures from the prior SIM namespace. After verified connection and explicit operator confirmation, recovery creates a new real-acceptance batch containing only those CTNs and original capture timestamps, with source-to-new-operation audit mapping. It excludes voided captures and fixtures; does not transfer simulated RT, RT changes, quality results or receipts. The original source remains intact. Repeated recovery cannot duplicate an existing active CTN. Any new RT/status comes from the authenticated lookup response.

## Verification performed
Node syntax check and 20 Node VM regression checks passed using the submitted diagnostic as a local test fixture. Tests covered persisted SIM override; endpoint/session gates; exactly two recovery candidates and no resurrection of three voids; unchanged source snapshot; successful connection; explicit recovery confirmation; real-route request dispatch using mocked authenticated API responses; timestamps; no mock receipt import; repeat recovery; immutable IQC RT under OQC edits; identical request replay after response loss; actual-route error handling without simulation fallback; lookup retry; wrong environment; permission denial; malformed preferences; explicit simulation rejecting non-fixture scans. Tested app blob: bc451c2a12ab4ea5730e9ca01f5c543c024d2bf5.

DOM, storage and API in these regression tests are test doubles. No claim of actual Google Apps Script, native IndexedDB, iPhone or Honeywell UAT completion. Backend contract/reducer/storage module and production IQC/ERP/Grinding/Timestamp code unchanged. No Apps Script redeployment is required for this frontend update. Real lookup still requires the existing DEMO /exec URL and a valid DS session; neither can be inferred from an export that contains no endpoint or token.
