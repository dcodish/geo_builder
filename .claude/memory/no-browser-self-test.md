---
name: no-browser-self-test
description: This harness cannot drive a browser — UI changes ship logic-verified but visually unseen, and #704 is the standing fix
metadata:
  type: project
---

David asked (2026-08-31) why he always gets a list of test cases instead of the session running them
itself in a browser. Checked properly: **there is no browser capability here.** No navigate/click/
screenshot tool in the toolset (only `WebFetch`, which reads a URL as markdown — useless for a canvas
app); no Playwright/Puppeteer/Cypress/Selenium in `package.json`; no browser binary in `node_modules/.bin`;
and no DOM environment at all — the `.tsx` tests use `renderToStaticMarkup`, a string, not a live page.

**Why:** every utterance in a play sheet IS already run headlessly through the real
`parse → replay → dataView` path — that is what the per-fix locks are. So what the operator is actually
being asked for is **visual placement and product judgement**, not correctness. Presenting play sheets as
a correctness checklist overstates his job and is what prompted the question.

**How to apply:** say plainly which items are already machine-verified and which genuinely need his eyes,
instead of handing over an undifferentiated list. Do not claim to have "tested it in the app" when the
verification was headless. **[[#704]] — the visual smoke harness (P2, armed) — is the standing fix**: a
UI PR self-screenshots before he plays it. On 2026-08-31 the absence of it led him to waive play-and-
approve entirely («lets deploy all for now»), so two UI PRs shipped visually unseen by either party —
recorded in that deploy's DEPLOY-LOG entry. Build #704 before the next UI-heavy round.

Related: [[deploys-are-mine-to-run]], [[gate-lines-are-read-not-matched]].
