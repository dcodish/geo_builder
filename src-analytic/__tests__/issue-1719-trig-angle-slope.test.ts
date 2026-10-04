/**
 * #1719 (ADR-AG-227) — A TRIG GIVEN IS AN ANGLE AND AN INDICATION OF A SLOPE; sin BUILDS AS A TWO-OPTION CHOICE.
 *
 * Operator ruling, 2026-10-03 (T31): *"in the analytics tool, we should both translate to an angle and treat it as an
 * indication of a slope. … if by any chance they will have cos or sin of an angle, translate it to an angle and right
 * it down"*. Through the app's own path: `parseLine` / `derive` / `decideSubmit`, the panel's `panelKnowledge` and
 * `segmentKnowledge`, and `buildScene` for the canvas.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { confirmTaught, decideSubmit } from '../app/submit';
import { panelKnowledge, segmentKnowledge, valueText } from '../app/panelRows';
import { angleText } from '../app/lineAngle';
import { buildScene } from '../render/scene';
import { fmtAnalytic } from '../format';

const SEEDS = [0, 1, 2, 3];
const strip = (s: string) => s.replace(/[⁦-⁩]/g, '');
const clean = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return d;
};
/** The panel's angle rows, as the row prints them. */
const angleRows = (d: ReturnType<typeof derive>) =>
  panelKnowledge(d).angles.map(({ at, k }) => `∢${at.a}${at.v}${at.b} = ${valueText(k, angleText) ?? '—'}`);
const canvasAngles = (d: ReturnType<typeof derive>) =>
  buildScene(d.figure, d.box, 600, 400, { stated: d.stated }).stated.labels.filter((l) => l.kind === 'angle').map((l) => strip(l.text));
const drawnDeg = (d: ReturnType<typeof derive>, v: string, a: string, b: string) => {
  const p = (id: string) => d.figure.points.find((q) => q.id === id)!;
  const [V, A, B] = [p(v), p(a), p(b)];
  const dot = (A.x - V.x) * (B.x - V.x) + (A.y - V.y) * (B.y - V.y);
  return (Math.acos(dot / (Math.hypot(A.x - V.x, A.y - V.y) * Math.hypot(B.x - V.x, B.y - V.y))) * 180) / Math.PI;
};

describe('#1719 — a trig given is written down as its ANGLE, on the canvas and in the panel', () => {
  it('«tan∢ABC = 2» → «63.43°» on the arc and «∢ABC = 63.43°» in the panel, at every seed', () => {
    for (const seed of SEEDS) {
      const d = clean(['משולש ABC', 'tan∢ABC = 2'], seed);
      expect(canvasAngles(d)).toEqual(['63.43°']);
      expect(angleRows(d)).toEqual(['∢ABC = 63.43°']);
    }
  });

  it('«cos∢ABC = 0.5» → 60°; a negative tan is the obtuse angle («tan∢ABC = -1» → 135°)', () => {
    expect(angleRows(clean(['משולש ABC', 'cos∢ABC = 0.5']))).toEqual(['∢ABC = 60°']);
    expect(angleRows(clean(['משולש ABC', 'tan∢ABC = -1']))).toEqual(['∢ABC = 135°']);
  });

  it('a degree given is the student’s own number and gets no computed row', () => {
    expect(angleRows(clean(['משולש ABC', '∢ABC = 30']))).toEqual([]);
  });
});

describe('#1719 — the trig given indicates a slope (9/4): «-2 או 2» from the exam lines, «2» with the figure note', () => {
  const CORPUS: Array<{ id: string; printed: number; lines: string[] }> = JSON.parse(
    readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'),
  );
  const q = CORPUS.find((c) => c.id === '9/4')!;
  const slopeAB = (d: ReturnType<typeof derive>) =>
    valueText(segmentKnowledge(d).find((s) => s.ends.join('') === 'AB' || s.ends.join('') === 'BA')!.slope, fmtAnalytic);

  it('the exam as printed: ∢BAO = 63.43°, slope AB lists both signs', () => {
    const d = clean(confirmTaught(q.lines.slice(0, q.printed), 0));
    expect(angleRows(d)).toEqual(['∢BAO = 63.43°']);
    expect(slopeAB(d)).toBe('-2 או 2');
  });

  it('with the figure note: slope AB = 2', () => {
    const d = clean(confirmTaught(q.lines, 0));
    expect(angleRows(d)).toEqual(['∢BAO = 63.43°']);
    expect(slopeAB(d)).toBe('2');
  });
});

describe('#1719 — sin is a two-option choice, cycled by «הציגו תצורה אחרת»', () => {
  it('«sin∢ABC = 0.5» lowers to a choice between the acute and the obtuse angle', () => {
    const r = parseLine('sin∢ABC = 0.5');
    expect(r.ok).toBe(true);
    const k = r.ok && r.facts[0].t === 'constraint' ? r.facts[0].k : null;
    expect(k?.t).toBe('choice');
    expect(k && k.t === 'choice' ? k.options.map((o) => (o.t === 'angle' ? `${o.measure}${o.obtuse ? ':obtuse' : ''}` : o.t)) : null).toEqual(['sin', 'sin:obtuse']);
  });

  it('the configurations walk BOTH angles, and the canvas writes the one each drew', () => {
    const seen = new Set<number>();
    for (const seed of SEEDS) {
      const d = clean(['משולש ABC', 'sin∢ABC = 0.5'], seed);
      const deg = Math.round(drawnDeg(d, 'B', 'A', 'C'));
      expect([30, 150]).toContain(deg);
      expect(canvasAngles(d), `seed ${seed}`).toEqual([`${deg}°`]);
      seen.add(deg);
    }
    expect([...seen].sort()).toEqual([150, 30]);
  });

  it('the panel lists both angles until a given settles it; «∢ABC > 90» leaves 150°', () => {
    expect(angleRows(clean(['משולש ABC', 'sin∢ABC = 0.5']))).toEqual(['∢ABC = 30° או 150°']);
    for (const seed of SEEDS) {
      const d = clean(['משולש ABC', 'sin∢ABC = 0.5', '∢ABC > 90'], seed);
      expect(Math.round(drawnDeg(d, 'B', 'A', 'C'))).toBe(150);
      expect(angleRows(d)).toEqual(['∢ABC = 150°']);
    }
  });

  it('the angle named by its vertex alone, in Hebrew: «סינוס הזווית B הוא 0.6» → 36.87° or 143.13°', () => {
    const d = clean(['משולש ABC', 'סינוס הזווית B הוא 0.6']);
    expect(angleRows(d)).toEqual(['∢ABC = 36.87° או 143.13°']);
  });

  it('a sine of 1 has ONE angle: the right angle, a knee, no choice', () => {
    for (const seed of SEEDS) {
      const d = clean(['משולש ABC', 'sin∢ABC = 1'], seed);
      expect(Math.round(drawnDeg(d, 'B', 'A', 'C'))).toBe(90);
      expect(buildScene(d.figure, d.box, 600, 400, { stated: d.stated }).stated.marks.map((m) => m.kind)).toEqual(['right']);
    }
  });

  it('|sin| > 1 is refused, naming the line', () => {
    const v = decideSubmit('sin∢ABC = 2', ['משולש ABC'], 0);
    expect(v.kind).toBe('refused');
    expect(derive(['משולש ABC', 'sin∢ABC = 2'], 0).faults).toEqual([{ index: 1, code: 'unsatisfiable', detail: 'sin∢ABC = 2' }]);
  });
});
