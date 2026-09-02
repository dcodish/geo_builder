---
name: heredoc-eats-backslashes
description: "Bash heredocs in this harness silently drop backslashes and eat backticks as command substitution — write source files with the Write tool, and do string surgery from a .cjs script file, never `node -e` inline"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 79d8e913-3646-42eb-939a-24700cb56522
  modified: 2026-09-02T05:09:39.673Z
---

Writing file content through a Bash heredoc in this harness **corrupts it silently**. Two distinct
failure modes, both hit repeatedly in round #869:

- **Backslashes are halved even in a QUOTED heredoc** (`<<'EOF'`). `s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`
  arrived as `/[.*+?^${}()|[\]\]/g, '\$&'` — an unterminated regex literal. A `join('\n')` written into a
  `.cjs` file arrived as a real newline, so a later `includes()` anchor never matched and the script
  aborted half-applied.
- **Backticks inside a double-quoted `node -e "…"` run as command substitution.** Every `` `foo` `` in a
  doc comment vanished, leaving *"Typed, not : the sentence was…"* in committed source, plus a spray of
  `foo: command not found` in the output that is easy to read past because the script still prints "ok".

**Why:** the command string is preprocessed before bash sees it, so heredoc quoting is not the protection
it normally is. It fails *quietly* — `tsc` catches the broken regex, but a mangled comment or a
half-applied edit does not, and the "success" line still prints.

**How to apply:**
- New or rewritten source/test/doc files → the **Write tool**. Not a heredoc.
- String surgery on an existing file → write a **`.cjs` script file** (the repo is `"type": "module"`, so
  `.js` fails with *"require is not defined"*), then `node script.cjs`. Keep backslashes and backticks out
  of the script body where possible.
- Make every replacement **anchored and asserted** (`if (!s.includes(anchor)) throw`) so a mangled anchor
  aborts before writing instead of applying half the edits — that guard is what saved `notices.ts`.
- After any scripted edit, **read the changed lines back** before committing. Two mangled comments in
  round #869 were caught only by reading; nothing else would have.

Related: [[gh-body-at-dash-eats-issues]] — same class, same lesson (the tool reports success while the
content is gone).
