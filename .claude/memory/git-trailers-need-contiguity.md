---
name: git-trailers-need-contiguity
description: "A blank line between two trailers — OR any non-trailer line such as 'Closes #N', which has no colon — makes git reject the WHOLE final paragraph, so Allow-sibling-edit is invisible to check-sibling-safety and CI fails with the trailer plainly present"
metadata: 
  node_type: memory
  type: feedback
  modified: 2026-09-22T07:57:34.942Z
  originSessionId: d3cebc4d-0bc9-4598-ac3f-13ef8e3443e9
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

**A NON-TRAILER LINE IN THE BLOCK KILLS IT TOO, and `Closes #N` is one** (2026-09-22, PR #1352).
Contiguity was right and the block still did not parse:

```
Closes #1347                               ← NO COLON, so not trailer-shaped
Allow-sibling-edit: the real reason        ← invisible: the whole paragraph is rejected
Co-Authored-By: Claude ... <noreply@...>   ← also invisible
```

Git takes the last paragraph and rejects the block when too many of its lines are not `Key: value`.
One bad line in three was enough, and the tell is that `%(trailers)` with NO key returned **empty** —
not merely the key missing.

- **GitHub keywords are not trailers.** `Closes #N` / `Fixes #N` have no colon. GitHub scans the whole
  body, so give them their own paragraph ABOVE the trailer block and keep the final paragraph pure.
- **Do not debug with `git interpret-trailers --parse`** — on git 2.53-windows it printed nothing even
  for a hand-written valid message, which reads as "my trailer is broken" when it is not. Use the
  format the consumer uses, from `scripts/check-sibling-safety.mjs` itself.
- Querying `%(trailers)` with no key is the fastest triage: empty means the PARAGRAPH was rejected, and
  the specific key you are hunting is a red herring.

**Write these checks from a file, never inline in bash** — `%(trailers)`, backticks and `$(…)` inside a
`node -e` string are eaten by the shell, which is how the first attempt at this very note died
([[heredoc-eats-backslashes]]).
