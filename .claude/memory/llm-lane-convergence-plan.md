---
name: llm-lane-convergence-plan
description: "The operator's 2026-09-22 plan to make the LLM lane work the same way in all four tools — steps 1-2 shipped, step 3 collection half done, and the corrected evidence chain that step 4 is blocked on"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8c5a7ea4-cff0-4ae1-b901-c37d21fcd4d3
  modified: 2026-09-22T16:22:08.420Z
---

**Operator ruling, 2026-09-22:** *"I think its of value to have all work the same way for future
maintenance and user standardization"* — and on the LLM specifically, *"we want the llm to work in the
same mechanism as it is in 2d and 3d where it works well."* He then ruled per step: pre-call guard,
sequence gate and honesty gates take **2-D's approach**; what gets RECORDED takes **analytic's**.

Umbrella: [#1359](https://github.com/dcodish/geo_builder/issues/1359). The per-step ruling and the risk
assessment he asked for are the 2026-09-22 comment there.

## Where it stands (2026-09-22, end of the work-PC session)

| step | issue | state |
| --- | --- | --- |
| 1 — one LLM request harness in `server/llm/` | #1359 | **merged** `dbd21786` (PR #1360), played |
| 2 — sequence gate shared in `shell/llm/` | #1356 | **merged** `3277cb6a` (PR #1361), played |
| 3 — usage events: routing + analytic emits | #1243 | **DEPLOYED + COLLECTING** (`prod/2026-09-22-3`; env line added 2026-09-22, see #1363) |
| 3b — nothing READS analytic's events | #1362 | filed, `needs-operator` |
| 4 — analytic honesty-gate battery | #1355 | **not started, and deliberately blocked** |
| 5 — what gets RECORDED (canonical vs the student's line) | #1297 | ruled, **not built** |

## The correction that matters most

I told him #1243 was "the evidence step" before #1355. **It is not — it is the COLLECTION step.** The
real chain is:

```
#1243 merged -> DEPLOYED -> #1362 (teach /log-triage + dashboard) -> real sessions -> THEN #1355
```

#1355 was always meant to be authored *against evidence*; authoring a dozen refusal rules against the
two live analytic LLM calls that exist would ship false positives into a lane he has said works well.
**Do not start #1355 until #1362 has produced real data.** If a round picks it up, that is the thing to
say.

## The deploy — DONE, 2026-09-22

`prod/2026-09-22-3` on `c3699e72`: all four statics + the proxy, preflight `MATCHES live` on all five.
([[proxy-bundle-is-wider-than-server]] held — #1243 and #1359 both change code inside
`dist-server/proxy.mjs`, so the proxy was rebuilt and restarted, not only the statics.)

**The deploy alone was not enough, and this is the lesson worth keeping.** Shipping #1243's routing
left analytic collection *accepted-and-silently-dropped*: production declared only
`EVENTS_LOG_PATH` and `EVENTS_3D_LOG_PATH`, so the fallback resolved under `process.cwd()` — `/`
under systemd — the `mkdir` failed, and `eventLog` swallowed it and still answered **204**. A live
probe returned 204 while `find /` located no file at all. Fixed the same day at the operator's
request (`EVENTS_ANALYTIC_LOG_PATH`, #1363 arm (a)); the structural arms stay open. **A merged
mechanism plus a green deploy is not the same as a working capability — probe the sink.**

## The one decision waiting on him

**#1362's outcome taxonomy** — which analytic refusal codes mean *build this* versus *the tool
correctly declined*. `not-handled` clearly the former, `out-of-scope` clearly the latter; the middle
(`bad-equation`, `unknown-reference`, `bad-arity`) is his call, and it decides what every future
analytic triage pass puts at the top of his list. Ask it as one short question — the rest of #1362 is
mechanical.

## Step 5 has a deadline that is not about step 5

His step-5 preference (record the CANONICAL line, not the student's raw utterance) would change
**2-D and 3-D**, not analytic — they store the student's words today. It is unbuilt and unscheduled,
**but the decision cannot wait indefinitely**: [#1189](https://github.com/dcodish/geo_builder/issues/1189)
encodes the save payload into a WhatsApp link, and a sent link is the one artifact in this project that
can never be migrated. So the shape question — *does a fact carry one text or two?* — must be settled
before #1189 freezes its encoding. Notes are on #1189 and #1238 (#1238 is `auto-ok` and could be picked
by a round first).

## Also open, unrelated to the chain, and cheap

- [#1357](https://github.com/dcodish/geo_builder/issues/1357) — junk reaches the paid LLM call.
  Measured: 12/12 junk strings pay, and 10 of them were already classified `unrelated` **before** the
  call and paid anyway, because `unrelated` is not in the pre-LLM short-circuit set. Adding it is ~one
  line per product and six real grammar gaps were measured as unaffected. Saves money now.
- [#1358](https://github.com/dcodish/geo_builder/issues/1358) — the imperative register shipped as a
  third shape; it **subsumes #778's remaining 2-D/3-D/complex slices**, which must not be built
  separately or they become a fourth and fifth shape. See [[third-copy-is-the-shared-one]].
  **Operator ruled 2026-09-22: #778 LOSES `auto-ok`** (*"778 should loose the ok and follow the more
  recent guidelines"*) — so a round can no longer pick it up and produce a fourth shape; #1358's seam
  lands first. His play of `prod/2026-09-22-3` confirmed the defect live in 2-D and 3-D, and split it
  in two: «צייר משולש» is swallowed by the PARSER (teach gate fixes it), «תוסיף קטע אמצעים» is
  `not-handled` and swallowed by the LLM — and its remainder is *underspecified*, so the model chose
  a side the student never named (ADR-052). **Unruled: does that case become a guidance note, or a
  real DOF that «הציגו תצורה אחרת» cycles?** That decides #1358's scope.
- [#1364](https://github.com/dcodish/geo_builder/issues/1364) — found in the same pass: complex reads
  `add z1 = 3+4i` as `add · z1 = 3+4i`, binding the unknown Latin word as an **invented free
  variable**, and reports `ok`. Corrects the older "discards unrecognised Latin tokens" note on #778.
