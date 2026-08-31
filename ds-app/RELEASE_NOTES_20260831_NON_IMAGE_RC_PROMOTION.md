# DS Workstation Non-Image RC Promotion — 2026-08-31

## Production scope

This release promotes the non-image portions of the DS RC field work:

- LINE-like floating bottom navigation.
- iOS login/home viewport stabilization.
- Full module viewport without a reserved bottom black strip.
- Strict single-visible iframe enforcement and last-click-wins recovery.
- Stale keyboard state / bottom-nav recovery.
- Grinding normal quick-action-bar recovery.
- Production requirement card layout and process/load metrics.
- Grinding operator inherited from the DS signed-in user.
- Grinding API pill compaction, refresh feedback, WIP collapse and reconcile jump.
- Conservative automatic retry for read-only Grinding batch lookup failures.

## Explicit exclusions

No image-recognition code is promoted:

- no Tesseract loader;
- no IQC photo intake;
- no OCR worker / multipass / isolated worker;
- no Cloud Vision / Hybrid second reader;
- no image grouping, image memory, image safety or image write flow.

RC fault-injection controls are also excluded.

## Return-to-WIP hold

The HT/DCYL → Grinding UI is not activated in this release.

Reason: the RC implementation used ADMIN-only front-end visibility and the public
Grinding token. Production requires:

1. valid DS session;
2. active account;
3. `grinding_return_enabled=true`;
4. backend permission re-check.

No Return-to-WIP script or API endpoint is loaded by this release.

This is not a timestamp conflict; it is an authorization boundary.

## Timestamp protection

This frontend release does not modify:

- `ResponseTimestampGuard.gs`
- `DailyReportApi.gs`
- `SystemDiagnostics.gs`
- Response timestamp write/read-back verification

Do not replace those Apps Script files with older RC snapshots.


## Portal contract protection

`ds-app/config.js` receives only a DS-Shell-scoped enhancement loader. Its production Portal contract values remain unchanged:

- `CLIENT_VERSION: DS_APP_SHELL_V1_3_20260816`
- production `PORTAL_API_URL` unchanged
- `AUTH_CLIENT_VERSION: IQC_CORRECTION_V0_9_7_20260810` unchanged
