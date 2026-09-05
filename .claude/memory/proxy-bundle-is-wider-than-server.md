---
name: proxy-bundle-is-wider-than-server
description: "The RUNBOOK's 'did server/ change?' deploy rule under-detects — proxy.mjs also bundles the LLM command catalogs, so diff the BUILT bundle against the live one instead"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7d6cf4c9-ed74-4903-8db6-6b892854e932
  modified: 2026-09-05T20:08:55.286Z
---

`docs/RUNBOOK.md`'s standard-deploy decision rule is *"did `server/` change? No → static-only, do not
restart the proxy."* **That rule is not sufficient**, and following it correctly still shipped a stale
proxy for three weeks.

`dist-server/proxy.mjs` bundles more than `server/`:

```
server/parseHandler.ts
  └── src/parser/llmShared.ts    → src/parser/catalog.ts      (2-D command catalog)
  └── src3d/parser/llmShared3.ts → src3d/parser/catalog3.ts   (3-D command catalog)
```

Those catalogs are the **grammar reference handed to the LLM fallback**. `prod/2026-09-05` applied the
rule correctly — `server/` had changed in test files only — and skipped the proxy. Measured at the
next deploy (`prod/2026-09-05-2`, 2026-09-05): live `732,450 B` vs freshly built `744,148 B`, last
rebuilt **2026-08-17**. For ~3 weeks the LLM lane was served the 2026-08-17 grammar while the static
apps shipped the current one, and #555 (3-D sequence gate) and #578 (rename-a-point) were merged,
gated and never actually served.

**Why:** the rule names a directory, but the bundle's real surface is its import graph. The failure is
silent — nothing errors, the proxy stays healthy, and the gap is only visible by diffing a build
artifact nobody diffs.

**How to apply:** on every deploy, run `npm run build:proxy` and **compare the built bundle to the
live one before deciding**, rather than deciding from the `server/` diff:

```
sha256sum dist-server/proxy.mjs
ssh root@themathbible.com 'sha256sum /var/www/geo-proxy/proxy.mjs'
```

Differ ⇒ scp + `systemctl restart geo-proxy`, whatever the `server/` diff said. This costs one build
(~25 ms) and cannot go stale the way a directory list can. Verify after: `systemctl is-active`,
`curl healthz` → `ok`, and the deployed sha matches local.

Recorded on [#903](https://github.com/dcodish/geo_builder/issues/903) as part of its deploy-recipe
scope; delete this memory once the RUNBOOK itself carries the check.

Related: [[deploys-are-mine-to-run]], [[gate-lines-are-read-not-matched]].
