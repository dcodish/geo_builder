/**
 * #2661 ([ADR-W-173](ADR-W-173, the workspace log)) — the judge rules on the operator's
 * behalf only from his quoted, dated words; an overrule sends that class of question back to him until
 * three judgments of it stand. Offline: the GitHub half of precedents.mjs is `build`, not called here.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs tool scripts, deliberately not part of the TS project
import { chose, digest, emptyLedger, overrule, record, settle, validateVerdict } from '../judgments.mjs';
// @ts-expect-error — as above
import { isRuling, operatorAdrs, search } from '../precedents.mjs';

const P = { quote: 'tell user why it is refused', date: '2026-10-13', link: 'https://github.com/dcodish/geo_builder/issues/2022#issuecomment-1' };
const ruled = (id: string, cls = 'refusal-wording') => ({ id, question: 'Who writes a new refusal?', class: cls, verdict: 'ruled', choice: 'A', ruling: 'Sessions write it; he approves on play.', precedents: [P] });

describe('#2661 — a verdict rests on his words', () => {
  it('a ruling needs a choice, the rule, and a quoted, dated, linked precedent', () => {
    expect(validateVerdict(ruled('q1'))).toEqual([]);
    expect(validateVerdict({ ...ruled('q1'), precedents: [] }).join()).toMatch(/at least one precedent/);
    expect(validateVerdict({ ...ruled('q1'), precedents: [{ quote: 'x', date: 'last week', link: 'y' }] }).join()).toMatch(/without quote, date or link/);
    expect(validateVerdict({ id: 'q2', question: 'q', class: 'c', verdict: 'escalate' }).join()).toMatch(/says why/);
    expect(validateVerdict({ id: 'q3', question: 'q', class: 'c', verdict: 'probably' }).join()).toMatch(/ruled.*escalate/);
  });

  it('record refuses an unsupported ruling instead of storing it', () => {
    expect(() => record(emptyLedger(), [{ ...ruled('q1'), precedents: [] }], '2026-11-02T10:00:00Z')).toThrow(/precedent/);
  });
});

describe('#2661 — his overrule wins, and takes the class back', () => {
  it('overrule → the class escalates; three judgments that stand restore it', () => {
    let l = record(emptyLedger(), [ruled('q1')], '2026-11-01T10:00:00Z');
    l = overrule(l, 'q1', 'no — I want to see these', '2026-11-01T12:00:00Z');
    expect(l.demoted).toEqual({ 'refusal-wording': 0 });
    l = record(l, [ruled('q2')], '2026-11-02T10:00:00Z');
    expect(l.judgments.find((j: { id: string }) => j.id === 'q2').status).toBe('escalated');
    // A judgment of the class that stands only exists once the class is ruled again; simulate three that stood.
    l.judgments.push(...['q3', 'q4', 'q5'].map((id) => ({ ...ruled(id), at: '2026-11-02T10:00:00Z', status: 'pending' })));
    expect(settle(l, '2026-11-04T10:00:00Z')).toEqual(['q3', 'q4', 'q5']);
    expect(l.demoted).toEqual({});
  });

  it('nothing stands before the window ends', () => {
    const l = record(emptyLedger(), [ruled('q1')], '2026-11-02T10:00:00Z');
    expect(settle(l, '2026-11-02T20:00:00Z')).toEqual([]);
    expect(settle(l, '2026-11-03T10:00:01Z')).toEqual(['q1']);
  });

  it('the digest shows each ruling with the quote it rests on, and what went back to him', () => {
    const l = record(emptyLedger(), [ruled('q1'), { id: 'q2', question: 'May earlier points move?', class: 'stability', verdict: 'escalate', reason: 'no precedent' }], '2026-11-02T10:00:00Z');
    const md = digest(l, true);
    expect(md).toContain('tell user why it is refused');
    expect(md).toContain('Sent back to you (1)');
    expect(md).toContain('no precedent');
  });
});

describe('#2661 — the precedent record', () => {
  it('a ruling comment or a dated operator quote counts; a session asking for a ruling does not', () => {
    expect(isRuling('## Operator ruling — 2026-10-16\nChoice B')).toBe(true);
    expect(isRuling('Operator, 2026-10-15: *"approve the pattern"*')).toBe(true);
    expect(isRuling('This needs an operator ruling on the wording.')).toBe(false);
  });

  it('only ADRs that carry his words are precedent', () => {
    const md = '## ADR-W-1 — A\n\n**Operator:** 2026-10-01, *"yes"*\n\n## ADR-W-2 — B\n\nA session decided this.\n';
    expect(operatorAdrs(md, 'the-log.md').map((a: { id: string }) => a.id)).toEqual(['ADR-W-1']);
  });

  it('search ranks by shared words, Hebrew prefixes included', () => {
    const recs = [
      { kind: 'comment', date: '2026-10-01', text: 'rounded to 3 decimals, no trailing zeros' },
      { kind: 'comment', date: '2026-10-02', text: 'the circle «המעגל» is the one drawn' },
    ];
    expect(search(recs, 'decimals rounded')[0].r.text).toMatch(/decimals/);
    expect(search(recs, 'מעגל')[0].r.text).toMatch(/המעגל/);
    expect(search(recs, 'the of')).toEqual([]);
  });
});

describe('#2663 — what he delegated is decided, shipped, and listed for review', () => {
  const d = { id: 'c1', kind: 'text', issue: '#2625', what: 'refusal for «AB קוטר בפרבולה»', choice: '«לפרבולה אין מרכז, ולכן אין לה קוטר.»' };
  it('chose records a pending review item and refuses one it cannot place', () => {
    const l = chose(emptyLedger(), [d], '2026-11-02T10:00:00Z');
    expect(l.judgments[0]).toMatchObject({ id: 'c1', chosen: true, status: 'pending' });
    expect(() => chose(emptyLedger(), [{ ...d, kind: 'scope' }], 'x')).toThrow(/kind must be/);
    expect(() => chose(emptyLedger(), [{ ...d, issue: '2625' }], 'x')).toThrow(/#N/);
  });
  it('the digest lists it apart from the judgments, and changing it sends nothing back to him', () => {
    const l = chose(record(emptyLedger(), [ruled('q1')], '2026-11-02T10:00:00Z'), [d], '2026-11-02T10:00:00Z');
    const md = digest(l, true);
    expect(md).toMatch(/Ruled on your behalf \(1\)/);
    expect(md).toMatch(/Decided for you — review \(1\)[\s\S]*#2625/);
    overrule(l, 'c1', 'say it shorter', '2026-11-02T12:00:00Z');
    expect(l.demoted).toEqual({});
  });
});
