---
name: heredoc-eats-backslashes
description: "Content written through a shell in this harness is silently corrupted (heredocs halve backslashes, backticks run, `$` patterns in String.replace, Python \\u escapes, PowerShell mojibakes Hebrew) — write files with the Write tool and do string surgery from an asserted .cjs script"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 79d8e913-3646-42eb-939a-24700cb56522
  modified: 2026-10-07T00:00:00.000Z
---

Every route below reports success while the content is wrong, and `tsc` catches only some of it.

- **Bash heredocs halve backslashes, even quoted (`<<'EOF'`),** and backticks inside a double-quoted
  `node -e "…"` run as command substitution (round #869).
- **`String.replace(from, to)` expands `$&`, `` $` ``, `$'` in `to`.** A replacement ending in a regex `$`
  before a backtick pasted the whole file prefix in (#777, round #1332). Always `s.replace(from, () => to)`.
- **A Python edit script turns `⁦` into the invisible character itself.** Double the backslash, then
  assert the code point is absent from the file (#1296, #1315).
- **PowerShell `Get-Content | .Replace() | Set-Content` mojibakes Hebrew** unless both ends pass
  `-Encoding utf8`; a filed issue body came out garbled (#1504).

**How to apply:**
- New or rewritten files: the **Write tool**.
- Surgery on an existing file: a `.cjs` script file (the repo is `"type": "module"`), every anchor asserted
  (`if (!s.includes(anchor)) throw`) so a mangled anchor aborts before writing.
- Afterwards, read the changed lines back and run `git diff --stat`: a file that grew by thousands of lines
  is the `$` signature. After filing anything from a scripted file, `gh issue view --json body` the Hebrew back.
- `gh` bodies go through `--body-file` (docs/22 §1).
