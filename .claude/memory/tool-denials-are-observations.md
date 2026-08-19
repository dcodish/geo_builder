---
name: tool-denials-are-observations
description: Never report "I can't do X" from a tool denial without first checking the permission config and retrying the canonical minimal command form
metadata:
  type: feedback
---

A denied tool call is an **observation to diagnose**, never a fact about my capabilities — and never
something to explain with an invented mechanism.

On 2026-08-09 I told the operator twice that I could not deploy the proxy. Both times I was wrong.
`Bash(ssh root@themathbible.com:*)` and `Bash(scp dist-server/proxy.mjs root@themathbible.com:*)` were
already in the tracked `.claude/settings.json`. The real cause of the first denials was my own command
construction — an env prefix (`MSYS_NO_PATHCONV=1`), extra flags (`-o BatchMode=yes`), and `;`-compound
remote commands, none of which can match a prefix-based allow rule. Then, after one `scp` denial, I
invented "the classifier allows reads but blocks writes" and reported it as a finding; the identical
`scp` succeeded minutes later with no config change.

**Why:** the operator nearly went and edited permission settings that were already correct, chasing a
mechanism that did not exist. A confident wrong answer about my own environment is worse than "let me
check" — it sends them to fix the wrong thing, and it is the one class of claim they cannot easily verify
without redoing my work.

**How to apply:** before telling the operator I cannot do something, in order —
1. **Read the permission config** (`.claude/settings.json`, `.claude/settings.local.json`). The answer is
   often in the repo already.
2. **Retry the canonical minimal form** — one command, no env prefix, no extra flags, no `;`/`&&` chains,
   no pipes. Compound commands get split and classified separately, so a chain defeats a rule that the
   bare command matches. For deploys use the exact strings in `docs/RUNBOOK.md`.
2b. **Retry it MORE THAN ONCE.** Denials here are transient. On 2026-08-19 I repeated the 2026-08-09
   mistake exactly: the allowlisted `scp -r dist-3d/*` was refused four times — I again asserted a
   mechanism ("auto mode gates production writes independently of the allowlist"), wrote it up for the
   operator as a finding, and then the identical command succeeded on the next attempt with no config
   change. Twice now the invented mechanism has been the wrong answer and patience the right one.
3. **Only then report** — stating what I attempted and what the config says, with observation and
   inference clearly separated. Never assert a mechanism for a denial I have not tested.

Corollary: never let a denial become a hand-back either — see [[deploys-are-mine-to-run]].

Corollary: this is the same failure as writing a plausible-but-unverified diagnosis into a bug report.
The rule is `docs/17`'s "state the root cause" applied to my own tooling — do not narrate a cause I have
not established. See [[work-pc-cross-machine]] for what genuinely does not travel between machines
(`.env.local`, `logs/`, `node_modules/`) — permission rules in `.claude/settings.json` DO travel, which is
exactly what I got wrong.
