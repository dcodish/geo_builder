---
name: log-triage
description: Triage the PRODUCTION usage logs of the Geo Builder (2-D) and 3-D Space Builder — pull the real user utterances from the server, bucket them by outcome, cluster the failures/LLM-escalations/refusals by intent, verify each candidate gap against the CURRENT parser, and produce a ranked "what should we add" recommendation report for the operator to approve. Use when the operator asks to analyze/triage prod logs, see what users are typing, find missing input support, or decide what construct to build next.
---

# Log triage — what are prod users typing, and what's missing?

Turn the raw prod usage log into a **ranked, verified list of things to build**, for the operator to approve. Two apps share the pipeline: the 2-D Geo Builder (`events.jsonl`) and the 3-D Space Builder (`events-3d.jsonl`).

## What the data is

Prod events live on the server at `/var/www/geo-proxy/events.jsonl` (2-D) and `events-3d.jsonl` (3-D). Each `submit` line is a real user utterance:
`{ serverTs, iph (hashed IP), ev, sid (session), rel (build), utterance, locale, source, result }`.
- `source` ∈ `parser` | `llm` | `scope` | `limit`; `result` = `ok` | a refusal code | `not-understood`.
- Outcome buckets (mirror of `server/admin.ts`): **parsed** (deterministic grammar ✓), **llm-built** (only worked via the paid LLM fallback), **not-understood** (real gap — the LLM failed too), **refused** (a reasoned `err.code`), **out-of-scope** / **throttled** (2-D only), **deferred**.

The three buckets that matter for "what's missing", in priority order:
1. **not-understood** — users hit a wall (nothing built it). Highest priority.
2. **llm-built** — worked, but via the expensive/fragile LLM. Recurring ones are **promotion candidates**: turn them into deterministic offline grammar (this repo does this constantly — see the ADR log). Cheaper, reliable, offline.
3. **refused / out-of-scope** — mostly correct honest boundaries; scan for any that *should* be supported (a real construct behind a refusal code) or a confusing-but-legitimate refusal.

## Procedure

### 1. Fetch + bucket (deterministic — the script does it)
```
node .claude/skills/log-triage/scripts/fetch-and-bucket.mjs --app 3d          # or 2d, or both
node .claude/skills/log-triage/scripts/fetch-and-bucket.mjs --app 2d --days 30 # recent window
node .claude/skills/log-triage/scripts/fetch-and-bucket.mjs --app 3d --no-fetch # reuse local cache
```
It SSH-pulls the log to `logs/prod-events-*.jsonl` (gitignored), classifies every submit, and prints a compact **digest**: bucket counts + per-bucket tables of *deduped* utterances sorted by **distinct users** (so one power-user can't skew priorities). Reason over the digest — you do NOT need the raw log in context.

### 2. Cluster by intent
Group the not-understood / llm-built / refused utterances into **intent clusters** — the construct or phrasing each is really asking for (e.g. "bare revolution solid", "median in a triangle", "angle between a line and a plane", "the Hebrew word ארבעון for tetrahedron", "unnamed plane equation"). Note the frequency (distinct users) per cluster. Ignore obvious user typos/garbage (`AD=ו`) unless a cluster of typos points at a real phrasing we should tolerate.

### 3. VERIFY each candidate against the CURRENT parser — do NOT recommend already-fixed gaps
A logged failure may be **stale**: the user hit a cached old bundle (the ADR-3D-011 Am. cache gotcha), or we fixed it *after* they logged it. Before recommending anything, re-parse the exact utterance through the current code and classify the result:
- 3-D: `parse3(utterance)` from `src3d/parser/parse3.ts`. 2-D: `parse(utterance)` from `src/parser/parse.ts`.
- Quickest: a throwaway one-off vitest (`src3d/__tests__/_triage.test.ts`) that imports the parser and `console.log`s `parse3(u)` for each candidate, run with `npx vitest run`, then delete it. (Do NOT fire a live LLM call — operator policy; act as the oracle yourself for the LLM path.)
- Tag each cluster: **STALE** (parses fine on HEAD now — drop it), **PARSER-BUG** (should parse but misparses/refuses — a fix at the rule), **PROMOTE** (only the LLM handles it; add deterministic grammar), **REAL-GAP** (no construct exists — needs an engine/parser addition), **OUT-OF-SCOPE** (correct to refuse — leave, maybe improve the message), **USER-ERROR** (typo/garbage — ignore).

### 4. Cross-reference coverage
For REAL-GAP / PROMOTE clusters, check what already exists so the recommendation is precise:
- Catalog / coverage map: `src3d/parser/catalog3.ts` (3-D), `src/parser/catalog.ts` (2-D).
- 3-D corpus coverage + the V8 roadmap: `docs/21-572-coverage-audit.md`, `docs/20-space-vectors-tool.md` §14, `docs/06b-decisions-3d.md`.
- 2-D: `docs/06-decisions.md`, `docs/09-implementation-plan.md`.
Say whether a gap is already a planned slice, a documented deferral, or genuinely new.

### 5. Produce the ranked recommendation report
Write `reports/log-triage-<app>-<YYYY-MM-DD>.md` (gitignored) AND summarize inline for approval. For each recommendation:
- **Cluster name** + example utterances (verbatim) + **distinct-user count**.
- **Diagnosis tag** (from step 3) + evidence (what the current parser returned).
- **Proposed action** — the specific rule/construct to add or fix, and where (which file / which existing pattern it mirrors). Follow the repo's root-cause rule (docs/17): a construct, not a one-off patch.
- **Rough effort** (trivial keyword / small rule / new engine construct) and **priority** (distinct users × value ÷ effort).
- Order most-impactful first. Keep OUT-OF-SCOPE / USER-ERROR / STALE in a short "no action" appendix so nothing is silently dropped.

### 6. Hand off for approval
Present the top recommendations and **stop for the operator to approve** which to build. Do not start implementing until approved. When approved, each build follows the normal slice discipline (root-cause fix, a scenario/gate test replaying the exact prod utterance, `tsc -b`/tests green, ADR, commit+deploy).

## Rules
- **Never fire a live Anthropic/LLM call** to test the fallback (operator policy) — reason as the oracle yourself.
- Prioritize by **distinct users**, not raw submit count (dedup power-users).
- The raw pulled logs (`logs/prod-events-*.jsonl`) and reports (`reports/…`) are gitignored — they stay local; only recommendations that become work get committed as code + ADRs.
- Utterances are math constructions, not PII; IPs arrive already hashed. Safe to analyze.
- Keep the classifier in `fetch-and-bucket.mjs` in sync with `server/admin.ts` if the outcome taxonomy changes.
