# Known gaps

Issues that are parked, not lost ([ADR-W-169](06w-decisions-workspace.md#adr-w-169), #2654).

A P3 feature or debt item that a session found goes here when it has been untouched for 30 days and no student and not the operator has hit it. It is closed with the `icebox` label, and its row stays here. Operator, 2026-11-01: *"known issues dont go away and if we ever run into them again, we move them back the que and not create new ones."*

- **Never parked:** a bug (nothing that shows something false is parked, [docs/22 §2](22-workflow.md), and only reading a bug tells whether it does), a `reported` issue, a `needs-operator` question, a P1 or P2, anything the roadmap plan names.
- **Before filing anything, search this list** and the closed `icebox` issues. The issue-create guard says so too ([ADR-W-168](06w-decisions-workspace.md#adr-w-168)).
- **When someone hits a parked gap,** REOPEN the original issue under its own number: `node scripts/known-gaps.mjs --reopen <N> --note "<who hit it, where>"`. That removes its row and un-parks any parity gap it owns. `/log-triage` reopens the same way when the prod logs show a student hitting one.
- **Who parks:** a fix round runs `node scripts/known-gaps.mjs --apply --plan <plan/current.json>` when it composes, and its batch commit carries the edits to this file and to the parity fixture.

| Issue | Title | Product | Type | Parked | Last activity |
| --- | --- | --- | --- | --- | --- |
<!-- rows: maintained by scripts/known-gaps.mjs; one per parked issue, by number -->
