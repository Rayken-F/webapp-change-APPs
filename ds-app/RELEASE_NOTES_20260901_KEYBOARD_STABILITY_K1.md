# DS Workstation Keyboard Stability K1 — 2026-09-01

Production hotfix based on the recovered R5 baseline.

## Scope

- Keep `#appShell` at the stable `--ds-shell-vh` height while the iOS keyboard is open.
- Anchor `.main-view` absolutely inside the stable shell instead of to the visual viewport.
- Preserve the module context-bar top offset while typing.
- Hide the LINE-like bottom navigation synchronously when a text control in Daily Report or Grinding receives focus.
- Restore the navigation after focus/keyboard release without polling loops.

## Explicit exclusions

- No R6 Dashboard receiver/runtime promotion.
- No Timestamp, ERP, API, IQC image/OCR, or Return-to-WIP changes.
- The failed R6 runtime remains isolated on `test/r6-ios-keyboard-20260901`.

## Service Worker

`ds-app-shell-keyboard-stability-20260901-k1`
