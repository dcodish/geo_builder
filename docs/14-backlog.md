# 14 — Backlog & Quick-Win Triage

_Created 2026-07-01. A living, findable list of what's open and what's worth picking up next, so it doesn't get buried in the [PROJECT-MEMORY](PROJECT-MEMORY.md) session log._

This is a **triage of the two open-work buckets** — the plan's *parked engineering threads* ([09-implementation-plan.md](09-implementation-plan.md) status line) and the operator-raised *UX/quality items N1–N6* (recorded in [PROJECT-MEMORY.md](PROJECT-MEMORY.md), 2026-06-21). It was produced by reading the actual code, so the "already done / not quick / quick win" verdicts are grounded, not guesses. **The canonical, full descriptions still live in those two files; this doc is the prioritized index.**

> Context: the operator asked "review the parked engineering threads + N1–N6 and see if there are quick wins." Finding: **several N-items are already implemented** (they were addressed in the sessions after they were raised), which narrows the real quick wins to N6, a slice of N1, and the ADR-052 audit.

---

## ✅ Already implemented — strike these off

- **N4 — busy / "working" indicators.** Done. Distinct in-flight states exist for every async action: `thinking` (LLM fallback / auto-resolve), `resampling` ("show another configuration"), `analysing` ("view relations"), `detecting` ("detect shapes") — each disables its button and shows its own label. See [App.tsx](../src/App.tsx) (`useState` block ~L83-87; render ~L858-980). _Only cosmetic polish left (a spinner glyph instead of text) — low value._
- **N5 — clearer error messages.** Largely done. [humanizeError.ts](../src/i18n/humanizeError.ts) maps **15 engine error shapes** → student-facing He/En copy, with a coverage test ([humanize-error.test.ts](../src/i18n/__tests__/humanize-error.test.ts)) asserting every current shape is handled. Unmatched errors fall through unchanged (never worse than raw). _A subjective tone/wording pass is possible but isn't a clear win._

## ⛔ Not actually quick — scope or risk

- **N3 — synonyms (צלע / קטע / ישר …).** Already handled *per-rule* (each parse rule inlines its own synonym set, e.g. `segment|diagonal|קטע|אלכסון|חבר`, `line|ישר|הישר|הקו`). Centralizing collides head-on with [ADR-077](06-decisions.md#adr-077)'s segment vs. `הישר` (infinite line) vs. `המשך` (extension) distinction → a careful, regression-heavy refactor. Do it only within-each-meaning, with explicit synonym sets; not a quick win.
- **Parked engineering threads (all of section 3).** Big / gated / proxy-dependent by nature:
  - **R7** — decide constraint→DOF binding once, jointly (retire greedy apply-time pick + a real per-DOF stay-put penalty). Its own focused, snapshot-gated session; no over-recruit-drift evidence found yet, so not urgent. ([ADR-045](06-decisions.md#adr-045), [ADR-074](06-decisions.md#adr-074).)
  - **ADR-073 / FR-IN-10** — LLM reorder-and-repair of out-of-order input. Designed, not built; waits on the production proxy deploy.
  - **ADR-049** — LLM-assisted solve for non-contradiction solver failures. Depends on the R7 consolidation + proxy deploy.
  - **Coord-validation campaign — next slices** (Procrustes/global-solve mode, set-angle-driven, circle-via-intersection). Additive dev/CI test infrastructure ([ADR-109](06-decisions.md#adr-109)); low risk but not a user-facing win.

## ★ Genuine quick wins — ranked

1. **★ N6 — dev-only step-through panel** _(operator's own flagged top pick; highest testing leverage, zero production risk)._
   When a figure fails at step 4–5, re-testing a fix means retyping every earlier step by hand. Want a control that feeds a session's recorded steps one at a time, advancing to any point, then hands off to manual entry.
   **The backend already exists:** [`replaySession(utterances[])`](../src/validation/replaySession.ts) already feeds an ordered utterance list through the real `parse → dryRun → commit → replay` pipeline and classifies each step. So N6 is just a **dev-only UI**: paste a session's utterances (or load from `logs/debug-log.jsonl` `figure` snapshots, which hold each session's ordered `facts[].cmd` + `utterance`) + a "next step" / "run to here" control over the existing submit path. Self-contained; can't destabilize the live app. **Best first pick.**

2. **N1 — mine "error but the image looks OK" cases** _(first step only; read-only, fast)._
   The operator often sees "an error yet the image looks fine." The LLM only fires on a deterministic `not-handled` ([ADR-023](06-decisions.md#adr-023)); the open question is whether the error/escalation SIGNAL is miscalibrated — should we also escalate / amber more honestly on a verifier-`violations` or low-confidence parse, rather than only on `not-handled`? **Quick step:** scan `logs/debug-log.jsonl` for figures that verified-amber or errored while likely building fine, produce a concrete work-list, then make the design call. (Relates to [ADR-053](06-decisions.md#adr-053) verifier + [ADR-055](06-decisions.md#adr-055) dry-run; the *trigger-calibration* question is the new part.) **Sub-note:** also document the LLM's real role — freeform→canonical-commands decompose; typo-tolerance is a side effect, NOT the purpose.

3. **ADR-052 DOF-honesty audit** _(read-only, ~30 min; may surface one small fix or confirm clean)._
   Confirm nothing counted by `rawMovableDof` is missing from the samplable `freeDofs` set — the "default masquerading as fixed" smell ([ADR-052](06-decisions.md#adr-052)). `freeDofs` ([sample.ts](../src/engine/sample.ts) ~L295) looks fairly complete now (free-point, on-circle, on-segment, samplable-extension, on-line, shape-carrier incl. free radius); the one to double-check is a circle's free **centre** ([ADR-103](06-decisions.md#adr-103) made it *drivable*; is it *samplable* by "show another configuration"?). Also folds in the deferred DOF-cue inflation note under [ADR-065](06-decisions.md#adr-065).

## Other open items (for completeness — not from the N-list)

- **Production proxy deploy** (Pillar 5) + **admin usage-dashboard/event-sink deploy** ([ADR-146](06-decisions.md#adr-146)): needs `IP_HASH_SALT` / `ADMIN_*` env vars in `geo-proxy.env` on the server + Apache rules ([deploy/README.md](../deploy/README.md)). Ops-gated (secrets — operator only). Until it's live, [ADR-168](06-decisions.md#adr-168)'s cleaner analytics stream has no sink to land in.
- **ADR-167 hover-to-focus feel** — logic is unit-tested + builds, but the pointer interaction (reach thresholds 10 px seg / 44 px angle, angle-wedge heuristic) wants an in-app eyeball + tuning.
- **LLM proxy prompt caching (future cost optimisation — only if traffic grows).** Each Haiku call re-sends the stable ~1,500-token system prompt (the whole command catalog + ~15 few-shot examples) at full input price (~$0.0025/call). Anthropic prompt caching on that system block would bill it at ~0.1× on repeat calls → ~$0.0003/call, ~10× cheaper. **Not worth doing now** at the current low volume + the 500/day ceiling ([ADR-177](06-decisions.md#adr-177)); it's the obvious lever if the app gains momentum and LLM spend becomes material. Requires two changes to `server/parseHandler.ts`: reuse ONE `Anthropic` client across requests (currently a fresh client per request) and add `cache_control: { type: 'ephemeral' }` to the system block in `buildLlmRequest` (`src/parser/llmShared.ts`). Verify via `usage.cache_read_input_tokens`. Decision recorded 2026-07-02: documented as the future solution, deferred until needed.
- **Headline milestone:** **Phase 6 — theorems** (`detect(figure)` predicates), gated behind the hardening program.

---

_When you pick one up: add the fix as an ADR + a regression scenario per the repo rules, then update this doc (strike the item, note the ADR)._
