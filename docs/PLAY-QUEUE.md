# PLAY QUEUE — what is waiting for the operator to try

Work that is **built, gated and PR'd, but not yet played**. The workflow's merge gate is *operator plays + approves* ([docs/22 §4](22-workflow.md)), so a PR sitting here is not finished work — it is work waiting on a human.

Utterances are **one per line, copy-paste ready**: type each line into the app's input in the order given. Nothing else is on the line, so a whole block can be pasted step by step without editing.

Start the app with `npm run dev` and open **`http://localhost:5173/3d.html`** for the 3-D builder (dev serves at the ROOT, not `/3d-builder/`). Check out the branch named in each section first — these are feature branches, not `main`.

---

## PR #390 + #391 — the relations program's last two slices (3-D)

Branch: **`feat/378-s5-distances`** (it contains S3 as well, so one checkout plays both).

```
git checkout feat/378-s5-distances
npm install          # only if package.json changed since your last pull
npm run dev
```

**#391 is based on #390** — merge #390 first and #391 retargets to `main` automatically.

With these two, the relations program (#378) is complete: **S0 ✓ S1 ✓ S2 ✓ S4 ✓ S3 ✓ S5 ✓**, 70 supported cells.

### S3 — plane relations ([ADR-3D-105](06b-decisions-3d.md#adr-3d-105), [PR #390](https://github.com/dcodish/geo_builder/pull/390))

**1. ⟂ between two planes drives a free tetrahedron.**

```
פירמידה משולשת ABCD
המישור ABC מאונך למישור ABD
```

**2. A stated angle between planes drives to 60°.**

```
פירמידה משולשת ABCD
הזווית בין המישור ABC לבין המישור ABD היא 60
```

**3. ∥ verifies on a box's opposite faces.**

```
תיבה ABCDA'B'C'D'
המישור ABC מקביל למישור A'B'C'
```

**4. A false one must REFUSE** — adjacent faces are not parallel.

```
תיבה ABCDA'B'C'D'
המישור ABC מקביל למישור ABB'
```

**5. Equation planes — the claim lane.**

```
המישור π1: z = 0
המישור π2: x = 0
π1 ניצב ל-π2
```

**6. The collapse guard — this must REFUSE.** Making the base coincide with the top would flatten the box to zero height. Before this slice it silently did exactly that and reported success.

```
תיבה ABCDA'B'C'D'
המישור ABC מתלכד עם המישור A'B'C'
```

**7. A vector against a plane.**

```
פירמידה משולשת ABCD
AD=u
u מאונך למישור ABC
```

### S5 — distances ([ADR-3D-106](06b-decisions-3d.md#adr-3d-106), [PR #391](https://github.com/dcodish/geo_builder/pull/391))

**8. Point → plane drives the apex height.**

```
פירמידה משולשת ABCD
המרחק בין D למישור ABC הוא 6
```

**9. Point → line.**

```
פירמידה משולשת ABCD
המרחק בין D לישר AB הוא 5
```

**10. Skew segments — the common-perpendicular gap.**

```
פירמידה משולשת ABCD
המרחק בין AB לבין CD הוא 3
```

**11. The query lane.** Type the first two as givens, then ask the third in the **query box** (שאלה) — expect `6`.

```
פירמידה משולשת ABCD
המרחק בין D למישור ABC הוא 6
```

```
המרחק בין D למישור ABC
```

**12. The honesty gate.** Build a bare cube, then ask this in the **query box**. It must REFUSE, not answer `1` — the edge is the frozen gauge unit, and printing it would hand back a given you never stated.

```
קובייה ABCDA'B'C'D'
```

```
המרחק בין A' למישור ABCD
```

**13. English mirrors.**

```
tetrahedron ABCD
the distance between D and plane ABC is 6
```

### What to look for beyond "it builds"

- tests 4, 6 and 12 are **refusals** — a green build there is the bug
- test 6 specifically: watch the box keep its height
- test 1, 2, 8, 9, 10 are **drives** — the figure should visibly move when the relation is added

---

## Older PRs still awaiting play

These have been open for a while; each has its own test notes in the PR body.

| PR | What |
| --- | --- |
| [#390](https://github.com/dcodish/geo_builder/pull/390) | S3 — plane relations (above) |
| [#391](https://github.com/dcodish/geo_builder/pull/391) | S5 — distances (above) |

---

## Housekeeping

Several stale worktrees from merged branches are still on the home machine under
`%TEMP%\claude\geo-wt\` (`feat-305`, `feat-307`, `feat-313`, `feat-349`, `feat-351`,
`feat-353`, `try-306-307`). They are outside the repo and outside Dropbox by design, so they cost
nothing but disk — `git worktree remove` + `git worktree prune` when you want them gone.
