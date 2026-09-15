---
name: git-trailers-need-contiguity
description: "A blank line between two trailers splits the block — git parses only the FINAL paragraph, so Allow-sibling-edit above a blank line and Co-Authored-By is invisible to check-sibling-safety and CI fails with the trailer apparently present"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-09-15T11:30:00.000Z
---

`scripts/check-sibling-safety.mjs` reads the cross-product reason with
`git log --format='%(trailers:key=Allow-sibling-edit,valueonly,unfold=true)' origin/main..HEAD`.
**Git parses only the last paragraph of a commit message as trailers**, so this fails:

```
...body...

Allow-sibling-edit: the real reason        ← body text, INVISIBLE to the guard
                                           ← this blank line is the bug
Co-Authored-By: Claude ... <noreply@...>   ← the only trailer git sees
```

Proved with `git interpret-trailers --parse`: the split form returns `Co-Authored-By` alone; the
contiguous form returns both. The symptom is a CI failure that says the trailer is missing while it is
plainly there in `git log`, which sends you looking at the guard instead of the message — it cost a
force-push and two red CI rounds on #1031 (2026-09-15).

**Why:** the attribution line is appended by a session-reminder rule and the sibling reason is written
by hand, so they naturally end up as two paragraphs. Nothing warns.

**How to apply:** put `Allow-sibling-edit:` on the line **immediately above** `Co-Authored-By:`, no
blank line between. Verify before pushing — it is one cheap command, and it fails loudly:

```
git log --format='%(trailers:key=Allow-sibling-edit,valueonly,unfold=true)' origin/main..HEAD | grep -c .
```

Non-zero means the guard will see it. Same rule for any other trailer the tooling reads
([[proxy-bundle-is-wider-than-server]] is the other case where a mechanism was present but not
actually wired to what read it).
