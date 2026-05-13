# ADR-0007: CSRF two-phase rollout — log_only before enforce

## Status

Accepted (Phase 1 pending) — documented in SM-E / SM-LM, 2026-05.

---

## Context

The tRPC API is called by a browser frontend. Without CSRF protection, a malicious page could use `fetch()` or `XMLHttpRequest()` to make state-mutating requests using the victim's session cookie.

CSRF middleware was added in SM-B and wired in SM-E via `applyHttpSecurity()`. However, the `CSRF_ENFORCEMENT` environment variable defaults to `log_only`, which logs violations but does not block them.

Setting it to `enforce` immediately would break all clients that have not yet been updated to send the `x-csrf-token` header on every mutation.

---

## Decision

Roll out CSRF enforcement in two phases:

**Phase 1 (prerequisite — must ship before enforce):**
1. Add a `generateCsrfToken` tRPC procedure that returns a token (called once at app load).
2. Add a client-side interceptor (axios/fetch) that reads the token from `localStorage` or a React context and injects `x-csrf-token` on every mutation.
3. Add an integration test asserting that a mutation without the header is rejected when `CSRF_ENFORCEMENT=enforce`.

**Phase 2 (production rollout):**
1. Deploy Phase 1 to staging; verify the integration test passes.
2. Set `CSRF_ENFORCEMENT=enforce` in the staging environment variable.
3. Monitor `x-csrf-token` validation logs for false positives.
4. Promote to production.

Until Phase 1 ships, CSRF protection is advisory only (violations are logged, not blocked).

---

## Consequences

### Positive

- A gradual rollout prevents a hard break if a client path is missed.
- The violation log from `log_only` provides data on which endpoints are failing before enforcement.

### Negative

- The system is vulnerable to CSRF attacks during the log_only window.
- An engineer unfamiliar with the two-phase plan could set `CSRF_ENFORCEMENT=enforce` prematurely and break the UI.
