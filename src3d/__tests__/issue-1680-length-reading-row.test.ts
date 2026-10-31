/**
 * #1680 (ADR-3D-391 Am. 2) — the PR #2605 play verdicts of 2026-10-30, the operator's exact utterances.
 *
 * T64 (`פירמידה SABCD` · `AB = 1AC`): *"since AB=AC cannot be vectors for a quad pyramid to hold, we must assume
 * these are length and write them as such"* — a sentence whose VECTOR reading cannot hold is a length statement,
 * whether or not the length reading then holds; it is never asked about.
 * T66 (`תיבה ABCDA'B'C'D'` · `AA'=3BC`): *"the input box wrote the vector AA' is 3 times the vector BC which is wrong
 * since its length. the input box should show |AA'|=3|BC|"* — every row the fold read as lengths shows the length
 * spelling (T58–T61 too); a vector-read row keeps its vector display.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { factRowText3 } from '../render/FactRow3';
import { lengthReadingText3 } from '../render/notation';
import { vectorNames3 } from '../engine/vecExpr';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';

// eslint-disable-next-line no-control-regex
const strip = (s: string | null) => (s ?? '').replace(/[⁦-⁩]/g, '');
const he = (err: Parameters<typeof errorText3>[1]) => strip(errorText3((k, o) => i18n3d.t(k, { ...o, lng: 'he' }) as string, err));

const st = () => useGeo3.getState();
beforeEach(() => st().clear());

const run = (lines: string[]) => {
  st().clear();
  lines.forEach((l) => st().submit(l));
  return { err: st().lastError as { code: string } | null, facts: st().facts.length };
};
/** The last row as the fact list shows it, with the fold's reading. */
const lastRow = () => {
  const facts = st().facts;
  const d = derive3(facts, st().seed);
  const f = facts[facts.length - 1];
  return { text: factRowText3(f, new Set(vectorNames3(d.construction)), d.readings[f.id]), reading: d.readings[f.id] };
};

const TRI = 'משולש ABC';
const PYR = 'פירמידה SABCD';
const P = "מקבילון ABCDA'B'C'D'";

describe('T66 — a row read as lengths reads |AA\'| = 3|BC|', () => {
  it("«תיבה ABCDA'B'C'D'» · «AA'=3BC» builds, and its row is «|AA'|=3|BC|»", () => {
    const lines = ["תיבה ABCDA'B'C'D'", "AA'=3BC"];
    const { err, facts } = run(lines);
    expect(err).toBeNull();
    expect(facts).toBe(2);
    expect(lastRow()).toEqual({ text: "|AA'|=3|BC|", reading: 'length' });
  });

  it.each([
    // T58–T61: the lines only the length reading can hold
    [[TRI, 'D על AB', 'AD = 3BD'], '|AD| = 3|BD|'],
    [[TRI, 'D על AB', 'AB = 4DA'], '|AB| = 4|DA|'],
    [[PYR, 'M אמצע BC', 'SM = 2SA'], '|SM| = 2|SA|'],
    [[P, "E על AA'", 'AE = AB'], '|AE| = |AB|'],
    // both readings give one figure → lengths, shown as lengths
    [[TRI, 'D על AB', 'AD = 3DB'], '|AD| = 3|DB|'],
    [['triangle ABC', 'D on AB', 'AD = 3BD'], '|AD| = 3|BD|'],
  ])('%j row reads «%s»', (lines, text) => {
    expect(run(lines).err).toBeNull();
    expect(lastRow()).toEqual({ text, reading: 'length' });
  });

  it('a VECTOR-read row keeps its vector display (an arrow on each pair)', () => {
    run([P, "E על AA'", "AE = -A'E"]);
    expect(lastRow().text).toBe("AE⃗ = -A'E⃗");
  });
});

describe('T64 — a sentence whose vector reading cannot hold is read as lengths, never asked', () => {
  it('«פירמידה SABCD» · «AB = 1AC»: no length-or-vector question; the length path gives its own verdict', () => {
    // measured at the tip: the default «פירמידה SABCD» base keeps AB (a side) and AC (a diagonal) unequal, so
    // «|AB| = |AC|» holds only with the pyramid flat — the length path's existing refusal, naming the line
    const { err, facts } = run([PYR, 'AB = 1AC']);
    expect(err).toEqual({ code: 'polygon-collapsed', stated: 'AB = 1AC', others: [], sides: 5, ring: 'SABCD', forced: true, solid: 'pyramid' });
    expect(facts, 'nothing is committed').toBe(1);
    expect(he(err as Parameters<typeof errorText3>[1])).toBe('לא ניתן: «AB = 1AC» מתקיים רק אם הפירמידה SABCD שטוחה — וגוף שטוח אינו פירמידה.');
  });
});

describe('lengthReadingText3 — the length spelling of the student’s own text', () => {
  const cmd = (from: string, to: string, a: string, b: string, k: number) => [{ type: 'vec-rel', from, to, terms: [{ coeff: { k, p: 0 }, atom: { kind: 'pair', from: a, to: b } }] }];
  it.each([
    ["AA'=3BC", cmd('A', "A'", 'B', 'C', 3), "|AA'|=3|BC|"],
    ['AB = 1AC', cmd('A', 'B', 'A', 'C', 1), '|AB| = 1|AC|'],
    ["AE = 2*A'E", cmd('A', 'E', "A'", 'E', 2), "|AE| = 2*|A'E|"],
    ['AA′ = 3BC', cmd('A', "A'", 'B', 'C', 3), '|AA′| = 3|BC|'],
    // a prose run holding the pair letters is left alone
    ['במשולש ABC: AB = AC', cmd('A', 'B', 'A', 'C', 1), 'במשולש ABC: |AB| = |AC|'],
    // the text does not hold the pairs as written → composed from the command
    ['A B = A C', cmd('A', 'B', 'A', 'C', 1), '|AB| = |AC|'],
  ])('%s → %s', (u, c, out) => {
    expect(lengthReadingText3(u, c)).toBe(out);
  });
});
