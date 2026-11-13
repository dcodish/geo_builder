scripts/perf — the four "how long does a student wait" timing harnesses (issue #2867)
=====================================================================================

Each builder has its own harness. It replays real sequences — the product's fixtures, its scenario corpus, prod
sessions and the operator's dev sessions — through that builder's REAL code and times every student action:
submit a line, «הציגו תצורה אחרת», load a saved figure, edit a row, delete a row.
Use them before and after an optimisation, on the same machine.

Every action is measured twice in the same run: its TIME, and its WORK — the work meter's three counts (#2873,
ADR-W-210): solver work in units, in all / on the page's UI thread / before the figure can paint. One unit is one
evaluateCore call (2-D), one residual evaluation (3-D, analytic), one exact solve (complex). The actions themselves
live in each product's tests — <tree>/__tests__/work-meter/driver*.ts — and are the SAME code the suite's work-meter
gate runs, so a count read here and a count the gate fails on describe the same action.

Run everything from the repo root. Nothing here ever calls the LLM: each harness drives only the deterministic
lane and stubs globalThis.fetch to throw (the stub sits right under the imports of each harness .ts file).

ENTRY COMMANDS (full sweep)                                    takes about
  node scripts/perf/2d/driver.mjs                              2 hours
  node scripts/perf/3d/drive3.mjs                              30 minutes
  node scripts/perf/analytic/driver.mjs                        35 minutes
  node scripts/perf/complex/sweep.mjs                          1 minute (it confirms as well)

ONE CASE / A FEW CASES (--only; under a minute each)
  node scripts/perf/2d/driver.mjs --only fixture:2022-summer-a-issue59.geo.json,issue:2513
  node scripts/perf/3d/drive3.mjs --only "fx:altitude-on-existing-d-1942.geo3.json,issue:#2787 square"
  node scripts/perf/analytic/driver.mjs --only "answer-in-parameter-q16-2735.analytic.json,#1647 touch sentence"
  node scripts/perf/complex/sweep.mjs --only "fixture:2b-capstone,probe:roots-deg36"
A subset run prints every action it timed and writes only.jsonl (complex: only.json); it never touches the full
sweep's files. Ids: 2-D  fixture:<file> | issue:<name> | scenario:<id> | prod:<sid> | debug:<session>
                    3-D  fx:<file> | issue:<name> | prod:<sid> | dbg:<session>      (sweep3.ts -- --list)
                    analytic  <fixture file> | <issue name> | <sid> …               (harness.ts -- --list)
                    complex   fixture:<name> | probe:<name> | prod:<sid> | debug:<session>

AFTER A FULL SWEEP
  confirm  — re-measure every action of 3 s or more, alone, in a fresh process, twice:
      node scripts/perf/2d/confirm.mjs          (about 1 hour; also profiles each one)
      node scripts/perf/3d/confirm3.mjs         (about 1 hour)
      node scripts/perf/analytic/confirm.mjs    (about 30 minutes)
      complex: sweep.mjs already did it
  profile  — a CPU profile of ONE action and a summary of where its time goes:
      node scripts/perf/2d/profile.mjs "12:9:submit"                       itemIdx:step:action
      node scripts/perf/3d/profile3.mjs "issue:#2787 square@2"             task@action index   (or --slowest 5)
      node scripts/perf/analytic/profile.mjs "issue|#1647 touch sentence|7"   the record's key  (or --slowest 5)
      node scripts/perf/complex/profile.mjs "probe:roots-deg36@submit#1"   item@action         (or --slowest 5)
      node scripts/perf/lib/profsum.mjs <file.cpuprofile> [topN] [underFunction]     summarise any profile again
  summarise — counts per action and wait bucket, the slow-action table (the sweep and confirm steps run it):
      node scripts/perf/2d/analyze.mjs --list
      node scripts/perf/3d/analyze3.mjs --list
      node scripts/perf/analytic/summarize.mjs --list
      node scripts/perf/complex/sweep.mjs --summarize

WHERE THE OUTPUT GOES
  reports/perf/<2d|3d|analytic|complex>/   (override with --out <dir>, e.g. --out reports/perf/3d-after)
  reports/ is gitignored, and must stay so here: the result files carry prod utterances. Never commit them.
  A full sweep moves the previous run's files to <out>/previous/ (one generation — a free "before").
  Each folder ends up with: the raw results, measurements.json, counts.md, tableA.md (every action of 5 s or
  more with the sequence that leads to it), and the profiles.

INPUTS
  Fixtures and scenario corpora come from the repo. Prod sessions come from logs/perf-prod-events[-3d|-analytic|
  -complex].jsonl, else from the log-triage pull logs/prod-events-<product>.jsonl; dev sessions from
  logs/debug-log[-3d|-analytic|-complex].jsonl. logs/ is gitignored and per machine: a missing file is reported
  as "no data" and that corpus is skipped (--prod / --debug name another file).

THE WORK METER'S OWN COMMANDS (scripts/perf/work-meter.mjs; it runs the gates under vitest and takes the suite lock)
  npm run work:report                          every builder's totals, from the committed baselines (no run)
  npm run work:check -- 2d                     one builder's gate alone (2d | 3d | analytic | complex | all)
  npm run work:record -- 3d --only <fixture>   record a new fixture's counts (seconds); without --only: the whole builder
  npm run work:record -- 2d --accept-rise      write counts that ROSE — only with the numbers in the change's ADR
  npm run work:check -- 2d --slow              the SLOW CORPUS: the open speed issues' own sequences
                                               (<tree>/__tests__/work-meter/slowCorpus*.ts), against baseline-slow.jsonl.
                                               Too slow for the suite, so it is checked and recorded here, on demand.
  The baselines are <tree>/__tests__/work-meter/baseline.jsonl (and baseline-slow.jsonl); docs/08 "The work meter" says when.

COMPARING RUNS
  Timings (every "ms") are only comparable on a QUIET machine — no test suite, no second sweep, same machine,
  before and after. The four harnesses run one at a time for the same reason.
  WORK is clock-free and comparable anywhere, under any load: every record of every harness carries
  work { total, page, prePaint }, and each summary prints the corpus's total with its page and before-paint shares.
  One exception, 2-D only: a harness runs the browser's clock budgets, so an action marked `clipped` (a 12 s search
  budget was hit) stopped where the machine's speed put it and its count is not reproducible. The gate and
  work-meter.mjs run with no clock, so THEIR 2-D counts are exact and are the whole search's.
  Other clock-free counters: 3-D records resolves / lmSolves / lmEvals / uncached per action, analytic poolSlices.
  A profile's percentages are comparable anywhere; its milliseconds are a timing.

LAYOUT
  <product>/<harness>.ts     the corpora, the jobs and the CLI, run under vite-node; imports only its own product
                             tree (+ shell/). The actions it measures are <tree>/__tests__/work-meter/driver*.ts
  work-meter.mjs             record / check / report the work-meter baselines (above)
  <product>/*.mjs            driver (watchdog: an action silent for 60 s is killed and recorded), confirm,
                             profile, summarise — each file's header says what it does and writes
  lib/common.mjs, lib/profsum.mjs    plumbing shared by the .mjs scripts; no product code
