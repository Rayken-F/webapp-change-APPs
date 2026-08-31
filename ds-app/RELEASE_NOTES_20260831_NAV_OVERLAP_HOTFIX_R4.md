# DS Workstation Floating Navigation Hotfix R4 — 2026-08-31

## Field issue

After the LINE-like floating bottom navigation was promoted, the navigation was a pure overlay over module iframes. On iPhone/PWA this caused:

- Daily Report bottom actions to be covered.
- Dashboard bottom rows to be unreachable or hidden.
- Dashboard side quick controls to be covered near the bottom.
- The bottom navigation to drift below the visible viewport when the shell height became larger than the current visual viewport.

## Root cause

1. RC line-nav CSS forced module `.main-view` to `bottom: 0`, so the iframe occupied the same pixels as the floating navigation.
2. Shell UX used an absolutely positioned bottom navigation inside a variable-height shell. A stale/oversized iOS shell height could place the navigation below the real viewport.

## R4 correction

- Force the LINE-like bottom navigation to `position: fixed` against the real viewport.
- Measure the navigation's actual bounding rectangle and publish `--ds-prod-nav-occupied-h`.
- Reserve that exact occupied height at the bottom of module `.main-view`.
- Recalculate after resize, orientation changes, page resume, keyboard close, module changes and navigation resize.
- Allow module content to expand to full height only while the keyboard is genuinely open and the navigation is hidden.

## Safety boundaries

No changes to:

- image recognition / OCR / Cloud Vision;
- Return-to-WIP;
- `DailyReportApi.gs`;
- `ResponseTimestampGuard.gs`;
- `SystemDiagnostics.gs`;
- Response timestamp contracts;
- ERP API or Grinding transaction logic.
