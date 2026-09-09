---
name: drive-the-reported-path
description: "A display fix must be driven through the path the REPORT takes, not the path you reasoned about — a refused line may never become a fact, so fact-keyed wiring never fires (round #946, #943)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6d0d5921-b556-470e-95c0-9a5e4d9117b8
  modified: 2026-09-09T05:00:09.473Z
---

Round #946, #943. The fix made a 2-D refusal quote the student's own sentence. I wired the two display
sites that read the fact list — the error banner and the broken-step row — found the fact that owns the
error by the ADR-398 identity (`status[factId] === lastError`), locked it end-to-end through the real
Hebrew locale, and deliberately left `submitPipeline`'s call site alone with a written justification:
*"no fact yet for text that produced nothing."*

Every test was green. **The message in the browser was unchanged.**

The operator's own sequence is refused **before the line becomes a fact**: the pipeline keeps the text
in the box and shows the reason as an *input note*. So the fact-list lookup had nothing to find, and
the one call site I reasoned my way out of wiring was the only one the report ever reaches. The
sentence needed no lookup there at all — it is the text still in the input.

**Why:** "which surface shows this?" and "which surface shows this *for the reported input*" are
different questions, and unit tests answer the first. A refusal in particular has several surfaces
(banner, row, input note) chosen by *how far the input got*, and a pre-commit refusal is the most
common kind — so fact-keyed wiring is exactly backwards for it.

**How to apply.** Before reporting a display/message change ready, drive **the operator's own reported
sequence** in Playwright and read the resulting string, not just the screenshot — `page.locator(
'[role="status"]').allTextContents()` gets the banners and notes. Two gotchas that cost time: dismiss
the first-visit About modal (`getByRole('button', {name: /הבנתי/})`) or every click is intercepted, and
use `input.fill()` without a preceding `.click()` in 2-D, where an overlay intercepts the click.

When a fix depends on *which* surface renders, enumerate the surfaces by **how far the input got**
(refused at parse / refused at apply before commit / committed then failed), not by which module you
happened to be editing. Then check the one the report came from first.

Related: [[no-browser-self-test]], [[measure-before-diagnosing]], [[locks-and-gates-are-hypotheses]],
[[gate-lines-are-read-not-matched]].
