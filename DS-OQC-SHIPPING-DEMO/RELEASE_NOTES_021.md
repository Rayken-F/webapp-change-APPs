# OQC DEMO V0.2.1 — pending IQC / connection recovery hotfix

## Confirmed code defects
V0.2.0 allows local captures after a previously verified session, but lookup and sync silently return when sessionReady is false. Startup profile failures were only shown in a 5-second toast. Retry IQC invoked pumpLookup directly and never restored the session, so that button could do nothing indefinitely. Reconnecting an existing endpoint with pending operations could also reset sessionReady after fetchRemote deliberately rejected pending edits. Browser onLine hints could disable RC requests outright. All per-item ERROR states were displayed identically to waiting states.

The user's screenshot alone does not identify the initial profile/network failure. Do not infer an invalid CTN or missing whitelist from it. Default verified ADMIN access is still a backend rule; no permission is bypassed by this patch.

## Changes
Both retry controls use the same single-flight DS verification and restart pending queries and original outbox packets. Startup, return-to-page and reconnection restore work, with at most one automatic retry for a transient profile failure. Permission/session/configuration errors remain visibly displayed. Waiting / RT查詢中 / 查詢失敗 / 未建IQC are distinct. Only a confirmed IQC NOT_FOUND becomes 未建IQC. RC requests may run despite a false navigator.onLine hint; the explicit offline test switch still pauses requests. Same-endpoint reconnect resumes pending work instead of rolling back authentication. An IQC-only FORBIDDEN response does not invalidate otherwise valid DEMO CTN synchronization.

The API wait covers fetch plus JSON parsing and remains 25 seconds per request. This does not guarantee the Google backend finishes in 25 seconds or abort its execution. Timeout keeps pending operation/request IDs unchanged. Diagnostic export contains build, phases and error codes, not credential values.

## Scope / migration
Only DS-OQC-SHIPPING-DEMO/app.js, index.html and the directory-scoped sw.js runtime change. Backend ENV/client contract, domain reducer, storage DB name/key, IQC source, RT history, original operation IDs and saved CTNs remain unchanged. No data clearing or migration. No Apps Script redeployment is needed for this front-end correction. Production menus and other modules are untouched. Backend setup/permission/latency issues, if present, still require their actual response for diagnosis.

## Tests performed
18 Node VM tests passed, including reproduction of the old silent stall, preserved five-CTN/six-operation outbox, both retry controls, single-flight recovery, bounded profile retries, offline switch, false online hint, page-return recovery, per-item error recovery, missing-token denial, confirmed NOT_FOUND, same-endpoint reconnection, identical packet replay after a lost reply, timeout and credential-free diagnostics, and IQC-only permission failure isolation. Fixtures use mocked fetch/server responses and transactional memory with DOM stubs; no claim of real Google API, native IndexedDB, iPhone or Honeywell UAT is made. No production rollout authorization implied.
