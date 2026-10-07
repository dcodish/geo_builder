---
name: playsheet
description: How to build, serve, pre-play and publish the operator's play sheet, the numbered T1…Tn test-case list every "ready" report carries (CLAUDE.md standing rule 5). Use whenever a session is about to report a fix, feature, PR or fix round as ready, done or "go ahead and try", prepares a play sheet or test cases for the operator, hands a PR over for play-and-approve, or starts dev servers for the operator to play on.
---

# Play sheet — write it, serve it, pre-play it, publish it

CLAUDE.md standing rule 5 is the WHAT: the `## Heads-up`, `T1…Tn` numbered continuously, the five
fields of every case, a refusal case under its own number, every server running, every case
pre-played ([ADR-W-092](../../../docs/06w-decisions-workspace.md#adr-w-092)). This skill is the HOW.
Where they differ, rule 5 wins.

## 1. Write the cases

A case is a claim about the product, so it is measured before it goes on the sheet.

- **The student's whole action.** The Hebrew lines are one per line in a code block, exactly as typed.
  A case runs to the end of the student's action, submit included, whatever layer the fix lives in; an
  expected refusal goes in **Look for** (round #1306).
- **Every case passes the real gate.** `factsOf` commits lines the UI refuses, so "it works headlessly"
  proves nothing (#955). Drive each sequence through the product's own submit decision before listing
  it: 2-D `gateVerdict` / `driveThroughGate` (`src/__tests__/submit-gate.ts`, docs/08), 3-D the store's
  `submit` (`decideDeterministic3`), analytic `decideSubmit`. Re-validate cases copied from an earlier
  sheet, and before listing a PR's cases search for issues filed against it
  (`gh issue list --search "<PR#>"`), because a blocker found while building lives there (PR #1008).
- **Declare the start state: the canvas AND the tool.** Open with «נקה הכל» (or a reload), or say the case
  continues from the previous one, because he keeps typing into the same canvas (#942). Prefer letters no
  earlier case used. When consecutive cases change builder, say so in the instruction, not only in the
  Server line (round #1345 T22).
- **Name the builder of every count, name or section.** «מעגלים» means a different list in each tool; give
  per-tool numbers. Render a number and read it back rather than counting by eye, and prefer where a new
  thing sits ("`²` starts the second row") over a count the wrong server can satisfy (#899).
- **An absence case needs the next line.** A Look-for of "not X" adds the follow-up the student would type
  next, and what it must do; for a range, the value AT the bound (#1265).
- **A control is measured to differ from the case it controls** (#1254). A case whose payoff is "the
  student can find it" is checked on the rendered panel, not in the data (#1275).
- **A feature PR's sheet sweeps the phrasings.** Run a headless sweep (about 100 lines: plural subjects,
  word order, synonyms, «מהו / מצא את», a trailing «?», copula variants) through the real path on the
  branch AND on `main`. A spelling that fails becomes a red case or an issue, never silence (#1511).
- **A display or message fix is driven through the reported path.** Drive his own sequence in the browser
  and read the string (`[role="status"]` texts), because a line refused before commit never becomes a fact
  and fact-keyed wiring never fires (#943). Enumerate the surfaces by how far the input got: refused at
  parse, refused before commit, committed then failed.
- **Class every case.** 🎮 play (needs his hands or judgment) · 👁 look (he judges the embedded screenshot)
  · ✅ verified (record only). **Anything beyond what he asked for is always 🎮** and is named in the
  Heads-up ([ADR-W-117](../../../docs/06w-decisions-workspace.md#adr-w-117)).
- **His screenshot shows the whole run.** Before diagnosing a reported case from one, re-run the case's own
  lines on a clear canvas and read his run in the dev log (docs/17 §5 step 1); earlier cases' marks are in
  the frame (#1116 T32).

## 2. Serve it

- **The batch on `main` gets :5173; each unmerged PR gets its own port, from its own worktree.** An
  unmerged PR cannot be played on the `main` server (round #783).
- **`scripts/play-servers.ps1 -Sheet <name>`** does it all from `scripts/playsheets/<name>.servers.json`
  (`{ "main": 5173, "prs": [{ "port": 5174, "branch": "feat/…", "pr": N }] }`). It pulls a clean `main`,
  makes a worktree per PR under `C:\projects\geo-pr\<port>` with its own `npm install`, starts each server
  in its own window and waits for every port. `-Cleanup` stops the PR servers and removes their worktrees.
- **By hand**, launch detached from PowerShell:
  `Start-Process -FilePath node -ArgumentList "node_modules\vite\bin\vite.js --port N --strictPort" -WorkingDirectory <tree> -WindowStyle Hidden`.
  Never from a background Bash (it dies at the tool timeout), never through `npx` (it exits at once under
  `Start-Process`), never piped through `head` (the closed pipe kills vite while npm exits 0).
- **Ports.** Try 5173 first. The Stop hook (`scripts/ensure-test-server.mjs`) checks only 5173–5176, so a
  higher port makes it report "no server" on every turn. Poll `localhost`, never `127.0.0.1`: vite binds
  `[::1]` on this machine.
- **Kill stale servers first.** Old sessions leave vite running for days, and a `--strictPort` launch onto
  a held port exits silently while the stale server answers 200 (#1169, #1173). List
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`, read `CreationDate`, and stop anything that
  predates this session; `Get-NetTCPConnection -LocalPort N -State Listen` gives a port's PID.
- **Verify identity, never liveness.** Fetch a module from each server and grep for an identifier that
  exists only on that branch. It must be code, because vite strips comments. Then check that `main`'s
  server does NOT serve it. Read the launch log too: `already in use` means the launch failed.
- **PR servers have no LLM key, by operator ruling** (2026-09-24: lower cost, and it shows what the grammar
  lacks). A worktree never gets `.env.local`, so the fallback answers "none" in milliseconds. Never copy
  `.env.local` into one. A case only the model can pass says "PR ports have no model — expect
  «לא הבנתי»", or is played on prod.
- **Re-check the PR as you hand over**, in the same compound: `gh pr view <n> --json state` and
  `git tag -l 'prod/*' --sort=-creatordate | head -1`. A parallel session can merge and deploy it while the
  sheet is being written; then point him at prod instead (PR #1143).

## 3. Pre-play it

- **Write the spec** `scripts/playsheets/<name>.json` (tracked):
  `{ "name", "title", "cases": [{ "id": "T1", "title", "class": "play|look|verified", "product": "2d|3d|complex|analytic", "base": "http://localhost:5173", "path"?, "lines": [...], "lookFor", "before", "expect"?: [...], "expectAbsent"?: [...], "expectRefusal"?, "asks"?: [...], "cycles"?: N, "after"?: [{ "toggle": row } | { "type": "…" }] }] }`.
  `expectRefusal` flips the case: it passes only when a refusal containing that text appears.
- **Run** `npm run playsheet -- --sheet scripts/playsheets/<name>.json` (`--out <dir>` optional). It types the
  lines, asks the asks, presses «הציגו תצורה אחרת», audits the captures and writes
  `reports/playsheets/<name>/report.html` beside the screenshots. It exits non-zero on any red case.
- **Read every screenshot.** The audit proves a capture is real, not that it is right. A mechanically red
  case goes back to the fix; he never receives one.
- **UI-touching work also passes** `npm run smoke:visual -- --app <2d|3d|complex|analytic> --base http://localhost:PORT`
  (docs/22 §4).
- **A bespoke probe** the spec cannot express is a Playwright script inside the repo, because a scratchpad
  `.mjs` cannot resolve `playwright`: copy it to the repo root, run it, delete it. Reuse `visual-smoke.mjs`'s
  `dismissModal` (the first-visit About modal intercepts every click), and in 2-D `fill()` the input
  without clicking it.

**The driver's two blind spots** (round #1571). Both read as false reds: look at the screenshot before
believing a red, and never change the product to satisfy them.
1. **Slow answers.** `waitForSettle` returns once the SVG has been unchanged for 450 ms, so a 2-D refusal that
   lands after ~2 s, or a line that settles after ~3 s, is read before it appears (the shot shows «חושב…»).
2. **⚠-channel notices.** `refusals()` counts every `role=status` text that starts with ⚠, so a committed
   row carrying a notice reads as refused.

Verify such a case with a timed probe built on the driver's helpers (`APPS`, `refusals`, `dismissModal`)
that waits for «חושב» to disappear, on the branch AND on `main`, and record it as verified-by-probe with
the timings. A probe reporting ~3 ms per line never waited.

## 4. Publish it

- **The page** is the driver's `report.html` with its screenshots, published with the Artifact tool (the
  shots as `files`). A fix round publishes it as the play-sheet half of its round report (fix-round
  Step 5b).
- **The chat report** carries the same list: `## Heads-up`, then each case as `### T<n> · <title>`,
  **Server:** the URL with its path, the utterances in a code block one per line (never a table, never "the
  lines are on the issue"), **Look for**, **Before**. Say which server is `main` and which is each PR. The
  chat copy, the issue copy and the page carry the same cases.
