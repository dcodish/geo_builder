---
name: triage-new-rows-cross-check
description: "Until #502 lands, /log-triage \"NEW\" rows must be cross-checked against the issue tracker — per-machine state resurfaces already-filed rows after a PC switch"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0ef508ec-3501-4378-bd30-45ba9816a358
  modified: 2026-08-10T11:34:25.247Z
---

Until [#502](https://github.com/dcodish/geo_builder/issues/502) is fixed, the `/log-triage`
"▶ NEW since last triage" split cannot be trusted across [[work-pc-cross-machine]] switches: the
state file (`logs/triage-state-*.json`) is per-machine and gitignored, so a triage run on one PC
relabels rows already filed — even operator-approved or fixed — from the other PC's runs as NEW.

**Why:** The 2026-08-10 triage (work PC) listed the #449 and #448 utterances as NEW although the
2026-08-08 triage (home PC) had filed and gotten approval for them; it nearly re-recommended them.

**How to apply:** Before recommending any NEW row, search `gh issue list --state all` for its
utterance/construct. Also check recently closed issues — a "LIVE gap" row can be a false gap from
triage-mirror drift (#501, the #35 class): verify a suspicious row against the App's real pre-parse
guards (`src/app/submitPipeline.ts`), not just the report.
