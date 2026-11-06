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
| [#3](https://github.com/dcodish/geo_builder/issues/3) | Apply-time satisfiability is judged at a single composition (+ fixed-coordinate auto free-points cousin) | 2d | debt | 2026-11-02 | 2026-08-26 |
| [#63](https://github.com/dcodish/geo_builder/issues/63) | parser: bounded candidate-retry — when the winning parse trips an honesty gate, try the next matching rule before escalating to the LLM | 2d | debt | 2026-11-02 | 2026-09-22 |
| [#64](https://github.com/dcodish/geo_builder/issues/64) | solver hygiene: a typed strength field (required \| preference \| visual) on constraints, replacing per-mechanism convention | 2d | debt | 2026-11-02 | 2026-08-14 |
| [#216](https://github.com/dcodish/geo_builder/issues/216) | Feature: shaded region — «השטח האפור ABCDE» fills the region closed by the named points (gray / dotted / hatched) for "area of the shaded part" book questions | 2d | feature | 2026-11-02 | 2026-09-17 |
| [#254](https://github.com/dcodish/geo_builder/issues/254) | Feature: unnamed CIRCLE-cut statement — «CD חותך את המעגל» with no points named (the ADR-383 point-free sibling) | 2d | feature | 2026-11-02 | 2026-08-14 |
| [#386](https://github.com/dcodish/geo_builder/issues/386) | 3-D: a CLOSED mutual position against an absolute named line has no drive (gauge×absolute — «AB חותך את l1» verifies but cannot flex) | 3d | feature | 2026-11-02 | 2026-09-21 |
| [#507](https://github.com/dcodish/geo_builder/issues/507) | 2-D: EXCLUSION capability — «זווית A לא תהיה ישרה» builds a ≠ requirement instead of refusing (the #436 capability half, requirement lane) | 2d | feature | 2026-11-02 | 2026-08-14 |
| [#537](https://github.com/dcodish/geo_builder/issues/537) | 3-D: the remaining coordinate-frame cells — standalone «מישור [xy]», axis relations, and a DRIVE for gauge×frame ⟂/∥ | 3d | feature | 2026-11-02 | 2026-08-14 |
| [#663](https://github.com/dcodish/geo_builder/issues/663) | unify A4: the ADR extraction pass — derive the contract row list from all 665 ADRs | workspace | debt | 2026-11-02 | 2026-08-16 |
| [#664](https://github.com/dcodish/geo_builder/issues/664) | unify A5: the conformance matrix harness — an unexamined cell fails the suite | workspace | debt | 2026-11-02 | 2026-09-08 |
| [#725](https://github.com/dcodish/geo_builder/issues/725) | workspace: symbol palette - shared BASE vocabulary + per-product extensions, split visible in the UI | workspace | debt | 2026-11-02 | 2026-09-08 |
| [#729](https://github.com/dcodish/geo_builder/issues/729) | unify: complete the 2-D adoption - B4/B5/B6's 2-D halves + B2 layout (one surface per PR) | 2d | feature | 2026-11-06 | 2026-10-06 |
| [#758](https://github.com/dcodish/geo_builder/issues/758) | 2-D: retire the dropped* gates the span accountant subsumes — one gate per PR, gated by the retirement differential (#659 step-3 remainder) | 2d | debt | 2026-11-02 | 2026-08-25 |
| [#1115](https://github.com/dcodish/geo_builder/issues/1115) | analytic: the measure menu offers distances to NAMED lines only — an anonymous «ישר y=9» is nameable by its equation and is skipped (#1048 follow-up) | analytic | feature | 2026-11-02 | 2026-09-21 |
| [#1293](https://github.com/dcodish/geo_builder/issues/1293) | 3-D: «קטע AB» cannot start a figure although «וקטור AB» now can — the segment lane's downstream rules | 3d | feature | 2026-11-02 | 2026-09-21 |
| [#1381](https://github.com/dcodish/geo_builder/issues/1381) | a heavy figure can freeze the 3-D, analytic and complex builders — give them the background worker 2-D already has (split from #1379 item 5) | 3d, analytic, complex, workspace | feature | 2026-11-06 | 2026-10-06 |
| [#1704](https://github.com/dcodish/geo_builder/issues/1704) | analytic debt: two mechanisms order parameters — «R > r» (E3 params) and «α < β» (D3 order); converge on order | analytic | debt | 2026-11-05 | 2026-10-05 |
| [#1764](https://github.com/dcodish/geo_builder/issues/1764) | 2-D: refuse «stated angles already sum to 180° with one left» instantly (ADR-538 extension) — successor of #1675 | 2d | feature | 2026-11-04 | 2026-10-04 |
