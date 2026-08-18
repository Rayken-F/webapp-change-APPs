# DS Platform Security Guardrails

Baseline date: 2026-08-18
Branch: `baseline/2026-08-18-production-audit`

## Repository boundary

`webapp-change-APPs` is currently a public GitHub Pages repository. It must be treated as PUBLIC content.

Allowed here:
- HTML / CSS / client-side JavaScript
- PWA manifests and icons
- Public Apps Script `/exec` endpoints when the backend is designed to be public-facing
- Non-sensitive version metadata
- Production routing metadata that is safe to expose

Never commit here:
- API secrets / shared authorization tokens
- Passwords
- session signing secrets
- OAuth client secrets
- private keys
- backend-only snapshot/signature secrets
- customer API credentials
- sensitive configuration exports

## P0 security finding — Grinding WIP static token

The current Grinding WIP frontend contains a static API token in public client-side JavaScript, while the backend uses the corresponding token as an authorization check for WIP API access.

Because browser JavaScript in a public Pages site is inherently readable by anyone, a static frontend token cannot be considered a secret.

### Current handling

- Do NOT rotate or remove the token independently from Production; doing so would break the currently deployed Grinding WIP client.
- Do NOT copy the Grinding backend configuration into this public repository.
- Treat this as a coordinated security migration, not a one-file hotfix.

### Target architecture

Preferred target:
1. DS Workstation remains the single login entry.
2. Grinding WIP receives/verifies the DS authenticated session or a short-lived server-issued credential.
3. Backend authorization is based on authenticated user/session + module permission.
4. Backend-only secrets live in Apps Script Properties and/or a private backend repository.
5. No reusable authorization secret is embedded in public JavaScript.

## Backend repository rule

Apps Script backend source must be managed separately in a PRIVATE repository before it is imported into GitHub version control.

Suggested repository name:
`DS-Backend-Private`

Production deployment remains manual until baseline, rollback and secret handling are validated.
