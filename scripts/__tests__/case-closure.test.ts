/**
 * #2654 step 3 ([ADR-W-168](../../docs/06w-decisions-workspace.md#adr-w-168)) — the session closes ✅
 * and 👁, the operator plays 🎮, and spot audits keep the closing honest.
 *
 * What these lock is the honesty of the mechanism: a case never closes without either a check the
 * driver decided or a blind reviewer's pass; the reviewer never receives the fix's story; the audit
 * pick is deterministic; and a failed audit sends EVERY case of its kind to the operator until three
 * clean audits. Offline: no browser.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs tool scripts, deliberately not part of the TS project
import { closureMethod, closureOf, emptyLedger, kindOf, pickSpotAudits, queueAudits, recordAudit, reviewPacket } from '../lib/case-closure.mjs';
// @ts-expect-error — as above
import { caseVerdict, renderReport, validateSheet } from '../lib/play-sheet-core.mjs';

const base = { title: 'הכלי מתקן משהו (#1234)', product: 'analytic', base: 'http://localhost:5173', lines: ['משולש ABC'], lookFor: 'משולש' };
const look = { ...base, id: 'T1', class: 'look' };
const checked = { ...base, id: 'T2', class: 'look', expectFigure: ['x²+y²=9'] };
const play = { ...base, id: 'T3', class: 'play' };
const drive = { steps: [{ line: 'משולש ABC', refusals: [] }], askSteps: [], bodyText: '', pageErrors: [] };

describe('#2654 — how a case closes', () => {
  it('🎮 is the operator\x27s; a case with a driver check closes on it; one without waits for a blind review', () => {
    expect(closureMethod(play)).toBe('operator');
    expect(closureMethod(checked)).toBe('assertion');
    expect(closureMethod(look)).toBe('blind-review');
    expect(closureMethod({ ...look, class: 'verified' })).toBe('blind-review');
    expect(closureOf(checked, []).state).toBe('closed');
    expect(closureOf(look, []).state).toBe('awaiting-review');
  });

  it('a red drive never closes, and a blind fail is red', () => {
    expect(closureOf(checked, ['refused']).state).toBe('red');
    expect(closureOf(look, [], { pass: false, saw: 'the circle is outside' }).state).toBe('red');
    expect(closureOf(look, [], { pass: true, saw: 'one circle inside' })).toMatchObject({ state: 'closed', method: 'blind-review' });
  });

  it('the blind packet carries the lines, Look-for and screenshots, and nothing about the fix', () => {
    const p = reviewPacket({ ...look, issue: 1234, _note: 'plan says X', before: 'drew two circles' }, ['a.png']);
    expect(p).toEqual({ id: 'T1', product: 'analytic', lines: ['משולש ABC'], lookFor: 'משולש', screenshots: ['a.png'] });
  });
});

describe('#2654 — the new driver checks', () => {
  it('a label must be DRAWN, a givens row must exist, and cycling must change the figure', () => {
    const spec = { ...checked, expectRows: ['AB = 4'], expectConfigsDiffer: true, cycles: 1 };
    expect(caseVerdict(spec, { ...drive, figureText: 'A | B | x²+y²=9', rowTexts: ['⁦AB = 4⁩'], configHashes: ['a', 'b'] })).toEqual([]);
    const bad = caseVerdict(spec, { ...drive, figureText: 'A | B', rowTexts: ['AB = 5'], configHashes: ['a', 'a'] });
    expect(bad).toHaveLength(3);
  });

  it('validation refuses malformed checks, and a figure comparison with nothing cycled', () => {
    const P = { analytic: { urlPath: '/analytic.html', inputHint: 'x' } };
    expect(validateSheet({ name: 's', cases: [{ ...checked, expectRows: 'AB' }] }, P)[0]).toMatch(/expectRows/);
    expect(validateSheet({ name: 's', cases: [{ ...checked, expectConfigsDiffer: true }] }, P)[0]).toMatch(/cycles/);
    expect(validateSheet({ name: 's', cases: [checked] }, P)).toEqual([]);
  });
});

describe('#2654 — spot audits', () => {
  const closed = Array.from({ length: 25 }, (_, i) => ({ ...checked, id: `T${i + 1}` }));

  it('picks about one in ten, at least one, the same way every time', () => {
    const a = pickSpotAudits('round-x', closed);
    expect(a).toHaveLength(3);
    expect(pickSpotAudits('round-x', closed).map((s: { id: string }) => s.id)).toEqual(a.map((s: { id: string }) => s.id));
    expect(pickSpotAudits('round-x', closed.slice(0, 2))).toHaveLength(1);
    expect(pickSpotAudits('round-x', [])).toEqual([]);
  });

  it('a failed audit sends every case of its kind to him; three clean audits restore it', () => {
    let ledger = queueAudits(emptyLedger(), 'r1', [closed[0]], '2026-11-01');
    ledger = recordAudit(ledger, 'r1', 'T1', false, '2026-11-02', 'the label is wrong');
    expect(ledger.demoted[kindOf(checked)]).toBe(0);
    expect(pickSpotAudits('r2', closed, ledger)).toHaveLength(25);
    for (const id of ['T2', 'T3', 'T4']) {
      ledger = queueAudits(ledger, 'r2', [closed.find((c) => c.id === id)!], '2026-11-03');
      ledger = recordAudit(ledger, 'r2', id, true, '2026-11-03');
    }
    expect(ledger.demoted).toEqual({});
    expect(ledger.results).toHaveLength(4);
  });

  it('the report puts the pending audits right after his 🎮 cases, and says how each case closed', () => {
    const sheet = { name: 's', cases: [play, checked] };
    const results = [
      { id: 'T3', problems: [], shots: [] },
      { id: 'T2', problems: [], shots: [], closure: { state: 'closed', method: 'assertion' } },
    ];
    const audits = queueAudits(emptyLedger(), 'old', [{ ...look, id: 'T9' }], '2026-11-01').pending;
    const html = renderReport({ sheet, results, generatedAt: 'now', audits });
    expect(html.indexOf('לשחק')).toBeLessThan(html.indexOf('בדיקת מדגם'));
    expect(html.indexOf('בדיקת מדגם')).toBeLessThan(html.indexOf('להסתכל'));
    expect(html).toContain('נסגר על ידי הכלי — בדיקה אוטומטית');
  });
});
