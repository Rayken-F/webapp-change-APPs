# DS Shell 2026.08.19-R1 — iOS UX / Keyboard Stability

Status: PRODUCTION
Field acceptance: PASS
Acceptance basis: DS App Shell RC v3 field test on iPhone/PWA, confirmed by operator on 2026-08-19.

## Production scope

Changed:
- `ds-app/index.html`
- `ds-app/shell-ux.css` (new)
- `ds-app/shell-ux.js` (new)
- `ds-app/sw.js`

Not changed:
- `ds-app/config.js`
- DS Portal Apps Script backend
- Daily Report Apps Script backend
- Grinding WIP frontend/backend
- Dashboard frontend/backend
- Customer ERP API contract

## Accepted behavior

1. iOS soft keyboard no longer pushes the bottom navigation upward.
2. Keyboard close restores the bottom navigation without the large ghost/blank area observed in prior builds.
3. Accidental pinch zoom is disabled in the DS operations shell.
4. Module mode shows a compact single-line current-module bar and logged-in user.
5. Daily Report `填表人員` is automatically populated from the DS Workstation login while the duplicate reporter selector/card is hidden in Shell mode.
6. The redundant `舊版自動噴砂回報｜緊急備援` details entry is hidden in Shell mode; the existing `自動噴砂站（舊版日報）` station option remains available.
7. Bottom navigation remains anchored to the full layout viewport during module switching.

## Runtime release marker

`DS_SHELL_IOS_UX_PROD_20260819_R1`

## Service Worker cache

`ds-app-shell-ios-ux-20260819-r1`

## Rollback

Production-path rollback point before this release:

`691b811efb5c8de6323c5f51fe98562ab8fb0bb9`

Rollback should restore the production `ds-app/` files to that commit. RC test directories may remain because they do not participate in the production `ds-app/` route.

## Version note

`DS_PORTAL_CONFIG.CLIENT_VERSION` is intentionally unchanged in this release. The Portal client/backend contract version was not part of this UI-only rollout and must not be changed merely to label a Shell UX release.
