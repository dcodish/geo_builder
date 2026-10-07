/**
 * #1785 (ADR-AG-244) — an indexed name is ONE name, never letter × index.
 *
 * «שטח המשולש ABC = A1» recorded a parameter A; «שטח ABD = S1 · שטח ADC = S2» recorded `S` and `2S` and drew BD : DC = 1 : 2
 * at every seed — a ratio the student never stated, built green. The class: the expression tokenizer read a letter
 * followed by a digit as two juxtaposed factors, in EVERY value slot (length, angle, area, slope, coordinate,
 * equation). The fix is the tokenizer's third boundary (`expr.ts`: a letter immediately followed by a digit, `_` or a
 * subscript digit is refused) plus one decline mapping (`INDEXED_TOKEN`, `unreadable` / `measureValue` in
 * parseAnalytic.ts), so every such line is `not-handled` — as 2-D and 3-D answer — never `bad-equation`. The
 * cross-builder verdicts are the parity rows `*-1785` (shell/__tests__/fixtures/geo-input-parity.ts).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { INDEXED_TOKEN, paramRegister } from '../engine/carriers';
import { INDEXED_NAME_RE } from '../../shell/indexedName';
import { parseExpr } from '../engine/expr';
import { parseLengthExpr } from '../engine/lengths';

function run(lines: readonly string[]): { verdicts: string[]; kept: string[] } {
  const kept: string[] = [];
  const verdicts = lines.map((line) => {
    const v = decideSubmit(line, kept, 0);
    if (v.kind === 'record') kept.push(v.line);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
  return { verdicts, kept };
}
const play = (lines: readonly string[]) => run(lines).verdicts;
const paramsOf = (lines: readonly string[]) => paramRegister(derive(run(lines).kept, 0).construction).map((p) => p.sym);

describe('#1785 — the tokenizer boundary', () => {
  it.each(['S1', 'a2', 'α1', 'm1', 'A1', 'S_1', 'S_{1}', 'S₁', 'x2', '2S1', 'S1 + 3'])('«%s» is not an expression', (s) => {
    expect(parseExpr(s)).toBeNull();
  });
  it.each(['2a', '2S', 'k(x+1)', 'x²', 'x^2', '2π', '√3', '4√5', '25k²', 'a + 1', '2ax'])('«%s» still parses', (s) => {
    expect(parseExpr(s)).not.toBeNull();
  });
  it('the private-use length encoding of an indexed POINT pair is untouched', () => {
    expect(parseLengthExpr('A1B2')).not.toBeNull();
    expect(parseLengthExpr('2A1B2 + 3')).not.toBeNull();
  });
  it('INDEXED_TOKEN names an index on a lone letter, Latin or Greek', () => {
    for (const s of ['S1', 'a2', 'α1', 'A1', 'S_1', 'S_{1}', 'S₁', 'y = m1 x + 2']) expect(INDEXED_TOKEN.test(s), s).toBe(true);
    for (const s of ['2a', 'AB', 'cos', '40', 'x^2', 'A', '2S']) expect(INDEXED_TOKEN.test(s), s).toBe(false);
  });
  it('#1814 (ADR-600): INDEXED_TOKEN IS the shared atom — one name glyph for both builders, capital Greek included', () => {
    expect(INDEXED_TOKEN).toBe(INDEXED_NAME_RE);
    for (const s of ['Α1', 'Δ1', 'θ₂']) expect(INDEXED_TOKEN.test(s), s).toBe(true);
  });
});

describe('#1785 — the reported line and the operator-shaped sequence decline', () => {
  it('«שטח המשולש ABC = A1» is not-handled, and no parameter A is registered', () => {
    expect(play(['משולש ABC', 'שטח המשולש ABC = A1'])).toEqual(['record', 'refused:not-handled']);
    expect(paramsOf(['משולש ABC', 'שטח המשולש ABC = A1'])).not.toContain('A');
  });

  it('«שטח ABD = S1 · שטח ADC = S2» declines both, mints no S, and no longer pins BD : DC = 1 : 2', () => {
    const lines = ['משולש ABC', 'נקודה D על BC', 'שטח המשולש ABD = S1', 'שטח המשולש ADC = S2'];
    const { verdicts, kept } = run(lines);
    expect(verdicts).toEqual(['record', 'record', 'refused:not-handled', 'refused:not-handled']);
    expect(paramRegister(derive(kept, 0).construction).map((p) => p.sym)).not.toContain('S');
    // Before the fix every seed 0–5 drew BD : DC = 1 : 2 (S and 2S). The declined lines now leave the figure exactly
    // as the two stated lines draw it, at every seed, and the ratio is not the invented one.
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const pts = Object.fromEntries(derive(kept, seed).figure.points.map((q) => [q.id, q]));
      const base = derive(['משולש ABC', 'נקודה D על BC'], seed).figure.points;
      expect(derive(kept, seed).figure.points, `seed ${seed}`).toEqual(base);
      const { B, C, D } = pts;
      const ratio = Math.hypot(D.x - B.x, D.y - B.y) / Math.hypot(C.x - D.x, C.y - D.y);
      expect(Math.abs(ratio - 0.5), `seed ${seed}: BD:DC = ${ratio}`).toBeGreaterThan(1e-3);
    }
  });

  it.each([['שטח המשולש ABC = S_1'], ['שטח המשולש ABC = S₁'], ['שטח המשולש ABC = S_{1}'], ['area of triangle ABC = S1']])(
    'every index spelling of an area value gets the one verdict: «%s»',
    (line) => {
      expect(play(['משולש ABC', line])).toEqual(['record', 'refused:not-handled']);
    },
  );
});

describe('#1785 — the class: every value slot declines an indexed name and mints nothing', () => {
  it.each([
    [['משולש ABC', 'AB = a1'], 'a'],
    [['משולש ABC', 'AB = k1'], 'k'],
    [['משולש ABC', '∠ABC = α1'], 'α'],
    [['משולש ABC', 'זווית ABC היא α1'], 'α'],
    [['משולש ABC', 'AB < a1'], 'a'],
    [['y = m1 x + 2'], 'm'],
    [['A(a1, 0)'], 'a'],
    [['y = x2'], 'x'],
  ] as const)('%j declines, no parameter %s', (lines, sym) => {
    const v = play(lines);
    expect(v[v.length - 1]).toBe('refused:not-handled');
    expect(v.slice(0, -1).every((x) => x === 'record')).toBe(true);
    expect(paramsOf(lines)).not.toContain(sym);
  });

  it('the second indexed length no longer reads as twice the first', () => {
    expect(play(['משולש ABC', 'AB = a1', 'AC = a2'])).toEqual(['record', 'refused:not-handled', 'refused:not-handled']);
  });
});

describe('#1785 — must not change', () => {
  it('«AB = a · AC = 2a» still states AC = 2·AB', () => {
    const { verdicts, kept } = run(['משולש ABC', 'AB = a', 'AC = 2a']);
    expect(verdicts).toEqual(['record', 'record', 'record']);
    const p = Object.fromEntries(derive(kept, 0).figure.points.map((q) => [q.id, q]));
    const ab = Math.hypot(p.B.x - p.A.x, p.B.y - p.A.y);
    const ac = Math.hypot(p.C.x - p.A.x, p.C.y - p.A.y);
    expect(ac / ab).toBeCloseTo(2, 6);
  });

  it.each([
    [['משולש ABC', 'נקודה D על BC', 'שטח המשולש ABD = S', 'שטח המשולש ADC = 2S']],
    [['משולש ABC', 'שטח המשולש ABC = B']],
    [['משולש ABC', 'AB = 1.6R']],
    [['משולש ABC', 'נסמן ∠CAB = A1']],
    [['A1(1,2)']],
    [['נקודה A1']],
    [['l1: y = 2x']],
  ] as const)('%j records every line', (lines) => {
    expect(play(lines).every((x) => x === 'record')).toBe(true);
  });

  it('«נסמן ∠CAB = A1» keeps the ∠A1 label (ADR-AG-221)', () => {
    expect(paramsOf(['משולש ABC', 'נסמן ∠CAB = A1'])).toContain('∠A1');
  });

  it('a named line keeps its slope sentence: «שיפוע l1 הוא 2» on «l1: y = 2x» is not refused', () => {
    expect(play(['l1: y = 2x', 'שיפוע l1 הוא 2'])).toEqual(['record', 'already-follows']);
  });
});
