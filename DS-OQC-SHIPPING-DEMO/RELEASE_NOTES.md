# OQC shipping Stage 1 DEMO V0.2.0 — 2026-09-09

This is a new isolated, executable DEMO, not a production promotion. Existing RC and production files, APIs, data, sessions and menus are unchanged.

## Operator workflow
One batch identifies one packing/shipping collection; RT groups are derived inside it. Preserve OQC-YYYYMMDD-01…99 numbering, compact two-line CTN/status/RT rows, original → effective RT, multi-select edits, left-swipe void + five-second restore, removal of empty RT groups and immutable IQC source snapshots. A packing/shipping reference is required before closing.

Scan-first: each valid CTN is committed to the local outbox before IQC enrichment. Pending/error lookups do not discard the CTN and must not be labeled NOT_FOUND. Confirmed NOT_FOUND has empty RT/status and a red 未建IQC flag. Queries retry on explicit retry or reconnection. Closing with missing/pending enrichment requires an explicit summary; conflicts/non-cylinder scans require resolution. Collection completion is never OQC PASS or shipping authorization.

## Modes / delivery status
- Default LOCAL SIMULATION: synthetic QA10AA1/2/3 and QA10AB0…J fixtures; receipt IDs start SIM-. Both client and mock receiver persist locally. This is NOT a server backup.
- RC connection: endpoint field accepts only a manually supplied Apps Script /exec, validates DEMO environment, then uses an existing DS session. A supplied backend .txt must first be installed in a new standalone Apps Script project. No live backend deployment has been performed by this release.
- Dedicated backend creates a new guarded DEMO spreadsheet, authenticates DS user server-side, permits verified ADMIN or a server-side allowlist, stores an append-only operation journal and rebuildable views, validates request hashes/revisions and signed IQC metadata, and returns reproducible DEMO receipts.
- Client mode/endpoint data spaces and the old RC database are separate. Old scans are not migrated or deleted. No production IQC, Grinding, ERP, Timestamp or session changes.

## Limits / acceptance gate
Numeric RT syntax only, not RT-master existence validation. Stale cross-device edits stop and preserve pending actions; automatic merging is deliberately absent. Actual DS/API authentication, native IndexedDB persistence, Apps Script writes and iPhone/Honeywell barcode tests still require operator UAT. The standalone browser service worker is scoped only to this DEMO directory and never deletes other caches.

## Verification
22 pure domain tests, 16 backend mock tests, and 21 Chromium DOM/transactional-memory harness assertions passed. The DOM harness verifies 320/390/430px overflow, scan-first offline preservation, background RT enrichment, empty-group removal, immutable source RT, lost-reply replay and one receipt, closed-batch locking, and 20 sequential captures. Managed browser navigation was blocked; no claim of native IndexedDB, real Apps Script or device UAT completion is made.
