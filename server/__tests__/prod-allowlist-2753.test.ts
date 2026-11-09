/**
 * #2753 (ADR-W-193) — THE PROD ALLOWLIST IS THE RUNBOOK'S EXACT LINES, AND NOTHING BROADER.
 *
 * `.claude/settings.json` allowed `ssh root@themathbible.com:*`: any session could run any command as root on
 * the production host without a prompt, and could copy the build output to any path on it. Sessions read
 * public issue comments and raw student text, so an instruction planted there could reach a root shell.
 *
 * The deploy needs a fixed set of commands, and docs/RUNBOOK.md is where they are written. This lock reads
 * both files and fails when an allow rule naming the prod host is broader than a RUNBOOK line or not one of
 * them. Every other command on the host asks the operator, which is the point.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const HOST = 'themathbible.com';
// The file carries a UTF-8 byte-order mark, which JSON.parse refuses.
const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8').replace(/^﻿/, '')) as {
  permissions?: { allow?: string[] };
};
const runbook = readFileSync(join(ROOT, 'docs', 'RUNBOOK.md'), 'utf8');

/** `Bash(cmd)` / `PowerShell(cmd)` rules whose command names the prod host. */
const prodRules = (settings.permissions?.allow ?? [])
  .map((rule) => /^(Bash|PowerShell)\((.*)\)$/s.exec(rule))
  .filter((m): m is RegExpExecArray => m !== null && m[2].includes(HOST))
  .map((m) => ({ tool: m[1], command: m[2] }));

describe('#2753 — every allow rule that names the prod host is one exact RUNBOOK line', () => {
  it('there are prod rules to check (the deploy still runs without asking)', () => {
    expect(prodRules.length).toBeGreaterThan(0);
  });

  it('no rule is a prefix rule (`…:*`): each matches one command exactly', () => {
    expect(prodRules.filter((r) => r.command.endsWith(':*')).map((r) => r.command)).toEqual([]);
  });

  it('no rule carries a wildcard after the host (a free remote path or remote command)', () => {
    const wild = prodRules.filter((r) => r.command.slice(r.command.indexOf(HOST) + HOST.length).includes('*'));
    expect(wild.map((r) => r.command)).toEqual([]);
  });

  it('every rule appears verbatim in docs/RUNBOOK.md', () => {
    expect(prodRules.filter((r) => !runbook.includes(r.command)).map((r) => r.command)).toEqual([]);
  });

  // #2780 (ADR-W-196): the lines run as the deploy user, which can write only what a deploy writes and may
  // restart the proxy. A root line in the allowlist would hand back the whole box, so it asks instead.
  it('no rule logs in as root: every allowed prod command is the deploy user', () => {
    expect(prodRules.filter((r) => !r.command.includes(`deploy@${HOST}`)).map((r) => r.command)).toEqual([]);
    expect(prodRules.filter((r) => r.command.includes(`root@${HOST}`)).map((r) => r.command)).toEqual([]);
  });

  it('Bash and PowerShell allow the same commands', () => {
    const of = (tool: string) => prodRules.filter((r) => r.tool === tool).map((r) => r.command).sort();
    expect(of('PowerShell')).toEqual(of('Bash'));
  });
});
