import { describe, it, expect } from 'vitest';
// @ts-expect-error — a plain .mjs tool script; there are no types to import and none are wanted.
import { caseVerdict, renderReport, stripBidi, textIncludes, validateSheet, CASE_CLASSES } from '../lib/play-sheet-core.mjs';

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
