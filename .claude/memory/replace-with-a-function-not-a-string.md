---
name: replace-with-a-function-not-a-string
description: "In a .cjs surgery script, String.replace(from, to) interprets `$`-patterns in `to` — a regex ending in `$\\`` pasted the whole file prefix into parseAnalytic.ts (2836 added lines); always replace with `() => to`, and verify with `git diff --stat` before running anything"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cc697c2a-e8ac-4634-b789-38c1e240949c
  modified: 2026-09-21T12:51:47.784Z
---

`src.replace(from, to)` treats `` $` ``, `$'`, `$&`, `$1` inside the REPLACEMENT string as patterns. A regex source
line ending in `)$\`` (the `$` anchor followed by a template backtick) inserted everything before the match — the
parser file grew by 2,836 lines and only `git diff --stat` showed it (round #1332, item #1330, 2026-09-21). The
"keep both sides" merge resolver had the same hazard.

**Why:** the surgery scripts are the safe alternative to bash heredocs ([[heredoc-eats-backslashes]]), so a silent
mangling there has no second net; `tsc` and the lane would have caught it later, at the cost of a full re-run.

**How to apply:** in every surgery/resolver script use `src.replace(from, () => to)`; assert the anchor hit count
before writing; and read `git diff --stat` right after the script — a file that grew by thousands of lines is the
signature.
