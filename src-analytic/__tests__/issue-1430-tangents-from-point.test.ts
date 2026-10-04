/**
 * #1430 remainder (ADR-AG-233) — tangents FROM a point, in the spellings the exam and 2-D use.
 *
 * Measured at pickup (origin/main d9a5910f): «מהנקודה P העבירו משיקים למעגל», «מהנקודה P יוצאים שני משיקים
 * למעגל», «מנקודה P יוצא משיק למעגל», "from point P two tangents are drawn to the circle" — all `not-handled`,
 * while 2-D builds each (`tangentsFromExternal` / `tangentFromExternal`). The analytic reader of the same
 * sentence (`מנקודה E … שני משיקים נוגעים במעגל בנקודות A ו-B`, ADR-AG-195 family) demanded «נוגעים» AND
 * named touches. Every other form in the issue body and the side-as-subject amendment already recorded
 * (ADR-AG-195/196; the side arm is locked in issue-1619-b3-tangents-chords).
 *
 * The locks CALL the shipped path (`decideSubmit`, `derive`, `parseLine`).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';

const SEEDS = 8;
const C = ['נתון מעגל x^2+y^2=25', 'P(8,1)'];

/** The touch points' tangency at a seed: on the circle, and the radius ⟂ the segment from P. */
function tangencyFaults(lines: string[], touches: string[], seed: number): string[] {
  const d = derive(lines, seed);
  const out: string[] = d.faults.map((f) => `fault ${f.code}`);
  const pt = (id: string) => d.figure.points.find((q) => q.id === id);
  const P = pt('P')!;
  for (const id of touches) {
    const T = pt(id);
    if (!T) {
      out.push(`no ${id}`);
      continue;
    }
    if (Math.abs(Math.hypot(T.x, T.y) - 5) > 1e-6) out.push(`${id} off the circle`);
    // The cosine of the angle at the touch — scale-free, since the solver's residual is relative.
    const cos = (T.x * (P.x - T.x) + T.y * (P.y - T.y)) / (Math.hypot(T.x, T.y) * Math.hypot(P.x - T.x, P.y - T.y));
    if (Math.abs(cos) > 1e-6) out.push(`${id}: radius not ⟂ P${id}`);
  }
  if (touches.length === 2) {
    const [a, b] = touches.map((id) => pt(id)!);
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) out.push('the two touches coincide');
  }
  return out;
}

describe('ADR-AG-233 — the from-point tangent sentence, every spelling (#1430)', () => {
  it.each([
    ['מהנקודה P יוצאים שני משיקים למעגל', ['T', 'S']],
    ['מנקודה P יוצאים שני משיקים למעגל', ['T', 'S']],
    ['מנקודה P משיקים למעגל', ['T', 'S']],
    ['from point P two tangents are drawn to the circle', ['T', 'S']],
    ['מנקודה P יוצאים שני משיקים למעגל, הנוגעים בו בנקודות A ו-B', ['A', 'B']],
    ['מנקודה P יוצא משיק למעגל', ['T']],
    ['from P a tangent is drawn to the circle', ['T']],
  ])('«%s» records, and each touch is a real tangency at every seed', (line, touches) => {
    expect(decideSubmit(line, C, 0).kind).toBe('record');
    for (let seed = 0; seed < SEEDS; seed += 1) {
      expect(tangencyFaults([...C, line], touches, seed), `seed ${seed}`).toEqual([]);
    }
  });

  it('two spellings, one lowering: the named-touch form ≡ the «נוגעים» sentence ADR-AG-195 read', () => {
    const strip = (line: string) => {
      const r = parseLine(line);
      expect(r.ok, line).toBe(true);
      return JSON.stringify(r.ok ? r.facts : null).replace(/"src":"[^"]*"/g, '');
    };
    expect(strip('מנקודה P יוצאים שני משיקים למעגל, הנוגעים בו בנקודות A ו-B')).toBe(
      strip('מנקודה P שני משיקים נוגעים במעגל בנקודות A ו-B'),
    );
  });

  it('a count that disagrees with the touches («שני משיקים … בנקודה A») is not read', () => {
    expect(decideSubmit('מנקודה P יוצאים שני משיקים למעגל בנקודה A', C, 0).kind).toBe('refused');
  });

  it('restating the two tangents adds nothing', () => {
    const lines = [...C, 'מנקודה P יוצאים שני משיקים למעגל'];
    expect(decideSubmit('מנקודה P יוצאים שני משיקים למעגל', lines, 0).kind).toBe('already-known');
  });
});

describe('ADR-AG-233 — the exam imperative is taught onto that sentence (ADR-AG-206)', () => {
  it.each([
    ['מהנקודה P העבירו משיקים למעגל', 'מהנקודה P יוצאים שני משיקים למעגל'],
    ['מהנקודה P העבירו שני משיקים למעגל', 'מהנקודה P יוצאים שני משיקים למעגל'],
    ['מן הנקודה P העבירו משיק למעגל', 'מהנקודה P יוצא משיק למעגל'],
    ['דרך P העבירו שני משיקים למעגל', 'מהנקודה P יוצאים שני משיקים למעגל'],
  ])('«%s» teaches «%s», which the next Enter records', (typed, canonical) => {
    expect(decideSubmit(typed, C, 0)).toEqual({ kind: 'teach', verb: 'העבירו', canonical });
    expect(decideSubmit(canonical, C, 0).kind).toBe('record');
  });

  it('the singular tangent THROUGH a point on the circle keeps its lesson (tangent AT the point)', () => {
    expect(decideSubmit('דרך הנקודה A שעל המעגל העבירו משיק למעגל', ['נתון מעגל x^2+y^2=25', 'A(3,4)'], 0)).toEqual({
      kind: 'teach',
      verb: 'העבירו',
      canonical: 'המשיק למעגל בנקודה A',
    });
  });
});

describe('ADR-AG-233 — the refusal: a point inside the circle has no tangent', () => {
  it.each(['מנקודה P יוצאים שני משיקים למעגל', 'מנקודה P יוצא משיק למעגל'])('«%s» with P inside is refused, naming the line', (line) => {
    const v = decideSubmit(line, ['נתון מעגל x^2+y^2=25', 'P(1,1)'], 0);
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' ? v.error : null).toMatchObject({ key: 'unsatisfiable', detail: line });
  });
});
