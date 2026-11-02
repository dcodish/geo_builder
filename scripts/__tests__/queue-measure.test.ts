/**
 * #2654 ideas 1 and 4 ([ADR-W-169](../../docs/06w-decisions-workspace.md#adr-w-169)) — every round is
 * measured by what it did to the queue, and what nobody hit is parked where a later hit reopens it.
 * Offline: the GitHub halves are `main()`, which is not called here.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs tool scripts, deliberately not part of the TS project
import { composedItems, ledgerLines, roundRow } from '../round-metrics.mjs';
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
      queue: { closed: 9, filed: 2, filedOpen: 1, foundInRound: 3 },
      operator: { play: 4, audit: 1 },
    });
    const round = { n: 70, title: 'fix-round 2026-11-03: 9 items', created: T('2026-11-03'), closed: T('2026-11-03'), body: 'queue: closed=9 filed=2 filed-open=1 found-in-round=3\noperator: play=4 audits=1' };
    const r = roundRow(round, () => null, [], { cases: [{ class: 'look' }] });
    expect(r).toMatchObject({ net: -7, flag: false, source: 'ledger', minutes: 13 });
    expect(r.operator).toEqual({ play: 4, look: 0, verified: 0, audit: 1 });
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
