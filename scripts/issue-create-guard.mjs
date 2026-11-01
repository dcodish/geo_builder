#!/usr/bin/env node
/**
 * #2654 ([ADR-W-168](../docs/06w-decisions-workspace.md#adr-w-168)) — check before filing.
 *
 * A PreToolUse hook on Bash and PowerShell. It refuses `gh issue create` unless the body says where the
 * finding was looked for: a line starting `Searched:` (the queries, and "no parent") or `Parent: #N`
 * (it belongs to an existing issue, so it should have been a comment there; a child that is still filed
 * on purpose names its parent). Operator, 2026-11-01: "new issues are first checked to see where they
 * can be placed within existing issues and only if its a new issue completely, we create an issue."
 *
 * Fails OPEN like every hook here: anything it cannot read (no body file, an unparseable command) lets
 * the call through, because a broken hook must never wedge a session. Exit 2 is the refusal; its stderr
 * is what the session reads.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MARKER = /^\s*(?:\*\*)?(Searched|Parent)(?:\*\*)?\s*:/im;

/** The argument after `flag` in a shell command, unquoted; null when absent. */
function argAfter(command, flags) {
  for (const flag of flags) {
    const re = new RegExp(`(?:^|\\s)${flag}(?:=|\\s+)("([^"]*)"|'([^']*)'|(\\S+))`);
    const m = command.match(re);
    if (m) return m[2] ?? m[3] ?? m[4];
  }
  return null;
}

/**
 * The verdict for one tool command: `{ ok: true }` or `{ ok: false, reason }`.
 * `readFile(path)` returns the body file's text or throws.
 */
export function checkCommand(command, readFile, cwd = process.cwd()) {
  if (typeof command !== 'string' || !/\bgh\s+issue\s+create\b/.test(command)) return { ok: true };
  const file = argAfter(command, ['--body-file', '-F']);
  let body = null;
  if (file && file !== '-') {
    try {
      body = readFile(isAbsolute(file) ? file : resolve(cwd, file));
    } catch {
      return { ok: true }; // fail open: a path in a variable, a file made in the same command
    }
  } else {
    body = argAfter(command, ['--body', '-b']);
    if (body == null) {
      // The body may be a heredoc or a $(...) inside the command itself.
      if (/<<|\$\(/.test(command)) body = command;
      else return { ok: true };
    }
  }
  if (MARKER.test(body)) return { ok: true };
  return {
    ok: false,
    reason:
      'Check before filing (#2654, ADR-W-168): search the open issues for a parent first. ' +
      'If the finding belongs to an existing issue, add it there as a comment or checklist line instead. ' +
      'If it is genuinely new, add a line to the body: "Searched: <the queries you ran> — no parent" ' +
      '(or "Parent: #N" for a child filed on purpose), then file again.',
  };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  const verdict = checkCommand(input?.tool_input?.command, (p) => readFileSync(p, 'utf8'), input?.cwd || process.cwd());
  if (!verdict.ok) {
    process.stderr.write(verdict.reason + '\n');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {});
}
