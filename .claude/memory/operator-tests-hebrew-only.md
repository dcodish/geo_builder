---
name: operator-tests-hebrew-only
description: David play-tests in Hebrew only — never include English test cases in play scripts
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4e2b413e-828e-4e4b-a70d-2d68a50f4031
  modified: 2026-07-29T05:47:22.498Z
---

During the 2026-07-29 play session for PRs #390/#391, David said plainly: "I'm not testing english at all."

**Why:** the app's audience is Hebrew-first (RTL default), and David's manual passes mirror real student usage. English mirrors are already locked by the automated test suite, so a play-script English case is wasted operator time.

**How to apply:** when writing play instructions ([[test-server-on-fix-ready]], PLAY-QUEUE.md), give Hebrew utterances only; rely on the suite for En parity. Related: [[triage-only-during-testing]].
