/**
 * #2654 ideas 1 and 4 ([ADR-W-169](../../docs/06w-decisions-workspace.md#adr-w-169)) — every round is
 * measured by what it did to the queue, and what nobody hit is parked where a later hit reopens it.
 * Offline: the GitHub halves are `main()`, which is not called here.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs tool scripts, deliberately not part of the TS project
import { closeKind, closedByCommit, composedItems, headlineLines, ledgerLines, prCloses, queueLine, roundPrs, roundRow, tally } from '../round-metrics.mjs';
// @ts-expect-error — as above
import { addRows, gapRow, keepReason, parkInParity, removeRow, unparkInParity } from '../known-gaps.mjs';

const T = (iso: string) => iso + 'T10:00:00Z';

describe('#2654 idea 1 — a round is measured by net queue change', () => {
  const body = '## Composition\n| 1 | **#100 + #101** | plan, see PR #555 | bug |\n| 2 | #102 | x |\n\n## Not picked\n- #900 needs-operator\n';

  it('items are the composition\x27s issues, never a PR, the round itself or what it did not pick', () => {
    expect(composedItems(body, 50).sort()).toEqual([100, 101, 102]);
    expect(composedItems('## Composition\n#50 #7\n', 50)).toEqual([]);
  });

  it('an estimated round: closed items, found work filed, and a flag when the queue did not shrink', () => {
    const round = { n: 50, title: 'fix-round 2026-10-20: 3 items', created: T('2026-10-20'), closed: T('2026-10-21'), body };
    const state = (n: number) => ({ closed: n !== 102, closedAt: T('2026-10-21') });
    const opened = [
      { n: 60, created: T('2026-10-20'), body: 'found in round #50', open: true },
      { n: 61, created: T('2026-10-20'), body: 'round #500 is another', open: true },
      { n: 62, created: T('2026-10-21'), body: 'Found in round #50.', open: false },
    ];
    const r = roundRow(round, state, opened, { cases: [{ class: 'play' }, { class: 'look' }, { class: 'look' }] });
    expect(r).toMatchObject({ closed: 2, filed: 2, filedOpen: 1, net: 0, flag: true, source: 'estimate' });
    expect(r.operator).toEqual({ play: 1, look: 2, verified: 0, audit: 0 });
    expect(r.minutes).toBe(5);
  });

  it('a round under ADR-W-168 is read from its ledger lines, and he is charged only 🎮 and audits', () => {
    expect(ledgerLines('queue: closed=9 filed=2 filed-open=1 found-in-round=3\noperator: play=4 audits=1')).toEqual({
      queue: { closed: 9, filed: 2, filedOpen: 1, foundInRound: 3, onMain: null, onApproval: null, housekeeping: null },
      operator: { play: 4, audit: 1 },
    });
    const round = { n: 70, title: 'fix-round 2026-11-03: 9 items', created: T('2026-11-03'), closed: T('2026-11-03'), body: 'queue: closed=9 filed=2 filed-open=1 found-in-round=3\noperator: play=4 audits=1' };
    const r = roundRow(round, () => null, [], { cases: [{ class: 'look' }] });
    expect(r).toMatchObject({ net: -7, flag: false, source: 'ledger', minutes: 13 });
    expect(r.operator).toEqual({ play: 4, look: 0, verified: 0, audit: 1 });
  });
});

describe('#2675 (ADR-W-178) — the headline counts changes on main, then what closes on his approval; housekeeping apart', () => {
  const win: [string, string] = [T('2026-11-02'), T('2026-11-04')];
  const closed = (extra: object) => ({ closed: true, closedAt: T('2026-11-03'), reason: 'completed', labels: [], ...extra });

  it('each close is one kind: a commit or merged PR is on main; a park, a merge, a table close or a hand close is housekeeping', () => {
    expect(closeKind(closed({ byCommit: true }), win)).toBe('on-main');
    expect(closeKind(closed({ byCommit: false }), win)).toBe('already-fixed');
    expect(closeKind(closed({ reason: 'not_planned', labels: ['icebox', 'P3'] }), win)).toBe('parked');
    expect(closeKind(closed({ reason: 'not_planned' }), win)).toBe('merged');
    expect(closeKind(closed({ reason: 'duplicate', byCommit: true }), win)).toBe('merged');
    expect(closeKind(closed({ reason: 'not_planned', table: true }), win)).toBe('table');
    expect(closeKind(closed({ closedAt: T('2026-09-01'), byCommit: true }), win)).toBe('outside');
    expect(closeKind({ closed: false, onApproval: true }, win)).toBe('on-approval');
    expect(closeKind({ closed: false }, win)).toBe('open');
  });

  it('the closer is the commit or PR merge at the close, never a lock commit that only names an issue closed by hand', () => {
    const at = (s: string) => `2026-11-02T${s}Z`;
    expect(closedByCommit([{ event: 'closed', created_at: at('17:54:48'), commit_id: 'abc' }])).toBe(true);
    // A PR merge: the closed event has no commit, the merge commit's reference lands in the same second.
    expect(closedByCommit([{ event: 'referenced', created_at: at('07:51:47'), commit_id: 'm' }, { event: 'closed', created_at: at('07:51:48'), commit_id: null }])).toBe(true);
    // #1613 in round #2665: closed at re-measure, its lock commit two hours later.
    expect(closedByCommit([{ event: 'closed', created_at: at('15:53:05'), commit_id: null }, { event: 'referenced', created_at: at('17:54:50'), commit_id: 'l' }])).toBe(false);
    // Only the LAST close counts: a commit close that was reopened, then a hand close.
    expect(closedByCommit([{ event: 'closed', created_at: at('01:00:00'), commit_id: 'a' }, { event: 'reopened', created_at: at('02:00:00') }, { event: 'closed', created_at: at('09:00:00'), commit_id: null }])).toBe(false);
    expect(closedByCommit([])).toBe(false);
  });

  it('a PR body closes by keyword, and a round names its PRs', () => {
    expect(prCloses('Closes #1595.\nFixes: #12, part of #99; resolves #2620')).toEqual([1595, 12, 2620]);
    expect(prCloses('Refs #2621 and Part of #2620')).toEqual([]);
    expect(roundPrs('#1595 → PR #2666 · PR#2667 · #2668')).toEqual([2666, 2667]);
  });

  it('round #2665\x27s shape: "17 closed" was 2 on main and 15 housekeeping, and the line round-trips', () => {
    const kinds = ['on-main', 'on-main', ...Array(13).fill('parked'), 'already-fixed', 'already-fixed', 'on-approval', 'on-approval', 'on-approval', 'open', 'outside'];
    const t = tally(kinds);
    expect(t).toMatchObject({ onMain: 2, onApproval: 3, closed: 17, housekeeping: { merged: 0, parked: 13, table: 0, alreadyFixed: 2, total: 15 } });
    const q = { ...t, filed: 2, filedOpen: 2, foundInRound: 2 };
    const line = queueLine(q);
    expect(line).toBe('queue: closed=17 filed=2 filed-open=2 found-in-round=2 on-main=2 on-approval=3 merged=0 parked=13 table=0 already-fixed=2');
    // Backward compatible: the ADR-W-168 prefix is unchanged, so an old reader's regex still matches it.
    expect(line).toMatch(/queue:\s*closed=(\d+)\s+filed=(\d+)\s+filed-open=(\d+)(?:\s+found-in-round=(\d+))?/);
    expect(ledgerLines('x\n`' + line + '`\n').queue).toEqual({ closed: 17, filed: 2, filedOpen: 2, foundInRound: 2, onMain: 2, onApproval: 3, housekeeping: t.housekeeping });
    const lines = headlineLines(q, { 'on-main': [1595, 2631], 'on-approval': [2620, 2621, 1184], prs: [2667, 2668] });
    expect(lines[0]).toBe('**Changes on main: 2** — #1595 #2631');
    expect(lines[1]).toBe('**Will close on your approval: 3** — #2620 #2621 #1184 (PR #2667, PR #2668)');
    expect(lines[2]).toBe('Housekeeping: 15 — merged 0 · parked 13 · parity table 0 · already fixed 2');
    expect(lines[3]).toBe('Net (filed − closed): -15 · filed 2, 2 still open · closed 17');
  });

  it('a round row takes the headline from its ledger, or estimates it from each item\x27s close; never mixes parks into it', () => {
    const line = 'queue: closed=5 filed=1 filed-open=1 found-in-round=0 on-main=3 on-approval=2 merged=1 parked=1 table=0 already-fixed=0';
    const fromLedger = roundRow({ n: 80, title: 'fix-round 2026-11-04: 5 items', created: T('2026-11-04'), closed: T('2026-11-04'), body: line }, () => null, [], null);
    expect(fromLedger).toMatchObject({ onMain: 3, onApproval: 2, headlineSource: 'ledger', closed: 5, net: -4 });
    expect(fromLedger.housekeeping.total).toBe(2);

    const body = '## Composition\n#100 #101 #102 #103 #104\n## Skipped\n';
    const states: Record<number, object> = {
      100: closed({ closedAt: T('2026-11-02') }),
      101: closed({ closedAt: T('2026-11-02') }),
      102: closed({ closedAt: T('2026-11-02'), reason: 'not_planned', labels: ['icebox'] }),
      103: { closed: false, closedAt: '', reason: '', labels: [] },
      // Parked while composing, two hours before the round issue was opened: still this round's.
      104: closed({ closedAt: '2026-11-02T08:00:00Z', reason: 'not_planned', labels: ['icebox'] }),
    };
    const asked: number[] = [];
    const byCommitOf = (n: number) => { asked.push(n); return n === 100; };
    const est = roundRow({ n: 81, title: 'fix-round 2026-11-02: 5 items', created: T('2026-11-02'), closed: T('2026-11-02'), body }, (n: number) => states[n], [], null, byCommitOf);
    expect(est).toMatchObject({ source: 'estimate', headlineSource: 'estimate', onMain: 1, onApproval: null, closed: 4 });
    expect(est.housekeeping).toEqual({ merged: 0, parked: 2, table: 0, alreadyFixed: 1, total: 3 });
    expect(asked.sort()).toEqual([100, 101]); // a park needs no timeline read
    // Without a closer source (the old call shape), the headline is unknown rather than guessed.
    expect(roundRow({ n: 81, title: 'x', created: T('2026-11-02'), closed: T('2026-11-02'), body }, (n: number) => states[n], [], null)).toMatchObject({ onMain: null, headlineSource: null });
  });
});

describe('#2654 idea 4 — park what nobody hit, reopen it when somebody does', () => {
  const now = '2026-11-02T00:00:00Z';
  const issue = (labels: string[], updated = '2026-09-01T00:00:00Z', number = 5, title = 'x') => ({ number, title, labels: labels.map((name) => ({ name })), updated_at: updated });

  it('only an idle P3 feature or debt item that nobody hit and no plan names', () => {
    expect(keepReason(issue(['P3', 'feature', 'analytic']), { now })).toBeNull();
    expect(keepReason(issue(['P3', 'debt']), { now })).toBeNull();
    expect(keepReason(issue(['P3', 'bug']), { now })).toBe('a bug');
    for (const l of ['reported', 'wrong-answer', 'needs-operator', 'P2']) expect(keepReason(issue(['P3', 'feature', l]), { now })).not.toBeNull();
    expect(keepReason(issue(['P3', 'feature'], '2026-10-20T00:00:00Z'), { now })).toMatch(/active/);
    expect(keepReason(issue(['P3', 'feature']), { now, planIssues: new Set([5]) })).toBe('in the plan');
  });

  it('the known-gaps list stays in issue order and a reopen removes the row', () => {
    const md = 'intro\n<!-- rows: maintained by scripts/known-gaps.mjs; one per parked issue, by number -->\n';
    const a = gapRow(issue(['P3', 'feature', 'analytic'], '2026-09-01T00:00:00Z', 20, 'a | b'), '2026-11-02');
    const b = gapRow(issue(['P3', 'debt', '2d'], '2026-09-03T00:00:00Z', 7), '2026-11-02');
    const out = addRows(addRows(md, [a]), [b]);
    expect(out.indexOf('[#7]')).toBeLessThan(out.indexOf('[#20]'));
    expect(out).toContain('a \\| b | analytic | feature | 2026-11-02 | 2026-09-01 |');
    expect(removeRow(out, 20)).not.toContain('[#20]');
    expect(() => addRows('no marker', [a])).toThrow(/marker/);
  });

  it('parking an owning issue parks its parity gaps, and a reopen schedules them again (ADR-W-119)', () => {
    const src = "  '#12': 'open',\n  { id: 'r', knownGap: [{ product: 'analytic', issue: '#12' }, { product: '3d', issue: '#120' }] },";
    const parked = parkInParity(src, 12);
    expect(parked).toContain("'#12': 'icebox'");
    expect(parked).toContain("issue: '#12', parked: true }");
    expect(parked).toContain("issue: '#120' }");
    expect(unparkInParity(parked, 12)).toBe(src);
  });
});
