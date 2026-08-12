---
name: home-pc-work-in-flight
description: Home PC holds untested/uncommitted changes (as of 2026-08-12) — do NOT run /fix-round or land queue fixes from the work PC until that work is committed and pushed
metadata: 
  node_type: memory
  type: project
  originSessionId: 67a15442-0c65-402d-8bfd-342462b1da8b
  modified: 2026-08-12T08:10:06.122Z
---

As of **2026-08-12** the operator's **home PC has untested, uncommitted changes** in the geo_builder
tree. Operator directive: the work PC only *builds* the fix-round mechanism (#543/#544) — it must
**not run a fix round or land queue fixes** that could conflict with the in-flight home work.

**Why:** parallel fixes from two machines overwrite each other; the home changes are not yet pushed,
so nothing on the work PC can see or rebase over them. See [[work-pc-cross-machine]].

**How to apply:** before running `/fix-round` (or any batch of queue fixes) on the work PC, confirm
the home-PC work has landed (its commits visible on `origin/main`, or the operator says so).
**Delete this memory once the home-PC work is committed and pushed.**
