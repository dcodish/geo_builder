import { describe, it, expect } from 'vitest';
// @ts-expect-error — a plain .mjs tool script; there are no types to import and none are wanted.
import { caseVerdict, renderReport, stripBidi, textIncludes, validateSheet, phrasingOf, CASE_CLASSES, MIN_SWEEP, MIN_WORDINGS } from '../lib/play-sheet-core.mjs';

/**
 * #1509 — pre-played play sheets: the pure half of the driver.
 *
 * The mechanism's value depends on the same thing visual-smoke's does: that it FAILS when the
 * evidence is not evidence. A driver that waves every case through launders "the session played
 * it" into the operator's sheet — worse than no mechanism, because the operator then SKIPS what
 * it claims to have covered. These lock the verdicts and the matcher; the browser half stays a
 * local gate like its sibling (ADR-W-005).
 */

const PRODUCTS = {
  analytic: { urlPath: '/analytic.html', inputHint: 'x', askHint: 'שאלו' },
  '3d': { urlPath: '/3d.html', inputHint: 'y' }, // no askHint — asks must be refused for it
};

const CASE = {
  id: 'T1',
  title: 'a case',
  class: 'look',
  product: 'analytic',
  base: 'http://localhost:5173',
  lines: ['שורה'],
  lookFor: 'something',
  guard: 'a fixture — one wording is the point',
};

describe('#1509 — the bidi-tolerant matcher', () => {
  it('finds text through the isolates the renderer inserts (the 2026-09-28 prod probe failure)', () => {
    const rendered = '⁦AB⁩ מעגל M משיק לצלע ⁦AB⁩';
    expect(textIncludes(rendered, 'מעגל M משיק לצלע AB')).toBe(true);
    expect(stripBidi('‏שני ישרים‎')).toBe('שני ישרים');
  });

  it('does not invent matches — absent text stays absent', () => {
    expect(textIncludes('מעגל M משיק לישר AB', 'משיק לצלע')).toBe(false);
  });
});

describe('#1509 — sheet validation', () => {
  it('a drivable sheet validates clean', () => {
    expect(validateSheet({ name: 'ok', cases: [CASE] }, PRODUCTS)).toEqual([]);
  });

  it('every case must NAME its server — rule 5, mechanically enforced', () => {
    const problems = validateSheet({ name: 'x', cases: [{ ...CASE, base: undefined }] }, PRODUCTS);
    expect(problems.some((p: string) => p.includes('server'))).toBe(true);
  });

  it('an ask against a product with no ask box is refused at validation, not silently skipped', () => {
    const problems = validateSheet(
      { name: 'x', cases: [{ ...CASE, product: '3d', asks: ['משהו'] }] },
      PRODUCTS,
    );
    expect(problems.some((p: string) => p.includes('asks are not supported'))).toBe(true);
  });

  it('#1548 — after-steps are a row toggle (1-based) or one more utterance, nothing else', () => {
    const ok = { ...CASE, after: [{ toggle: 2 }, { type: 'B(0,3)' }] };
    expect(validateSheet({ name: 'x', cases: [ok] }, PRODUCTS)).toEqual([]);
    for (const bad of [[{ toggle: 0 }], [{ toggle: 1.5 }], [{ type: '' }], [{ toggle: 1, type: 'x' }], [{ click: 1 }], 'x']) {
      const problems = validateSheet({ name: 'x', cases: [{ ...CASE, after: bad }] }, PRODUCTS);
      expect(problems.length, JSON.stringify(bad)).toBe(1);
    }
  });

  it('#1548 — the report shows a toggle as an instruction and a typed step as its own paste block', () => {
    const html = renderReport({
      sheet: { name: 'a', title: 't', cases: [{ ...CASE, after: [{ toggle: 2 }, { type: 'B(0,3)' }] }] },
      results: [{ id: 'T1', problems: [], shots: [] }],
      generatedAt: '2026-09-29 12:00',
    });
    expect(html).toContain('תיבת הסימון בשורה 2');
    expect(html).toMatch(/<pre class="lines" dir="rtl">B\(0,3\)<\/pre>/);
  });

  it('unknown class, unknown product, duplicate ids — each is its own problem', () => {
    const problems = validateSheet(
      { name: 'x', cases: [{ ...CASE, class: 'meh' }, { ...CASE, product: 'nope' }, { ...CASE }] },
      PRODUCTS,
    );
    expect(problems.some((p: string) => p.includes('class'))).toBe(true);
    expect(problems.some((p: string) => p.includes('unknown product'))).toBe(true);
    expect(problems.some((p: string) => p.includes('duplicate'))).toBe(true);
  });
});

/**
 * #1558 (ADR-W-101) — the wording rule. Operator, 2026-09-29: *"ensure that each testing uses
 * different versions of wording like a real student would do."* PR #1511's sheet passed on the
 * builder's spelling while «מעגל O ומעגל M משיקים מבחוץ» — his first try — was not understood; five
 * such sheets went 37/100 red once students' phrasings were tried. These locks keep a one-spelling
 * sheet from ever being driven again.
 */
describe('#1558 — a capability is tested in the words students use', () => {
  const cap = (id: string, line: string, extra = {}) => ({
    ...CASE,
    guard: undefined,
    id,
    capability: 'circle tangency',
    lines: ['נתון מעגל O', 'נתון מעגל M', line],
    ...extra,
  });
  const THREE = [
    cap('T1', 'מעגל M משיק למעגל O'),
    cap('T2', 'מעגל O ומעגל M משיקים מבחוץ'),
    cap('T3', 'המעגלים משיקים זה לזה'),
  ];
  const ROW = { capability: 'circle tangency', tried: 24, accepted: 24 };

  it('three distinct wordings plus a sweep row validates clean', () => {
    expect(validateSheet({ name: 'x', cases: THREE, sweep: [ROW] }, PRODUCTS)).toEqual([]);
  });

  it('the builder writing ONE spelling three times is refused — distinct wordings, not cases', () => {
    const same = THREE.map((c) => ({ ...c, lines: [...c.lines.slice(0, 2), 'מעגל M משיק למעגל O'] }));
    const problems = validateSheet({ name: 'x', cases: same, sweep: [ROW] }, PRODUCTS);
    expect(problems.some((p: string) => p.includes(`1 distinct wording`) && p.includes(`${MIN_WORDINGS}`))).toBe(true);
  });

  it('whitespace and bidi marks do not make a wording "different"', () => {
    const cheat = [THREE[0], { ...THREE[0], id: 'T2', lines: ['נתון מעגל O', 'נתון מעגל M', '⁦מעגל  M⁩ משיק  למעגל O'] }, THREE[2]];
    expect(validateSheet({ name: 'x', cases: cheat, sweep: [ROW] }, PRODUCTS).some((p: string) => p.includes('2 distinct'))).toBe(true);
  });

  it('an ASK capability is judged by its asks, not by the setup lines', () => {
    const ask = (id: string, q: string) => ({ ...cap(id, 'x^2+y^2=25'), capability: 'radius ask', lines: ['נתון מעגל I שמשוואתו x^2+y^2=25'], asks: [q] });
    expect(phrasingOf(ask('A', 'מהו רדיוס המעגל?'))).toBe('מהו רדיוס המעגל?');
    const cases = [ask('A1', 'רדיוס המעגל'), ask('A2', 'מהו רדיוס המעגל'), ask('A3', 'רדיוס המעגל?')];
    expect(validateSheet({ name: 'x', cases, sweep: [{ capability: 'radius ask', tried: 12, accepted: 12 }] }, PRODUCTS)).toEqual([]);
  });

  it('no sweep row, or a sweep of fewer than MIN_SWEEP phrasings, is refused', () => {
    expect(validateSheet({ name: 'x', cases: THREE }, PRODUCTS).some((p: string) => p.includes('no `sweep` row'))).toBe(true);
    const thin = validateSheet({ name: 'x', cases: THREE, sweep: [{ ...ROW, tried: 4, accepted: 4 }] }, PRODUCTS);
    expect(thin.some((p: string) => p.includes(`at least ${MIN_SWEEP}`))).toBe(true);
  });

  it('a phrasing that failed the sweep must say where it went — never silently dropped from the sheet', () => {
    const lost = validateSheet({ name: 'x', cases: THREE, sweep: [{ ...ROW, accepted: 20 }] }, PRODUCTS);
    expect(lost.some((p: string) => p.includes('4 phrasing(s) failed'))).toBe(true);
    const filed = validateSheet({ name: 'x', cases: THREE, sweep: [{ ...ROW, accepted: 20, gaps: ['#1533 «נתון כי …»'] }] }, PRODUCTS);
    expect(filed).toEqual([]);
  });

  it('every case says what it tests — neither capability nor guard is refused, both is refused', () => {
    const bare = { ...CASE, guard: undefined };
    expect(validateSheet({ name: 'x', cases: [bare] }, PRODUCTS).some((p: string) => p.includes('ADR-W-101'))).toBe(true);
    const both = { ...CASE, capability: 'x' };
    expect(validateSheet({ name: 'x', cases: [both] }, PRODUCTS).some((p: string) => p.includes('OR a `guard`'))).toBe(true);
  });

  it('a sweep row for a capability no case tests is refused (the table must describe THIS sheet)', () => {
    const extra = validateSheet({ name: 'x', cases: THREE, sweep: [ROW, { capability: 'ghost', tried: 10, accepted: 10 }] }, PRODUCTS);
    expect(extra.some((p: string) => p.includes('«ghost»'))).toBe(true);
  });

  it('a pre-rule sheet opts out only by saying so: `legacy: true`', () => {
    const bare = { ...CASE, guard: undefined };
    expect(validateSheet({ name: 'x', legacy: true, cases: [bare] }, PRODUCTS)).toEqual([]);
  });

  it('the report shows the sweep table and each case its capability and wording', () => {
    const html = renderReport({
      sheet: { name: 's', title: 't', cases: THREE, sweep: [{ ...ROW, accepted: 20, gaps: ['#1533'] }] },
      results: THREE.map((c) => ({ id: c.id, problems: [], shots: [] })),
      generatedAt: '2026-09-29 20:00',
    });
    expect(html).toContain('ניסוחים של תלמידים');
    expect(html).toMatch(/<td>circle tangency<\/td><td>24<\/td><td>20<\/td><td>3<\/td><td>#1533<\/td>/);
    expect(html).toContain('ניסוח: «מעגל O ומעגל M משיקים מבחוץ»');
  });
});

describe('#1509 — the case verdict', () => {
  const clean = { steps: [{ line: 'שורה', refusals: [] }], askSteps: [], bodyText: 'שני ישרים', pageErrors: [], captureProblems: [] };

  it('a clean drive with its expected text passes', () => {
    expect(caseVerdict({ ...CASE, expect: ['שני ישרים'] }, clean)).toEqual([]);
  });

  it('a refusal FAILS an ordinary case', () => {
    const v = caseVerdict(CASE, { ...clean, steps: [{ line: 'שורה', refusals: ['לא הבנתי'] }] });
    expect(v.some((p: string) => p.includes('REFUSED'))).toBe(true);
  });

  it('a REFUSAL case has its polarity flipped: the refusal passes, its absence fails', () => {
    const spec = { ...CASE, expectRefusal: 'l7' };
    expect(caseVerdict(spec, { ...clean, steps: [{ line: 'x', refusals: ['אין בשרטוט עצם בשם l7'] }] })).toEqual([]);
    const missing = caseVerdict(spec, clean);
    expect(missing.some((p: string) => p.includes('expected a refusal'))).toBe(true);
  });

  it('expected text checked through the bidi strip; expectAbsent fails when present', () => {
    const drive = { ...clean, bodyText: '⁦y = 0⁩ ישר' };
    expect(caseVerdict({ ...CASE, expect: ['y = 0'] }, drive)).toEqual([]);
    expect(caseVerdict({ ...CASE, expectAbsent: ['y = 0'] }, drive).length).toBe(1);
  });

  it('page errors and capture problems fail the case — a blank screenshot is not evidence', () => {
    expect(caseVerdict(CASE, { ...clean, pageErrors: ['boom'] }).length).toBe(1);
    expect(caseVerdict(CASE, { ...clean, captureProblems: ['T1-01: BLANK'] }).length).toBe(1);
  });
});

describe('#1509 — the report', () => {
  const sheet = {
    name: 'r',
    title: 'גיליון',
    cases: [
      { ...CASE, id: 'P1', class: 'play' },
      { ...CASE, id: 'L1', class: 'look' },
      { ...CASE, id: 'V1', class: 'verified' },
    ],
  };
  const results = [
    { id: 'P1', problems: [], shots: [{ file: 'P1-01-built.png', label: 'built' }] },
    { id: 'L1', problems: [], shots: [] },
    { id: 'V1', problems: ['«x» was REFUSED — y'], shots: [] },
  ];
  const html = renderReport({ sheet, results, generatedAt: '2026-09-28 18:00' });

  it("the operator's work comes FIRST — play before look before verified", () => {
    const order = CASE_CLASSES.map((c: string) => html.indexOf(`id="${c === 'play' ? 'P1' : c === 'look' ? 'L1' : 'V1'}"`));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('utterances stay copy-pasteable lines; a mechanical failure is loud on the page', () => {
    expect(html).toContain('שורה');
    expect(html).toContain('REFUSED');
    expect(html).toContain('לא לשחק לפני תיקון');
  });

  it('screenshots ride as RELATIVE references, publishable beside the page', () => {
    expect(html).toContain('src="P1-01-built.png"');
  });

  it('the page carries its own title and both theme palettes', () => {
    expect(html).toContain('<title>גיליון</title>');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('[data-theme="dark"]');
  });
});
