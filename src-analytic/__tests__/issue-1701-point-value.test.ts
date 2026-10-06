/**
 * #1701 (ADR-AG-238) — a measure's VALUE never names a point.
 *
 * «∠CAB = A1» typed without «נסמן» lexed as `A·1` and recorded a free parameter named A, built green; 2-D escalates the
 * line (its value variable is lowercase or Greek — points stay uppercase). The class: every reader of a length's or an
 * angle's value read a capital as a parameter symbol. The fix is one predicate (`mentionsPointName`) at the two value
 * chokepoints — `measureValue` for angles/orders/aliases/arcs, `constantLengthExpr` + `readLength` for lengths — and
 * the line DECLINES (`not-handled`), as in 2-D. The cross-builder verdicts are the parity rows `*-1701`
 * (shell/__tests__/fixtures/geo-input-parity.ts); this file locks the mechanism and its two exceptions.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { paramRegister, mentionsPointName, LENGTH_CAPITALS, POINT_TOKEN } from '../engine/carriers';
import { parseExpr, normalizeMath } from '../engine/expr';
import { constantLengthExpr, parseLengthExpr } from '../engine/lengths';
import { parseLine } from '../parser/parseAnalytic';

function play(lines: readonly string[]): string[] {
  const kept: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, kept, 0);
    if (v.kind === 'record') kept.push(v.line);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
}

const expr = (s: string) => parseExpr(normalizeMath(s))!;

describe('#1701 — the predicate', () => {
  it('a capital symbol is a point name; lowercase, Greek and numbers are not', () => {
    for (const s of ['A', '2A', 'A·B', 'A + 1']) expect(mentionsPointName(expr(s)), s).toBe(true);
    // An INDEXED capital («A1», «B2») no longer reaches the predicate: the tokenizer refuses it first (#1785, ADR-AG-244),
    // and the readers decline it through `INDEXED_TOKEN` — still `not-handled`, now for two reasons (the sweep below).
    for (const s of ['A1', 'B2']) expect(parseExpr(normalizeMath(s)), s).toBeNull();
    for (const s of ['a', '2a', 'k+1', '40', 'α', '√3']) expect(mentionsPointName(expr(s)), s).toBe(false);
  });
  it('a length admits the radius R (2-D ADR-034) and nothing else', () => {
    expect(mentionsPointName(expr('1.6R'), LENGTH_CAPITALS)).toBe(false);
    expect(mentionsPointName(expr('R'))).toBe(true);
    expect(mentionsPointName(expr('2A'), LENGTH_CAPITALS)).toBe(true);
  });
  it('the text test catches what the expression layer cannot read', () => {
    for (const s of ['A₁', 'A_1', 'A_{1}', 'A1']) expect(POINT_TOKEN.test(s), s).toBe(true);
    for (const s of ['a1', 'cos', '40°']) expect(POINT_TOKEN.test(s), s).toBe(false);
  });
});

describe('#1701 — the length readers', () => {
  it('a value that names a point is no length value', () => {
    expect(constantLengthExpr('A1')).toBeNull();
    expect(constantLengthExpr('2A')).toBeNull();
    expect(parseLengthExpr('AC + D')).toBeNull();
  });
  it('R beside a length, and a capital beside an AREA, keep reading', () => {
    expect(constantLengthExpr('1.6R')).not.toBeNull();
    expect(constantLengthExpr('S', true)).not.toBeNull();
    expect(parseLengthExpr('AB + 2BC')).not.toBeNull();
  });
});

describe('#1701 — the reported line and its sweep decline, as in 2-D', () => {
  it('«∠CAB = A1» is not-handled, and no parameter A is ever registered', () => {
    expect(parseLine('∠CAB = A1')).toMatchObject({ ok: false, code: 'not-handled' });
    expect(play(['משולש ABC', '∠CAB = A1'])).toEqual(['record', 'refused:not-handled']);
    // The figure the student has is the triangle alone: no invented parameter.
    expect(paramRegister(derive(['משולש ABC'], 0).construction).map((p) => p.sym)).not.toContain('A');
  });

  it.each([
    ['∠ABC = A'],
    ['∠ABC = B2'],
    ['∠ABC = A₁'],
    ['זווית CAB היא A1'],
    ['angle CAB = A1'],
    ['∠B = A1'],
    ['∢ABC < A'],
    ['tan∢ABC = A'],
    ['AB = A1'],
    ['AB = 2A'],
    ['AB = AC + D'],
    ['AB < C'],
  ])('«%s» declines', (line) => {
    expect(play(['משולש ABC', line])).toEqual(['record', 'refused:not-handled']);
  });

  it('a Greek alias pinned to a point name declines', () => {
    expect(play(['משולש ABC', '∢ABC = α', 'α = A1'])).toEqual(['record', 'record', 'refused:not-handled']);
  });
});

describe('#1701 — what still reads', () => {
  it.each([
    ['∠ABC = 2a'],
    ['∠ABC = α'],
    ['∠ABC = 40'],
    ['AB = 3a'],
    ['AB = 1.6R'],
    ['AB = 2BC'],
    ['שטח המשולש ABC = S'],
    ['נסמן ∠CAB=A1'],
  ])('«%s» records', (line) => {
    expect(play(['משולש ABC', line])).toEqual(['record', 'record']);
  });

  it('«נסמן ∠CAB=A1» binds the label ∠A1, never a parameter A (E5, ADR-AG-221)', () => {
    const syms = paramRegister(derive(['משולש ABC', 'נסמן ∠CAB=A1'], 0).construction).map((p) => p.sym);
    expect(syms).toContain('∠A1');
    expect(syms).not.toContain('A');
  });
});
