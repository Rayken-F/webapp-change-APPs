# DS Workstation R5 True Overlay Navigation — 2026-08-31

## Goal

Replace the R4 fixed reserved band with a LINE-style true overlay:

- module backgrounds extend to the physical bottom;
- the bottom navigation floats above module content;
- the final action/data can scroll above the navigation;
- fixed module controls move above the navigation;
- keyboard-open state temporarily reduces the inset to zero.

## Shell implementation

- `ds-app/production-enhancements.css`
  - module viewport returns to `bottom: 0`;
  - Dashboard-only fallback reservation remains until ACK.
- `ds-app/production-enhancements.js`
  - measures the real navigation footprint;
  - injects internal bottom inset into same-origin Daily / Grinding / IQC frames;
  - moves Grinding sticky actions and jump button above the navigation;
  - sends `DS_SHELL_NAV_INSET` to cross-origin Dashboard;
  - removes Dashboard fallback only after `DS_SHELL_NAV_INSET_ACK`.
- `ds-app/config.js`
  - R5 cache-busted loader.
- `ds-app/sw.js`
  - cache `ds-app-shell-true-overlay-nav-20260831-r5`.

## Dashboard receiver

`DashboardDsShellInsetReceiver_R5_20260831.txt` must be appended before `</body>`
in the currently deployed AP Dashboard HTML and deployed as a new version.

The receiver:

- activates only with `?ds_shell=1`;
- accepts messages only from `https://rayken-f.github.io`;
- appends a true scroll-tail spacer;
- moves `.quick-fab-dock` and mobile `.cache-dock` above the DS navigation;
- returns an ACK so DS Shell disables the temporary R4 fallback.

Direct public Dashboard usage remains unchanged.

## Explicit exclusions

- no IQC image recognition / OCR / Cloud Vision;
- no Return-to-WIP activation;
- no Timestamp / DailyReportApi / SystemDiagnostics changes;
- no ERP/API changes.
