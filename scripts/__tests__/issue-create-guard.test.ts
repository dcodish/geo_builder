/**
 * #2654 ([ADR-W-168](../../docs/06w-decisions-workspace.md#adr-w-168)) — a new issue says where it was
 * looked for. Offline: the hook's stdin half is `main()`, which is not called here.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — a plain .mjs script, deliberately not part of the TS project
import { checkCommand, invokesIssueCreate } from '../issue-create-guard.mjs';

const files: Record<string, string> = {
  '/s/searched.md': '## Why\n\nbody\n\nSearched: open 2d issues for "chord through" — no parent.\n',
  '/s/parent.md': '**Parent:** #2541\n\nThe English spelling of the same sentence.',
  '/s/bare.md': '## Why\n\nA new finding with no search line.',
};
const read = (p: string) => {
  const k = p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  if (!(k in files)) throw new Error('ENOENT');
  return files[k];
};

describe('#2654 — gh issue create needs a Searched: or Parent: line', () => {
  it('lets every other command through', () => {
    expect(checkCommand('gh issue edit 12 --add-label P2', read).ok).toBe(true);
    expect(checkCommand('gh issue comment 12 --body-file /s/bare.md', read).ok).toBe(true);
    expect(checkCommand(undefined, read).ok).toBe(true);
  });
  it('accepts a body file with a Searched: line or a Parent: line', () => {
    expect(checkCommand('gh issue create --title "x" --label bug --body-file /s/searched.md', read).ok).toBe(true);
    expect(checkCommand('gh issue create --title "x" --body-file "/s/parent.md"', read).ok).toBe(true);
    expect(checkCommand('gh issue create -t x -F /s/searched.md', read).ok).toBe(true);
  });
  it('refuses a body file without one, and says what to do', () => {
    const v = checkCommand('gh issue create --title "x" --body-file /s/bare.md', read);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('Searched:');
    expect(v.reason).toContain('Parent: #N');
  });
  it('reads an inline body and a heredoc body', () => {
    expect(checkCommand('gh issue create --title x --body "text\nSearched: q — no parent"', read).ok).toBe(true);
    expect(checkCommand("gh issue create --title x --body 'just text'", read).ok).toBe(false);
    expect(checkCommand('gh issue create --title x --body "$(cat <<\'EOF\'\nwhy\nParent: #12\nEOF\n)"', read).ok).toBe(true);
  });
  it('fires on a filing, never on a command that only names one (ADR-W-169)', () => {
    const G = 'gh issue ' + 'create';
    for (const c of [`cd a && ${G} -t x --body q`, `FOO=1 ${G} -t x --body q`, `& ${G} -t x --body q`, `echo x; gh.exe issue create -t x --body q`, `x=$(${G} -t x --body q)`])
      expect(invokesIssueCreate(c)).toBe(true);
    for (const c of [`grep -n "${G}" f`, `git commit -m "refuse ${G}"`, `cat <<EOF\n${G}\nEOF`, `node -e '${G}'`])
      expect(invokesIssueCreate(c)).toBe(false);
    expect(checkCommand(`grep -rn "${G}" docs`, read).ok).toBe(true);
    expect(checkCommand(`${G} --title x --body-file /s/bare.md`, read).reason).toContain('icebox');
  });
  it('fails open on what it cannot read', () => {
    expect(checkCommand('gh issue create --title x --body-file "$F"', read).ok).toBe(true);
    expect(checkCommand('gh issue create --title x --web', read).ok).toBe(true);
  });
});
