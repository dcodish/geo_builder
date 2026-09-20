---
name: preflight-differs-means-different-commit
description: "deploy:preflight says DIFFERS for every static bundle after ANY commit — __BUILD__ (git short-hash + date) is baked into all of them, so DIFFERS means 'live was built from another commit', never 'this product changed' (2026-09-20, prod/2026-09-20-2 misreported)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: aaba7871-e52a-4f49-a224-c70d2000bfc4
  modified: 2026-09-20T15:58:26.307Z
---

`vite.config.ts` and its three siblings define `__BUILD__` as `git rev-parse --short HEAD · date`
(ADR-146 — the release id is stamped on every usage event so the admin dashboard can filter outcomes
by release). It is baked into **every** bundle, so **one commit changes all four bundle hashes**, even
for products whose trees were untouched.

**Why:** `deploy:preflight` compares built artifacts to live ones. Its wording — `DIFFERS — push
required` — reads as *this product changed*, and it does not mean that. It means *live was built from
a different commit*. On 2026-09-20 I reported to the operator that "3-D and complex carried undeployed
changes from earlier commits"; measured afterwards, `git diff --name-only prod/2026-09-20..HEAD --
src3d/ src-complex/ shell/` was **empty** in that range. The claim was wrong and he had already read it.

**How to apply:** still push exactly what the preflight names — a stale release id on three products
misattributes analytics by release, so pushing all four is correct. But before telling the operator
*what changed*, measure it separately:
`git diff --name-only <last prod tag>..HEAD -- src/ src3d/ src-complex/ src-analytic/ shell/`.
Report the trees that really moved; say "re-pushed for the release id" for the rest. The preflight is
authoritative about what to PUSH and says nothing about what CHANGED.

Complements [[proxy-bundle-is-wider-than-server]] — the proxy rule under-detects, this one
over-reports, and both are read off the same preflight. Related: [[gate-lines-are-read-not-matched]].
