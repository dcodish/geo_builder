---
name: log-triage
description: Triage the PRODUCTION usage logs of the Geo Builder (2-D) and the 3-D Space Builder — pull the real user utterances from the server, bucket them by outcome, RE-RUN each candidate against the current code so already-fixed items drop off automatically, then cluster the surviving failures by intent and produce a ranked "what should we add" recommendation for the operator to approve. Use when the operator asks to analyze/triage prod logs, see what users are typing, find missing input support, or decide what construct to build next.
---

# Log triage — what are prod users typing, and what's genuinely still missing?

Turn the raw prod usage log into a **ranked, HEAD-verified list of things to build**, for the operator to approve. One pipeline serves both apps (2-D Geo Builder `events.jsonl`, 3-D Space Builder `events-3d.jsonl`) with an identical report shape.

## What the data is

Prod events live on the server at `/var/www/geo-proxy/events.jsonl` (2-D) and `events-3d.jsonl` (3-D). Each `submit` line is a real user utterance: `{ serverTs, iph (hashed IP), ev, sid, rel, utterance, locale, source, result }`.
- `source` ∈ `parser` | `llm` | `scope` | `limit`; `result` = `ok` | a refusal code | `not-understood`.
- Outcome buckets (classifier mirrors `server/admin.ts`): **parsed** (deterministic grammar ✓), **llm-built** (only the paid LLM fallback handled it), **not-understood** (real gap — the LLM failed too), **refused** (a reasoned `err.code`), **out-of-scope** / **throttled** / **deferred**.

## Step 1 — run the pipeline (fetch + bucket + verify-against-HEAD, all in one)

```
npx vite-node .claude/skills/log-triage/triage.mjs --app both        # both apps
npx vite-node .claude/skills/log-triage/triage.mjs --app 3d          # one app
npx vite-node .claude/skills/log-triage/triage.mjs --app 2d --days 30 # recent window
npx vite-node .claude/skills/log-triage/triage.mjs --app 3d --no-fetch # reuse local cache
```
Run it with **vite-node** (it imports the real TS parsers/builders). It:
1. SSH-pulls the log to `logs/prod-events-*.jsonl` (gitignored).
2. Classifies every submit; dedups the interesting buckets by **distinct users** (so one power-user can't skew priorities).
3. **Re-runs each distinct utterance through the CURRENT code** — `parse`+`replay` (2-D) / `parse3`+`derive3` (3-D) — and sorts it by its outcome TODAY:
   - **▶ LIVE grammar gaps** — still `not-handled` on HEAD → *the worklist*.
   - **✓ Already fixed — AUTO-REMOVED** — builds now (the user hit a stale cached bundle, or we fixed it after they logged it). This is the "remove what we already fixed" step, automatic.
   - **◇ Parses but builds nothing standalone** — context / re-declaration (the M1 class), not a grammar gap.
   - **⚠ Reasoned refusals / needs prior context** — real `err.code`s or utterances that need an earlier fact (e.g. a plane referenced before it's defined).
4. Writes the report to `reports/log-triage-*.md` (gitignored) and prints it.

You reason over the **▶ LIVE** section — the already-fixed items are gone, so nothing you recommend is a duplicate of what already ships.

## Step 2 — cluster the LIVE gaps by intent

Group the surviving utterances into **intent clusters** — the construct or phrasing each is really asking for (e.g. "draw the diagonals `אלכסונים`", "altitude-from-a-vertex phrasings", "bare revolution solid `כדור`/`חרוט`", "`ארבעון` = tetrahedron", "point outside a circle", "angle between a line and a plane"). Weight by **distinct users** per cluster. Drop obvious garbage (keyboard-layout gibberish like `RTV FK VBEUSU`, `AD=ו`) — but a *cluster* of near-identical typos can itself argue for tolerating a phrasing. Separate genuine constructs from **UI/command requests** (`תמחק את F`, `הצג את האנך`, `מה אורך…?`) — those are features/questions, not parser gaps.

## Step 3 — cross-reference coverage

For each cluster, check what already exists so the recommendation is precise and root-cause (docs/17 — a construct, not a one-off patch):
- Catalogs: `src3d/parser/catalog3.ts` (3-D), `src/parser/catalog.ts` (2-D).
- 3-D: `docs/21-572-coverage-audit.md`, `docs/20-space-vectors-tool.md` §14, `docs/06b-decisions-3d.md`. 2-D: `docs/06-decisions.md`, `docs/09-implementation-plan.md`.
- Say whether a gap is a planned slice, a documented deferral, or genuinely new, and which existing rule/pattern a fix would mirror.

## Step 4 — classify, file bugs, ranked recommendation, then STOP for approval

**Classify every cluster per [docs/22-workflow.md](../../../docs/22-workflow.md) (ADR-265):** type **`bug`** (the tool did the WRONG thing — wrong/partial figure with ✓, silently dropped given, half-parse, misleading refusal, crash) vs **`feature`** (an honest refusal/escalation on a missing capability — most LIVE grammar gaps), plus a proposed **P1/P2/P3** (P1 = a student can see a wrong-but-plausible figure or lose a given silently; P2 = real demand; P3 = tail).

**File the `bug` clusters as GitHub issues NOW** (they are reports, not build decisions): dedupe against `gh issue list --state open` first, then `gh issue create` with labels `bug` + priority + app, body per docs/22 §1. **`feature` clusters are recommendations** — include ready-to-file issue text in the report; file them only after operator approval.

Summarize the top recommendations inline (and they're already persisted in the report file). For each: cluster name + type + proposed priority + verbatim examples + distinct-user count + proposed root-cause action (rule/construct + where) + rough effort, most-impactful first. Keep garbage / UI-requests / out-of-scope in a short "no action" note so nothing is silently dropped.

**Do not start building** until the operator approves which items to pursue. When approved: file the approved feature issues (labels `feature` + priority + app), then each build follows the docs/22 feature route (a `feat/<issue#>-slug` PR) + the normal slice discipline: root-cause fix, a scenario/gate test replaying the exact prod utterance, `tsc -b`/tests green, an ADR, merge + deploy.

## Rules
- **Never fire a live Anthropic/LLM call** to test the fallback (operator policy) — reason as the oracle yourself.
- Prioritize by **distinct users**, not raw submit count.
- Raw pulled logs (`logs/prod-events-*.jsonl`) and reports (`reports/…`) are gitignored — local only; only approved work gets committed as code + ADRs.
- Utterances are math constructions, not PII; IPs arrive already hashed. Safe to analyze.
- Keep the classifier + build paths in `triage.mjs` in sync with `server/admin.ts` and the store APIs if they change.
