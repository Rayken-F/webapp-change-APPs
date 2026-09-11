# OQC DEMO V0.2.3 frontend publication

Build: `20260911-v023-01`. This release publishes the prepared V0.2.3 frontend to the existing isolated `DS-OQC-SHIPPING-DEMO` entry. It is not a production rollout.

## Scope
- Self-contained HTML/CSS/JS entry; old external app/domain files are no longer loaded by this index.
- Frontend supports the prepared V0.2.3 bundle lookup, manual OQC RT for confirmed missing IQC, readonly query mode and packing-completion workflow.
- Requires `backendVersion=0.2.3`; an old backend is explicitly blocked rather than silently treated as upgraded.
- Same local database and endpoint-key mapping. No scan clearing, automatic IQC writes, production menu updates, ERP changes or Grinding changes.
- Existing scoped sw.js is unchanged.

## Backend dependency
The separately supplied `OQC_DEMO_V0_2_3_Code.gs.txt` must be applied to the original independent DEMO Apps Script project. Run `upgradeOqcShippingDemo023`, then update its existing web-app deployment while keeping the same `/exec` URL. This GitHub release does not perform those Google account actions and does not claim that the live backend has been upgraded.

## Publication checks
All three embedded script blocks passed `node --check` during this publication. Script contents were verified unchanged from the prepared frontend artifact. This is a source/publication check, not actual Google API or iPhone/Honeywell acceptance testing. Pages deployment status must be checked separately.
