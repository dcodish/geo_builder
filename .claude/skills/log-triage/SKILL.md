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
npx vite-node .claude/skills/log-triage/triage.mjs --app 2d --reverify # ignore the session cache (full sweep)
```
Run it with **vite-node** (it imports the real TS parsers/builders). It:
1. SSH-pulls the log to `logs/prod-events-*.jsonl` (gitignored).
2. Classifies every submit; dedups the interesting buckets by **distinct users** (so one power-user can't skew priorities).
3. **Re-runs every utterance through the App's REAL submit path** ([ADR-346](../../../docs/06-decisions.md#adr-346)) — each session's (`sid`) submits replayed **in order**, so a construct sees the figure the student actually had. Per utterance: store ops → `parse(u, buildParseCtx(figure))` → clarify → the pre-LLM out-of-scope register → the five honesty gates → `replay`. An utterance is judged by its **best outcome across occurrences**. Buckets:
   - **▶ LIVE grammar gaps** — still `not-handled` in a real session context → *the worklist* (the App would escalate these to the LLM).
   - **✓ Already fixed — AUTO-REMOVED** — builds now, in context.
   - **⇗ Would ESCALATE** — parses, but an honesty gate drops a stated given, so the App sends it to the LLM rather than committing. A *partial-parse* signal, not a grammar gap.
   - **⊘ Guided out-of-scope** — the App answers these on purpose, pre-LLM (ADR-289: `analytic`, `orientation`, `ui-command`, `cross-app`, …). **Not gaps.**
   - **◇ Parses but builds nothing** — context / re-declaration (the M1 class).
   - **⚠ Reasoned refusals / clarify** — real `err.code`s and `ambiguous-*` clarifications.
   - **? UNVERIFIED** — seen only after a step we cannot replay, or over the session budget. **Not evidence either way** (see below).
4. Writes the report to `reports/log-triage-*.md` (gitignored) and prints it.
5. Uploads a distilled **verdict map** (`verdicts-<app>.json`, utterance → current outcome, stamped with the git rev) to the prod box next to the events file (#183) — the admin dashboard's «פערים אמיתיים» card reads it to annotate its rows and move verified-built ones into «תוקן מאז», stating the verdicts' revision/age. Best-effort: an offline run skips the upload and the dashboard says so.

You reason over the **▶ LIVE** section — already-fixed, guided, would-escalate and unverified rows are separated out, so nothing you recommend is a duplicate of what already ships or of what the tool answers deliberately.

### Incremental runs — read this before re-triaging old ground ([ADR-346](../../../docs/06-decisions.md#adr-346) Am. 2)

The run is incremental in two independent ways:

- **The worklist splits.** `▶ LIVE — NEW since the last triage` is what you actually work on. Rows surfaced in an earlier run collapse into `↩ carried over` with a **1st-seen** date. **Counts stay all-time** deliberately (a watermark that only counted new events would reset distinct-user counts each window and bury a cluster hit by 3 users over 3 months). So: rank by the all-time `users` column, but *spend your attention on NEW* — carried-over rows were already put in front of the operator, and re-arguing them is the noise this split exists to remove. Expand them only if a decision is pending, or if a NEW row makes an old cluster suddenly worth more.
- **Verification is cached.** Session verdicts live in `logs/triage-state-<app>.json` (gitignored, per-machine — raw utterances stay out of git; a fresh machine just does one full run). Later runs replay only sessions that are new, that grew, or that hold a still-open row. The header states the split (`N replayed, M from cache @ <rev>`). Sessions where everything already builds are trusted until `--reverify` — **a regression in already-working input is the test suite's job, not triage's.** Use `--reverify` when you specifically want to re-confirm the ✓-already-fixed set (e.g. after a risky parser refactor), and `--no-state` for a stateless one-off.

A first run on a machine reports `previous triage: none (first run — every row is new)` and takes the full sweep (~10 min for 2-D, ~3 s for 3-D). That's expected, not a bug.

> **The one blind spot — don't paper over it.** When our grammar can't reproduce a step, the harness replays **what the LLM actually committed** (the `commands` field, issue #84), so the prefix stays faithful and the rest of the session remains real evidence. Where that isn't available — 2-D LLM steps logged before 2026-07-14, 3-D ones before 2026-07-17 (#182 closed the gap: the 3-D sink now logs the LLM's canonical lines and session3d re-parses them), or a store `action` the replay cannot reproduce (edit / delete / show-another / slider / load; `clear`/`undo`/`redo` ARE followed in both apps) — our figure is genuinely missing objects the student had, so any later failure may be *our artifact*. Those verdicts are marked `degraded`, never become LIVE rows, and land in **? UNVERIFIED**. If a `?` row matters to a recommendation, re-check it by hand (build the prefix yourself) — never promote it to a gap on the strength of the report alone.

> **Keeping the mirror honest ([ADR-346](../../../docs/06-decisions.md#adr-346)).** This harness's verify path mirrors `App.tsx#submit`, and that mirror has drifted **three times**, each time silently converting the instrument into confident false signal (issue #35). `src/parser/__tests__/triage-mirror.test.ts` fails when the App's `PRE_LLM` set or its gate call-list changes without this file following — but it is a *text* guard and cannot prove semantic equivalence. **When the App's submit path changes, update `triage.mjs` in the same commit.** A missing gate is a false gap; a skipped gate silently marks a real gap "already fixed."

## Step 2 — cluster the LIVE gaps by intent

Group the surviving utterances into **intent clusters** — the construct or phrasing each is really asking for (e.g. "the student who doesn't NAME things: `אמצע AB` / `נתון מעגל` / `קוטר` with no labels", "generic polygon noun `מצולע`", "the definite line: `נקודה G על הקו`", "Hebrew word-numbers `שלושים מעלות`"). Weight by **distinct users** per cluster. Drop obvious garbage (keyboard-layout gibberish like `RTV FK VBEUSU`, `AD=ו`) — but a *cluster* of near-identical typos can itself argue for tolerating a phrasing.

> Deliberately **don't** re-cluster what the report already separated: `⊘ guided` rows (UI commands, orientation, analytic, cross-app) are answered on purpose, and `✓ already fixed` rows ship today. Those examples used to live in this list — diagonals, altitude-from-a-vertex, `כדור`/`חרוט`, `ארבעון`, point-outside-a-circle — and every one of them is now BUILT. Trust the buckets over any example text, including this one: a stale example is how a triage ends up recommending what already exists.

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
- Raw pulled logs (`logs/prod-events-*.jsonl`), the triage state (`logs/triage-state-*.json`) and reports (`reports/…`) are gitignored — local only; only approved work gets committed as code + ADRs. The state file holds verbatim utterances, so it stays out of git for the same reason the logs do; the cost is that the first run on each machine is a full sweep, which is fine.
- Utterances are math constructions, not PII; IPs arrive already hashed. Safe to analyze.
- **Prioritize by all-time `users`, but spend attention on the `▶ NEW` rows** — `↩ carried over` was already put in front of the operator. Don't re-argue it unless a decision is pending or a new row changes its weight.
- Keep the classifier + build paths in `triage.mjs` in sync with `server/admin.ts`, `App.tsx#submit`, and the store APIs if they change — `src/parser/__tests__/triage-mirror.test.ts` guards the submit mirror (ADR-346), nothing guards the `admin.ts` bucket mirror.
- A **`⊘ guided`** or **`⇗ would-escalate`** row is not a gap. If you want to change what the tool does there, that's a product decision (the scope register / a gate) — raise it as such, don't file it as missing grammar.
