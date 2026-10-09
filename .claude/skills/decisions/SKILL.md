---
name: decisions
description: Walk the operator through every open decision blocking the queue — one at a time, in plain language, with real options and a marked recommendation — and transcribe each ruling to GitHub as it is given, so the pass ends with every product question asked and answered, and the plans that follow from his answers armed. Use when the operator asks to go through decisions, clear what needs their attention, unblock the queue, answer open questions, "what do you need from me", "מה צריך ממני", or wants to hand over enough rulings that work can continue without them.
---

# Decisions — the operator-unblocking pass

The operator's time is the scarcest resource in this project. This skill spends it well: it does **all
the reading first**, then asks only what genuinely cannot be decided without them, one question at a
time, in the language of *what a student sees* rather than what the code does.

**The goal state.** When this pass ends, every open issue is in exactly one of four states:

1. **Armed** — `auto-ok`, with a concrete plan a fix round can execute unattended
2. **Deferred** — the operator said not now, and the reason is recorded on the issue
3. **Closed** — the ruling resolved it (wontfix, duplicate, already true)
4. **Blocked on something that is not the operator** — an upstream issue, a PR in flight

Nothing is left in "waiting on the operator". That is the whole deliverable: **no product question is
left unasked**, and the plans that follow from his answers are armed. Armed work is a by-product of his
rulings, never the goal: a pass that arms plans he has not seen has failed (CLAUDE.md rule 7).

## What this pass is NOT

- **Not a fix session.** It rules and it plans; it never implements. Fixes go to `/fix-round` after.
- **Not triage.** It does not file new issues from operator reports — that is standing rule 3's job.
- **Not a status report.** `/status-update` describes the queue; this one *empties the blocking half* of it.

---

## Step 0 — preconditions (abort, don't improvise)

- Pull the live queue. **Never work from memory or from an earlier report in this session** — a parallel
  session may have ruled, armed, or closed something since.
- Check the shared tree's branch and that it is clean. This pass writes only to GitHub, but a dirty tree
  usually means another session is mid-work; say so before starting.
- If an issue is labeled `in-round` and a round is genuinely executing right now, **do not touch that
  issue** — it will be rewritten under you. Note it and move on.

---

## Step 1 — build the blocking queue

Delegate the heavy read to the **`decision-dossier` agent** (`.claude/agents/decision-dossier.md`). It
reads every open issue, its comments and the ADR tails, and returns compact dossiers. Doing that read
inline burns the context the conversation itself needs.

**What counts as blocking** — the label lags reality, so scan for all eight, not just the first:

| # | Shape | Example |
| --- | --- | --- |
| 1 | Labeled `needs-operator` | a design awaiting sign-off |
| 2 | An **unanswered question** in the body or a comment, unlabeled | "the options are not equivalent…" with no reply |
| 3 | **Ruled but unplanned** — the product question is settled, the mechanism is not | "say the word and I will write the plan" |
| 4 | **Unusable filing** — no body, lost body, or a diagnosis too stale to act on | a body that is literally `@-` |
| 5 | A plan that is a **sketch with open options** — it needs a pick, not a blessing | "(a) or (b), recommend (a)" |
| 6 | An open **PR awaiting play-and-approve** | finished work nobody has validated |
| 7 | `in-round` with **no round running** — a crashed round | its ledger says what half-landed |
| 8 | Anything whose resolution **unblocks ≥2 other issues**, however it is labeled | a design four issues wait on |

**Order by unblock value, not by priority.** A P3 decision that frees five issues outranks a P2 that
frees none — the point of this pass is throughput after it ends. Break ties with P1 > P2 > P3.

An issue that merely *lacks* a plan is **not** automatically blocking. If the plan is writable from the
code and the rulings already on record, **write it** — and arm it only if every line of its
`## What the student will see` is `[asked]`, `[ruled]` or `[2-D]` (CLAUDE.md rule 7). Do not spend an
operator question on mechanism the session can work out. Bring them only what is genuinely theirs: product behaviour, pedagogy, UX,
scope, priority, and anything that reverses a shipped promise.

---

## Step 2 — the dossier (all of it, before the first question)

Every dossier is prepared **before** the operator is asked anything. They should never wait while a
session goes off to read code mid-conversation.

Each carries:

- **The symptom, in one sentence, from the student's side.** What they type, what they get. No ADR ids,
  no file names, no layer names. If it cannot be said this way, the session has not understood it yet.
- **Why it is stuck on you** — name the specific thing only the operator can decide.
- **2–4 options.** For each: what the student would see, roughly what it costs, and **what it forecloses**.
  Options must be genuinely different outcomes, never one answer in three phrasings.
- **A recommendation**, clearly marked as the session's, with one line of why.
- **What it unblocks** — the issue numbers that come free.
- **What happens if they skip** — the honest default, usually "today's behaviour continues".

**Verify before offering.** An option claiming "this already parses" or "this is a small change" must
have been measured at HEAD, not assumed. A dossier built on a guess wastes a ruling — and a wrong ruling
is worse than no ruling, because it gets recorded and then built.

---

## Step 3 — ask in an HTML artifact, never in the chat

**Every decision goes to him on a published HTML page, one card per decision, with the answers tapped on
the page** ([ADR-W-122](../../../docs/06w-decisions-workspace.md)). **Never `AskUserQuestion` for a
decision whose text contains Hebrew, and never for a pass's set of decisions.** His ruling of 2026-10-09:
*"the rtl and hebrew are wrong in vscode and I might give wrong answers"* — the terminal and the question
chrome reorder RTL runs, so a Hebrew option reaches him scrambled and he answers the wrong one. A wrong
ruling is worse than no ruling: it gets recorded, then built.

**How the page is built:** load the `artifact-design` and `artifact-capabilities` skills, declare
`capabilities: {db: {}, user: {}}`, write each answer to a `rulings/<key>` document (`choice`, `label`,
`note`, `at`), and read them back with the `ArtifactData` tool. Verify the store with one probe
write-then-delete before handing over the link — a page that cannot save is a pass with no record.

- **Hebrew is isolated, not just present.** Every Hebrew run sits in its own block with `direction: rtl`
  and `unicode-bidi: isolate`, and the outcome goes on its own LTR line beneath it — never inline after
  the Hebrew, where the bidi algorithm reorders it. Mixed Latin letters (`ABCD`), `∠`, `°` and `·` inside
  a Hebrew sentence are exactly what breaks in the chat; isolation is what fixes it.
- **One card = one decision.** Never bundle two decisions into one question. A card with several
  sub-questions (one model, five answers) gives each its own saved answer.
- **Plain language on the page; precision in the transcription.** He is deciding what the product should
  DO. Mechanism names belong in the comment written afterwards, not on the card.
- **Recommendation first, labeled "Recommended".**
- **Always include the real "leave it as it is" option** when that is a genuine choice — it usually is.
  Omitting it manufactures consent for a change.
- **Show, don't describe.** Every card carries a "today, at HEAD" block: the utterance, then what the
  tool does with it now. For a wording decision, show the full sentence in both forms.
- **The displayed option letter must equal the stored value.** If the card shows `A` and saves `B`, a
  ruling quoted back as "I picked A" is transcribed wrong.
- **A free-text note per card**, so an answer that fits no option still arrives in his own words.
- Each card names **what it unblocks**, so he can see which answers free the most work.

**Pacing is his, not the pass's.** The page carries every decision at once and he works it at his own
speed, so do not ration questions or stop every six — but do not wait in silence either: read the store
when he says he is done, or when he answers some and asks what is left.

**If his answer fits no option**, take it as given. His words win over the menu.

---

## Step 4 — transcribe each ruling IMMEDIATELY

**As each answer arrives, before reading the next one off the page.** Never batch to the end: a session
that dies mid-pass must leave every answered decision already recorded on GitHub. The page is a ballot,
not the record — a tapped answer that was never transcribed is a ruling the next session cannot find.

Per ruling:

1. **Comment it on the issue.** The operator's words in substance, quoted verbatim where they were
   verbatim, dated. **The comment opens with the canonical heading, verbatim:** `## Operator ruling — YYYY-MM-DD`
   — it is the one shape `scripts/queue-hygiene.mjs` is guaranteed to read as an answer (#1325, ADR-W-073);
   a pass that invents its own phrasing is how a ruled thread reads as unanswered. Then what it changes about the issue and the scope it now has. **Never revise the
   issue body** — a body is written once; rulings live in comments.
2. **Update the labels to match the new truth:**
   - clear `needs-operator`
   - apply `auto-ok` **only** when the ruling leaves a concrete, self-contained plan whose
     `## What the student will see` has no `[proposed]` line (per
     [ADR-W-014](../../../docs/06w-decisions-workspace.md) Am. 1 and ADR-W-117), with an audit comment
     quoting the approval and its date
   - relabel `bug` → `feature` when the ruling says the gap is a missing capability
   - re-prioritise when the ruling changes what is at stake
3. **Name the ADR obligation.** A ruling that settles a design or reverses shipped behaviour requires an
   ADR — say which log it lands in (`06` 2-D · `06b` 3-D · `06c` analytic · `06d` complex · `06w` cross-product) and let
   the implementing session write it. An ADR is required for any significant decision.
4. **A deferral is a resolution.** Record it as one: what was asked, what they said, what happens
   meanwhile. Do not leave it looking unasked.

**What must never be treated as a ruling:** silence, enthusiasm, "sounds good" about something else, an
old prose approval sitting in an issue body, or the session's own recommendation going unopposed. If the
operator did not decide it in this pass, it stays blocked and is reported as blocked.

---

## Step 5 — convert rulings into autonomous work

A ruling that leaves no plan has not unblocked anything. For each issue ruled this pass:

- If the mechanism is now derivable, **write the fix plan into the issue** (root cause, mechanism, files,
  locks — per [docs/22 §2b](../../../docs/22-workflow.md) and docs/17), then arm it.
- If the same wrong outcome reaches further than the reported instance (other spellings, rules, seeds or
  builders), say so in the plan: a plan scoped to one symptom is a patch waiting to be committed
  (standing rule 1). A **new** outcome the operator did not rule is never "the class" — it is a
  `[proposed]` line and a question for him (rule 7).
- If the mechanism still is not derivable, say plainly what is missing and what would settle it. That is
  an honest outcome; a vague plan that arms itself is not.

---

## Step 6 — close out

Report, in this order:

1. **Decisions made** — one line each: the question, their answer, the issue's new state.
2. **Now armed** — the issues that gained `auto-ok`, and the concrete fix-round composition(s) that can
   run unattended. Say how many rounds' worth of work now exists.
3. **Still blocking, and why** — honestly. If something is still stuck on them it goes here, not into a
   hopeful summary. If nothing is, say so plainly.
4. **ADRs owed** — which rulings need one, and in which log.
5. **What to do next** — the single next command, usually `/fix-round`.

---

## What this pass never does

- Never implements a fix, opens a PR, or touches product code
- Never asks a question the session could have answered from the code, the ADRs, or the issue itself
- Never arms an issue the operator deferred, or one whose plan is still a sketch
- Never guesses across products — if which product a decision belongs to is unclear, that is itself the
  first question
- Never presents its own recommendation as the operator's decision, in a comment or in the report
