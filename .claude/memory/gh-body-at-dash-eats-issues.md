---
name: gh-body-at-dash-eats-issues
description: `gh issue create --body @-` silently files the literal two characters "@-" instead of stdin — it has destroyed three issue bodies so far; always use --body-file
metadata:
  type: feedback
---

`gh issue create --body @-` does **not** read stdin. `--body` takes a string, so `@-` is filed verbatim as the issue's entire body. `@-`-for-stdin is a `curl` / `gh api` idiom, not a `gh issue` one, and `gh` reports success — nothing warns you.

It has silently destroyed **three** issue bodies to date: #361, #765, #766. #766 sat in the queue for a week as a P2 3-D honesty bug with no diagnosis at all, and #765 the same; both had to be re-derived from scratch on 2026-08-26.

**Why:** the damage is invisible at filing time and only surfaces when someone tries to work the issue — by which point the diagnosis, the measurements and the fix plan that were in the heredoc are gone for good, and the cost is a full re-triage.

**How to apply:** for any issue or comment body longer than a line, write the markdown to a file first and pass `--body-file <path>` (`--body-file -` genuinely does read stdin). Never `--body @-`. When picking up an issue whose body is exactly `@-`, treat it as **unfiled** — re-derive it from the title, the comments and the code, post the reconstruction as a comment marked as such, and never revise the body (see [[prior-rulings-live-in-comments]]).

Bash heredocs into `gh ... --body "$(cat <<'EOF' … )"` work, but quote-heavy or Hebrew-heavy content trips the shell often enough that `--body-file` is the reliable default.
