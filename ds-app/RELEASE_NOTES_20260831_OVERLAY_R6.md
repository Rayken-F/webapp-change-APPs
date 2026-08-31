# DS Workstation R6 overlay correction — 2026-08-31

## Fixed

- Dashboard no longer reserves a shortened iframe fallback.
- Dashboard R5 physical spacer is retired; R6 uses `.app-shell` bottom padding,
  so only 10px remains visible above the floating navigation at the true end.
- Daily Report and Grinding hide the DS navigation immediately when an input
  receives focus, before iOS moves fixed elements to the keyboard edge.
- Navigation is restored after keyboard dismissal and viewport recovery.

## Safety boundary

No changes to:

- ResponseTimestampGuard
- DailyReportApi
- SystemDiagnostics
- ERP API / workers
- IQC image recognition
- HT/DCYL Return-to-WIP

## Dashboard deployment

Replace the complete R5 receiver block in the deployed Dashboard HTML with:
`DashboardDsShellInsetReceiver_R6_20260831.txt`, save, and update the existing
Dashboard Web App deployment without changing its URL.
