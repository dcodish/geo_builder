/**
 * #2130 + #2376 (ADR-AG-386) — an UNDESCRIBED inscription («ABC חסום במעגל», «מעגל חוסם את ABC», «ABC חוסם מעגל»'s
 * twin) over vertices the figure already had binds the figure's circle only when that circle already carries every
 * vertex; otherwise it states the ring's own circle — 2-D's `boundInscribeCircle` + `reusedInscribeCircle` (ADR-156).
 * And the arc sentence «F אמצע הקשת BC במעגל O» with a letter no circle carries names the UNNAMED drawn circle that
 * holds both ends (2-D's ADR-748 §5, FR-IN-13; the operator's #2362 Q1 ruling, 2026-10-20).
 *
 * Every row is the verdict 2-D gives (measured at 3225756c, the plan on #2130), driven line by line through
 * `decideSubmit` — the gate the student's Enter passes — then the figure from `derive`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import type { Figure } from '../engine/evaluate';

type P = { x: number; y: number };
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

/** Each line through the submit gate; returns the verdict kinds and the recorded lines. */
function drive(seq: readonly string[]): { kinds: string[]; lines: string[] } {
  const lines: string[] = [];
  const kinds: string[] = [];
  for (const l of seq) {
    const v = decideSubmit(l, lines, 0);
    kinds.push(v.kind === 'refused' ? `refused:${v.error.key}` : v.kind);
    if (v.kind === 'record') lines.push(l);
  }
  return { kinds, lines };
}
const circleObjects = (lines: string[]) =>
  derive(lines, 0).construction.objects.filter((o) => o.kind === 'circle-at' || o.kind === 'circle-thru' || (o.kind === 'curve' && o.curve.kind === 'circle'));
const pts = (f: Figure): Record<string, P> => Object.fromEntries(f.points.map((p) => [p.id, p]));
const circles = (f: Figure) => f.curves.flatMap((c) => (c.curve.kind === 'circle' ? [{ id: c.id, cx: c.curve.cx, cy: c.curve.cy, r: c.curve.r }] : []));
const onCircle = (p: P, c: { cx: number; cy: number; r: number }) => Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r) <= 1e-6 * Math.max(1, c.r);
const whole = (d: ReturnType<typeof derive>) =>
  d.faults.length === 0 && d.figure.unsatisfied.length === 0 && d.figure.ringFaults.length === 0 && d.figure.selectorsOk;

const CDE = ['משולש CDE', 'A על CD', 'B על CE', 'מרובע ABED חסום במעגל'];

describe('#2130 — the circumcircle after the incircle is a second circle, in every spelling', () => {
  it.each([
    [['משולש ABC', 'מעגל חסום במשולש ABC', 'מעגל חוסם את ABC']],
    [['משולש ABC', 'מעגל חסום במשולש ABC', 'משולש ABC חסום במעגל']],
    [['משולש ABC', 'מעגל חסום במשולש ABC', 'the triangle ABC is inscribed in a circle']],
    [['ABC חוסם מעגל', 'מעגל חוסם את ABC']],
    [['מעגל P חסום במשולש ABC', 'מעגל חוסם את ABC']],
    // the other order built before the fix too (control)
    [['מעגל חוסם את ABC', 'מעגל חסום במשולש ABC']],
  ])('%j records every line and draws two circles', (seq) => {
    const { kinds, lines } = drive(seq);
    expect(kinds.every((k) => k === 'record'), kinds.join()).toBe(true);
    const ids = circleObjects(lines).map((o) => o.id).sort();
    expect(ids).toEqual(['circle-in-ABC', 'circle-thru-ABC']);
  });

  it('the circumcircle carries A, B and C and the incircle stays inside, at 24 seeds', () => {
    const { lines } = drive(['משולש ABC', 'מעגל חסום במשולש ABC', 'מעגל חוסם את ABC']);
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(whole(d), `seed ${seed}`).toBe(true);
      const p = pts(d.figure);
      const circum = circles(d.figure).find((c) => c.id === 'circle-thru-ABC')!;
      const inc = circles(d.figure).find((c) => c.id === 'circle-in-ABC')!;
      for (const v of ['A', 'B', 'C']) expect(onCircle(p[v], circum), `seed ${seed} ${v}`).toBe(true);
      expect(inc.r).toBeLessThan(circum.r);
    }
  });
});

describe('#2376 — a second unnamed circumcircle, then the arc names it', () => {
  it('«משולש ABC חסום במעגל» after ABED\'s circle draws the circle through A, B, C (was polygon-collapsed)', () => {
    const { kinds, lines } = drive([...CDE, 'משולש ABC חסום במעגל']);
    expect(kinds.every((k) => k === 'record'), kinds.join()).toBe(true);
    expect(circleObjects(lines).map((o) => o.id).sort()).toEqual(['circle-thru-ABC', 'circle-thru-ABE']);
  });

  it('«F אמצע הקשת BC במעגל O» names the circle through B and C: one circle per ring, F on circle ABC, 24 seeds', () => {
    const { kinds, lines } = drive([...CDE, 'משולש ABC חסום במעגל', 'F אמצע הקשת BC במעגל O']);
    expect(kinds.every((k) => k === 'record'), kinds.join()).toBe(true);
    expect(circleObjects(lines).map((o) => o.id).sort()).toEqual(['circle-thru-ABC', 'circle-thru-ABE']);
    const o = derive(lines, 0).construction.objects.find((x) => x.id === 'O');
    expect(o?.kind === 'derived' && o.rule.t).toBe('circumcentre');
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(whole(d), `seed ${seed}`).toBe(true);
      const p = pts(d.figure);
      const abc = circles(d.figure).find((c) => c.id === 'circle-thru-ABC')!;
      expect(onCircle(p.F, abc), `seed ${seed}`).toBe(true);
      expect(Math.hypot(p.O.x - abc.cx, p.O.y - abc.cy)).toBeLessThan(1e-6);
    }
  });

  it('with «במעגל חדש» (two circles) the arc picks the one circle that holds BOTH ends — the intersection, not a question', () => {
    const { kinds } = drive([...CDE, 'משולש ABC חסום במעגל חדש', 'F אמצע הקשת BC במעגל O']);
    expect(kinds.every((k) => k === 'record'), kinds.join()).toBe(true);
  });

  it.each([
    ['F אמצע הקשת BC במעגל O'],
    ['F is the midpoint of arc BC in circle O'],
    ['קשת BC במעגל O היא 100'],
  ])('«%s» after one drawn circumcircle names it O — no second circle', (line) => {
    const { kinds, lines } = drive(['משולש ABC', 'משולש ABC חסום במעגל', line]);
    expect(kinds.at(-1)).toBe('record');
    expect(circleObjects(lines).map((o) => o.id)).toEqual(['circle-thru-ABC']);
  });

  it('the arc letter named by use is the centre a later angle reads', () => {
    const { kinds } = drive(['משולש ABC', 'משולש ABC חסום במעגל', 'F אמצע הקשת BC במעגל O', 'זווית BOC = 100']);
    expect(kinds).toEqual(['record', 'record', 'record', 'record']);
  });

  it('two unnamed circles that BOTH hold the ends ask which circle (ADR-748 §6)', () => {
    // two circles through B and C: the arc cannot pick
    const { kinds } = drive(['משולש ABC', 'משולש DBC', 'משולש ABC חסום במעגל', 'משולש DBC חסום במעגל חדש', 'F אמצע הקשת BC במעגל O']);
    expect(kinds.slice(0, 4).every((k) => k === 'record'), kinds.join()).toBe(true);
    expect(kinds.at(-1)).toBe('refused:ambiguous-shape');
  });

  it('a circle that does not hold both ends is not read: the incircle, a named circle — today\'s new circle', () => {
    expect(circleObjects(drive(['משולש ABC', 'מעגל חסום במשולש ABC', 'F אמצע הקשת BC במעגל O']).lines).map((o) => o.id).sort()).toEqual([
      'circle-at-O',
      'circle-in-ABC',
    ]);
    expect(circleObjects(drive(['מעגל O', 'משולש ABC חסום במעגל', 'F אמצע הקשת BC במעגל K']).lines).map((o) => o.id).sort()).toEqual([
      'circle-at-K',
      'circle-at-O',
    ]);
  });
});

describe('the binding rule — 2-D\'s rows, and the controls that keep binding', () => {
  it('«מעגל O» · «משולש ABC» · «משולש ABC חסום במעגל» draws a new circle beside O (was: the triangle moved onto O)', () => {
    const { kinds, lines } = drive(['מעגל O', 'משולש ABC', 'משולש ABC חסום במעגל']);
    expect(kinds).toEqual(['record', 'record', 'record']);
    expect(circleObjects(lines).map((o) => o.id).sort()).toEqual(['circle-at-O', 'circle-thru-ABC']);
  });

  it('control: new vertices go on the one circle («מעגל O» · «משולש ABC חסום במעגל»)', () => {
    const { lines } = drive(['מעגל O', 'משולש ABC חסום במעגל']);
    expect(circleObjects(lines).map((o) => o.id)).toEqual(['circle-at-O']);
  });

  it('control: a ring with one new vertex binds the circle (ABD after ABC: D on it)', () => {
    const { kinds, lines } = drive(['משולש ABC', 'משולש ABC חסום במעגל', 'משולש ABD חסום במעגל']);
    expect(kinds).toEqual(['record', 'record', 'record']);
    expect(circleObjects(lines).map((o) => o.id)).toEqual(['circle-thru-ABC']);
  });

  it('control: re-inscribing a ring the circle already carries reuses it (ADR-156), never a twin', () => {
    const { kinds, lines } = drive(['מרובע ABCD חסום במעגל', 'D על הקטע CE', 'מרובע ABCD חסום במעגל']);
    expect(kinds[2]).not.toMatch(/^refused/);
    expect(circleObjects(lines)).toHaveLength(1);
  });

  it('control: the definite «המעגל עובר דרך הנקודות …» still binds the drawn circle (ADR-AG-196 (c), sr-12)', () => {
    const { kinds, lines } = drive(['מעגל O', 'A(1,2)', 'B(3,1)', 'C(0,0)', 'המעגל עובר דרך הנקודות A, B ו-C']);
    expect(kinds.at(-1)).toBe('record');
    expect(circleObjects(lines).map((o) => o.id)).toEqual(['circle-at-O']);
  });

  it('control: a described circle binds by its centre («חסום במעגל שמרכזו O»)', () => {
    const { kinds, lines } = drive(['מעגל O', 'משולש ABC', 'משולש ABC חסום במעגל שמרכזו O']);
    expect(kinds.at(-1)).toBe('record');
    expect(circleObjects(lines).map((o) => o.id)).toEqual(['circle-at-O']);
  });
});
