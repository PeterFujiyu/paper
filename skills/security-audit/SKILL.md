---
name: security-audit
description: Audit the Vercel serverless backend for vulnerabilities and harden it with regression-tested fixes. Use for "security audit", "check for vulnerabilities", "harden auth/content handling", or reviewing a new endpoint before it ships.
---

# Security audit

Systematically review the serverless backend, cross-verify findings before claiming them, report severity-ranked, then fix with regression tests. Past rounds produced: JWT audience binding + `tokenVersion` revocation, registration rate limiting, generic failure responses, TipTap content sanitization hardening, security headers, hCaptcha rate gate on metrics.

## Scope (in priority order)

1. **Auth** — `server/lib/auth.ts` + `api/auth-*.ts`: JWT signing/verification (audience bound to deployment, `tokenVersion` checked against the persisted user), cookie helpers (never hand-rolled cookie strings), session validation in `requireAuth`.
2. **Input handling** — every `api/` handler: method guards, `readBody<T>` payload validation via `server/lib/validation.ts`, slug/email normalization, query-param handling, MongoDB operator injection through user-supplied objects.
3. **Content** — `sanitizePostContent` for all stored/returned TipTap JSON; safe-link and safe-image validation; anything rendered as HTML on the public site.
4. **Abuse resistance** — rate limits on registration/login/metrics, invite-code gating, hCaptcha gate, cache-control on per-user or mutable responses.
5. **Headers & platform** — `server/lib/security.ts` and `vercel.json`: CSP, security headers, rewrite rules; serverless statelessness assumptions (in-memory rate limiters reset per cold start — note the limitation).
6. **Information leakage** — responses must never expose stack traces, raw JWT errors, DB internals, or user-enumeration signals (login and registration failures stay generic).

## Process

1. Enumerate every route in `api/` and classify: public read / public write / auth-required / admin-only. Flag any write without auth or validation.
2. For each candidate finding, **cross-verify before reporting**: trace the actual code path end-to-end and construct the concrete request that exploits it. No speculative findings.
3. Report findings ranked by severity (exploitability × impact) with file:line references, before changing anything. Wait for "fix" / "fix all" unless the user already asked for fixes.
4. Live verification, if requested, is authorized **only** against the user's own test environment `yshsr.org` — never any other host.
5. Fix pattern (see commit `801b47e`): minimal hardening change in `server/lib/`, keep `api/` files as thin gates, add regression tests under `tests/server/lib/` covering both the attack input and legacy/compat cases (e.g. tokens issued before a schema change).

## Verify

- `npm run typecheck && npm run build && npm test` — new regression tests must fail on the pre-fix code.
- Re-run the exploit request against the fixed local server (`npm run api:dev`) and confirm it is rejected with a generic error.
- Confirm no behavior regressions: real login/logout flow and public post rendering still work.
