/**
 * #2835 ([ADR-AG-470](../../docs/06c-decisions-analytic.md#adr-ag-470)) — THE PARABOLA'S VERTEX IS A ROLE POINT, the
 * focus's twin: «V קודקוד הפרבולה» names and draws it, and the ask box answers «שיעורי קודקוד הפרבולה».
 *
 * pipeline-lock: the fixtures net builds the two operator figures green but never sees the ask box, the host refusals,
 * a pinned parameter, or the #2625 refusal's next step — bespoke assertions, driven through the real door
 * (`decideSubmit` line by line, then `derive` and `ask`); the model is never called.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import { analyticI18n } from '../i18n';
import canonical from './fixtures/parabola-vertex-2835.analytic.json';
import translated from './fixtures/parabola-vertex-translated-2835.analytic.json';

/** Every line records through the submit door, in order. */
const recorded = (lines: readonly string[]): string[] => {
  const out: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, out, 0);
    expect(v.kind, `«${line}»`).toBe('record');
    if (v.kind === 'record') out.push(v.line);
  }
  return out;
};
const refusal = (before: readonly string[], line: string) => {
  const out = recorded(before);
  const v = decideSubmit(line, out, 0);
  expect(v.kind, `«${line}»`).toBe('refused');
  return v.kind === 'refused' ? v.error : null;
};
const point = (lines: readonly string[], id: string) => {
  const d = derive(lines, 0);
  expect(d.faults).toEqual([]);
  const p = d.figure.points.find((q) => q.id === id);
  return p ? { x: p.x + 0, y: p.y + 0 } : null;
};
const answer = (lines: readonly string[], q: string) => ask(derive(lines, 0), q, fmtAnalytic).value;
type T = (k: string, o?: Record<string, unknown>) => string;

describe('#2835 — the operator’s ruled sentence on a canonical and a translated parabola', () => {
  it('«נתונה פרבולה שמשוואתה y^2=8x» · «V קודקוד הפרבולה»: V at (0, 0)', () => {
    expect(point(recorded(canonical.lines), 'V')).toEqual({ x: 0, y: 0 });
  });
  it('«(y-3)^2=8(x-2)» · «V קודקוד הפרבולה»: V at (2, 3)', () => {
    const p = point(recorded(translated.lines), 'V')!;
    expect(p.x).toBeCloseTo(2, 9);
    expect(p.y).toBeCloseTo(3, 9);
  });
});

describe('#2835 — every spelling of the vertex reads, on the translated parabola', () => {
  it.each([
    ['V קודקוד הפרבולה'],
    ['V הוא קודקוד הפרבולה'],
    ['הנקודה V היא קודקוד הפרבולה'],
    ['קודקוד הפרבולה הוא V'],
    ['V קדקוד הפרבולה'],
    ['V קודקוד של הפרבולה'],
    ['V הקודקוד שלה'],
    ['V is the vertex of the parabola'],
    ["the parabola's vertex is V"],
  ])('«%s»', (line) => {
    const p = point(recorded(['(y-3)^2=8(x-2)', line]), 'V')!;
    expect(p.x).toBeCloseTo(2, 9);
    expect(p.y).toBeCloseTo(3, 9);
  });
  it('a coordinate: «קודקוד הפרבולה הוא (2,3)» records, its point at the vertex', () => {
    const d = derive(recorded(['(y-3)^2=8(x-2)', 'קודקוד הפרבולה הוא (2,3)']), 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.map((p) => [p.x, p.y])).toEqual([[2, 3]]);
  });
  it('the y-axis parabola: «x^2=8y» · «V קודקוד הפרבולה» at (0, 0)', () => {
    expect(point(recorded(['x^2=8y', 'V קודקוד הפרבולה']), 'V')).toEqual({ x: 0, y: 0 });
  });
});

describe('#2835 — the ask box answers the vertex', () => {
  it.each([
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'שיעורי קודקוד הפרבולה', '(0, 0)'],
    [['(y-3)^2=8(x-2)'], 'שיעורי קודקוד הפרבולה', '(2, 3)'],
    [['(y-3)^2=8(x-2)'], 'קודקוד הפרבולה', '(2, 3)'],
    [['(y-3)^2=8(x-2)'], 'the vertex of the parabola', '(2, 3)'],
    [['x^2=8y'], 'שיעורי קודקוד הפרבולה', '(0, 0)'],
  ])('%j · «%s» → %s', (lines, q, want) => {
    expect(answer(recorded(lines), q)).toBe(want);
  });
  it('«y^2=2px · p>0»: the vertex is (0, 0) for every p — known, though the parabola is not', () => {
    const lines = recorded(['y^2=2px', 'p>0']);
    expect(answer(lines, 'שיעורי קודקוד הפרבולה')).toBe('(0, 0)');
    // control: the focus moves with p, and answers in the letter (#2735)
    expect(answer(lines, 'מוקד הפרבולה')).toBe('(p/2, 0)');
  });
  it('«(y-k)^2=8(x-h)»: the vertex in the letters, «(h, k)»', () => {
    expect(answer(recorded(['(y-k)^2=8(x-h)']), 'קודקוד הפרבולה')).toBe('(h, k)');
  });
  it('«הקודקוד הימני של הפרבולה» has none to answer', () => {
    expect(answer(recorded(['y^2=8x']), 'הקודקוד הימני של הפרבולה')).toBeNull();
  });
});

describe('#2835 — a stated vertex pins a parameterised parabola, and a fixed one judges it', () => {
  it('«(y-k)^2=8(x-h)» · «קודקוד הפרבולה הוא (2,3)» pins h = 2, k = 3', () => {
    const lines = recorded(['(y-k)^2=8(x-h)', 'קודקוד הפרבולה הוא (2,3)']);
    expect(answer(lines, 'h')).toBe('2');
    expect(answer(lines, 'k')).toBe('3');
  });
  it('REFUSAL — on «y^2=8x», «קודקוד הפרבולה הוא (1,0)» is refused as the focus’s conflicting restatement is', () => {
    const vertex = refusal(['y^2=8x'], 'קודקוד הפרבולה הוא (1,0)');
    const focus = refusal(['y^2=8x'], 'מוקד הפרבולה הוא (1,0)');
    expect(vertex?.key).toBe(focus?.key);
  });
});

describe('#2835 — the host refusals', () => {
  it('REFUSAL — no parabola: the host refusal', () => {
    const e = refusal([], 'V קודקוד הפרבולה');
    expect(e && e.key === 'ambiguous-shape' && e.host).toMatchObject({ kind: 'parabola', found: 0 });
  });
  it('REFUSAL — two parabolas: the host refusal, naming both', () => {
    const e = refusal(['y^2=8x', 'x^2=8y'], 'V קודקוד הפרבולה');
    expect(e && e.key === 'ambiguous-shape' && e.host).toMatchObject({ kind: 'parabola', found: 2 });
  });
  it('REFUSAL — «V הקודקוד הימני של הפרבולה»: a parabola has one vertex, no side → out-of-scope', () => {
    expect(refusal(['y^2=8x'], 'V הקודקוד הימני של הפרבולה')?.key).toBe('out-of-scope');
  });
});

describe('#2835 — controls: the ellipse’s vertex, the focus and the directrix answer as before', () => {
  const E = ['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1'];
  it('«A הקודקוד הימני של האליפסה» at (5, 0); «קודקוד האליפסה» asked lists the four', () => {
    const a = point(recorded([...E, 'A הקודקוד הימני של האליפסה']), 'A')!;
    expect(a.x).toBeCloseTo(5, 9);
    expect(a.y).toBeCloseTo(0, 9);
    expect(answer(recorded(E), 'קודקוד האליפסה')).toBe('(5, 0), (-5, 0), (0, 3), (0, -3)');
  });
  it('the parabola’s focus and directrix', () => {
    const P = recorded(['(y-3)^2=8(x-2)']);
    expect(answer(P, 'מוקד הפרבולה')).toBe('(4, 3)');
    expect(point(recorded(['(y-3)^2=8(x-2)', 'F מוקד הפרבולה']), 'F')).toEqual({ x: 4, y: 3 });
    expect(answer(P, 'ישר המדריך')).toBe('x = 0');
  });
});

describe('#2835 — the #2625 refusal now teaches the vertex, and the taught sentence reads (docs/17 §9)', () => {
  const taught = (text: string) => /«([^«»]+)»\.?$/.exec(text.replace(/[\u2066-\u2069]/g, ''))![1];
  it.each([
    ['he', 'O מרכז הפרבולה', 'O קודקוד הפרבולה'],
    ['he', 'O הוא מרכז הפרבולה', 'O קודקוד הפרבולה'],
    ['he', 'מרכז הפרבולה', 'V קודקוד הפרבולה'],
    ['en', 'O is the centre of the parabola', 'O is the vertex of the parabola'],
  ] as const)('%s «%s» teaches «%s», which the next Enter records', (lng, line, want) => {
    const e = refusal(['y^2=8x'], line)!;
    expect(e.key).toBe('parabola-no-centre');
    const text = errorText(e, analyticI18n.getFixedT(lng) as unknown as T);
    expect(taught(text)).toBe(want);
    const p = point(recorded(['y^2=8x', want]), want.startsWith('O') ? 'O' : 'V');
    expect(p).toEqual({ x: 0, y: 0 });
  });
  it('the ask box: «מרכז הפרבולה» is still «there is none», and its sentence teaches the ask it answers', () => {
    const P = recorded(['y^2=8x']);
    expect(ask(derive(P, 0), 'מרכז הפרבולה', fmtAnalytic).fact).toBe('parabola-no-centre');
    for (const lng of ['he', 'en'] as const) {
      const q = taught((analyticI18n.getFixedT(lng) as unknown as T)('errParabolaNoCentreAsk'));
      expect(answer(P, q), q).toBe('(0, 0)');
    }
  });
});
