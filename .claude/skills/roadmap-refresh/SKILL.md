---
name: roadmap-refresh
description: Refresh the operator's roadmap overview page (a claude.ai artifact with its own database) from the live GitHub queue — plan issue states, a dated snapshot of counts by workstream, phase and tool × priority — and transcribe any decision he answered on the page. Use at the end of every fix round and every status update, and whenever the operator asks to refresh, update or sync the roadmap, the dashboard or "the page".
---

# Roadmap refresh — keep the overview page current

The roadmap overview is https://claude.ai/artifact/2RxjAuuDfhvG5kcNAFw7Ew. It reads only its own
database; it cannot reach GitHub, and the operator's claude.ai account has no GitHub connector
(checked 2026-10-27). So the page is exactly as current as the last session or daily cloud run that refreshed it
([ADR-W-159](../../../docs/06w-decisions-workspace.md#adr-w-159), #2557). The fix-round and
status-update skills run it as their last step; it also runs alone.

Load the `ArtifactData` tool first. Every call below takes `url` = the page above. Keep the files in
the session scratchpad, never in the repo.

## The database

| Doc | Holds | Who writes it |
| --- | --- | --- |
| `plan/current` | the weeks and the workstreams, each with its issue numbers | a session, when the plan changes |
| `state/issues` | each plan issue's title, state, labels, `closedAt`, plus `asOf` | this skill |
| `snapshots/<YYYY-MM-DD>` | counts: open total, by phase, by tool × priority × type, per workstream | this skill, one per day |
| `decisions/<id>` | a plan decision: `open` → `answered` (he clicked on the page) → `recorded` | the page, then this skill |
| `tools/snapshot` | a pointer to `scripts/roadmap-snapshot.mjs` | — |

**The earliest snapshot (2026-10-26) is the baseline the page measures progress from. Never overwrite
or delete it.** A second refresh on the same day replaces that day's snapshot (pin `if_version`).

## Steps

1. **Read the plan.** `get` `plan/current` with `out_dir` set to a scratch folder.
2. **Compute.** `node scripts/roadmap-snapshot.mjs <that plan/current.json> <scratch out-dir>`. It
   prints the date, the plan week and the open total.
3. **Write.** One `batch`: `set` `state/issues` from `issues.json` (pinned to the version step 1's
   listing or an earlier read showed; read it if you have not) and `set` `snapshots/<date>` from
   `snapshot.json` (no pin when the doc is new).
4. **Transcribe answers.** `list` `decisions`. For each `status: "answered"`: post the ruling to its
   issue (`gh issue comment`, quoting his choice and his `note` verbatim, dated, saying it came from the
   page), then `update` the doc to `status: "recorded"` with `answer.github` = the comment URL. This
   is a `/decisions` transcription: if the ruling clears a question, the same pass may clear
   `needs-operator` on that issue, never apply it.
5. **Plan drift.** If the round or report filed or closed work that belongs to a workstream, edit the
   plan (`set` `plan/current`, pinned). A workstream whose issues are all closed is done: say so in
   the report, never delete it.
6. **Report one line** in the calling skill's output: *"Roadmap page refreshed: N open (baseline
   485), week W, workstreams done X/Y"*, plus any decision transcribed.

## The daily cloud run

A scheduled routine, "Roadmap refresh — daily" (04:00 UTC), runs steps 1–3 in Anthropic's cloud
(ADR-W-159 §5), so nothing on the operator's PCs needs to be on. It does not transcribe decisions or
edit the plan: answered decisions wait for the next session's step 4. Debug it with `RemoteTrigger`
`list_runs` / `get_run_log`. The script must keep to `gh api` (REST): cloud sessions refuse GraphQL,
which `gh issue list/view/comment` use, and the `repositories/{id}/...` links that `--paginate`
follows, so it pages by number.

## Known limits

- **Writes from the page are lost in the Claude Code desktop side panel** (seen 2026-10-26). The page
  warns after 8 s and offers "Copy my answers". If he pastes answers in chat, transcribe them as in
  step 4.
- Multi-label issues count under each tool in the tool table, so its rows can sum past the open total.
