# DS Workstation Production Note — 2026-08-25

## Remember Login

The formal `ds-app/` production source already includes Remember Login and is retained as the production baseline.

Behavior:

- The login screen includes `rememberLogin`.
- When enabled, the DS session token is stored in `localStorage` so the Workstation can restore login across browser/PWA reopen.
- When disabled, the token is stored in `sessionStorage` only.
- The remembered account preference is stored separately from the password.
- Restore still calls the Portal bootstrap/session validation; a saved token does not bypass backend authentication.
- Explicit invalid/expired/disabled-session responses clear the token.
- Temporary network/service errors do not silently erase the remembered-login state.

No password is stored by the DS Workstation implementation.

## Scope isolation

This note does not promote any Grinding Recovery or IQC Honeywell OCR/Hybrid RC files. Those remain isolated under their RC paths until separately field-accepted.
