---
name: heredoc-eats-backslashes
description: "Bash heredocs in this harness silently drop backslashes and eat backticks as command substitution — write source files with the Write tool, and do string surgery from a .cjs script file, never `node -e` inline"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 79d8e913-3646-42eb-939a-24700cb56522
  modified: 2026-09-21T01:39:16.857Z
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

**A third mode, and this one destroys the FILE, not a comment (2026-09-09, #777):**
`String.prototype.replace(from, to)` treats a `$` sequence inside the REPLACEMENT string as a
substitution pattern: `$&` is the match, ``$``` is everything BEFORE it, and `$'` everything after.
A replacement whose text ended in a regex anchor — `\s*$` followed by a closing backtick — made
`replace` splice the entire file-before-the-match into `parse.ts`, so the file got its own header
inserted mid-line and `tsc` reported six unrelated syntax errors. Nothing in the script warned; it
printed its success line.

**Always pass a FUNCTION replacement** — `s.replace(from, () => to)` — in these edit scripts. A function
return value is used literally, so no `$` sequence can be special. It costs nothing and removes the whole
class.

**A fourth mode — a PYTHON edit script turns `\uXXXX` into the real character (2026-09-21, #1296/#1315):**
`⁦` inside an ordinary Python string literal is not four characters, it is the character. So an edit
script carrying replacement text through a normal `'…'`/`"""…"""` literal writes **literal invisible
controls** into the source. It happened twice in one session, in two different files, and both times the
diff looked perfect — `const LRI = '⁦';` renders identically to `const LRI = '⁦';` in every view.

It matters here beyond aesthetics: `shell/bidi.ts` states the rule in as many words — *"Written by CODE
POINT, never literally: typed as themselves they are invisible in this source file, so a later edit cannot
see what it is changing"* — so the corruption silently violates a discipline the module depends on. `tsc`
is green, the tests pass, nothing warns.

**How to apply:** in a Python edit script, double the backslash (`'\\u2066'`) or build it with
`chr(92)+'u2066'`; and afterwards **assert the absence**, not just eyeball the diff:

```
python -c "import io; s=io.open(PATH,encoding='utf-8').read(); print(chr(0x2066) in s or chr(0x2069) in s)"
```

That one line is what caught both. The general form: after a scripted edit that carries Unicode, grep the
file for the literal code point you meant to write as an escape.

Related: [[gh-body-at-dash-eats-issues]] — same class, same lesson (the tool reports success while the
content is gone).
