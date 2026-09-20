---
name: vectors-are-3d-only
description: "The 2-D tool has zero vector support by deliberate curriculum scope, not by oversight — vectors are a space-unit topic, so never port them to src/"
metadata: 
  node_type: memory
  type: project
  originSessionId: 65305bb4-bdf9-4223-a5c6-35cf1cc201d3
  modified: 2026-09-18T06:18:51.409Z
---

**Operator ruling 2026-09-18 (#1184):** vectors belong to the **space unit**, so they live in the 3-D
Space Builder (`src3d/`) only. The 2-D Geo Builder has **no vector support at all** — zero
`וקטור`/`vector` hits in `src/parser/parse.ts` and `src/parser/catalog.ts`, and no arrow in
`src/ui/symbols.ts`.

**Why:** that emptiness reads like a gap in the code and is not one. The normal instinct on finding a
construct in one product and not its sibling is that it is a wiring smell worth chasing — see
[[cross-product-disparity-is-a-wiring-smell]], which is correct for constructs both products' curricula
share, and wrong here. There is no 2-D vector mechanism to use as a template and none should be created.

**How to apply:** do not port vectors to `src/`, and do not file a 2-D parity issue for them. The
sibling-parity check simply does not apply to the vector family (#1183, #1184, #1185, #1188). The one
real cross-product touchpoint is `shell/symbols.ts`, the shared palette *core* — palette DATA stays per
product by the operator's #525 ruling, so changing 3-D's arrow entry implies nothing for 2-D or complex.
If a vector request ever does arrive against the 2-D tool, that is a curriculum-scope change and a
question for the operator, not a gap to close.
