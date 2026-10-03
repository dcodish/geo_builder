/**
 * #1733 (ADR-AG-228) — A VALUE LABEL STAYS BOUND TO ITS MARK.
 *
 * Operator, playing round #1721 T23 (9/4): *"the angle location is wrong."* The «63.43°» of ∠BAO had stepped ~3.5 units
 * down its bisector (40 unbounded steps in `placeSceneLabels`) and sat beside O and the y-axis, reading as theirs.
 * Through the app's own path (`derive` → `buildScene` with `Derivation.stated`) at eight seeds.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ANGLE_LABEL_BOUND, buildScene, type Scene } from '../render/scene';
import { pointsOf } from '../../shell/__tests__/fixtures/mark-geometry-rows';
import { wedgeBisector, type MarkPt } from '../../shell/marks';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
const CORPUS: Array<{ id: string; printed: number; lines: string[] }> = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'),
);
const q94 = CORPUS.find((c) => c.id === '9/4')!;

function scene(lines: string[], seed: number): Scene {
  const d = derive(lines, seed);
  expect(d.faults, `${lines.join(' · ')} @${seed}`).toEqual([]);
  return buildScene(d.figure, d.box, 800, 600, { stated: d.stated });
}
const pt = (s: Scene, id: string): MarkPt => {
  const p = s.points.find((q) => q.id === id)!;
  return { x: p.cx, y: p.cy };
};

/** The angle label at vertex `v` is within the bound of its ARC, on the angle's side, and nearer `v` than any other point. */
function angleLabelFaults(s: Scene, v: string, a: string, b: string): string[] {
  const out: string[] = [];
  const V = pt(s, v);
  const arc = s.stated.marks.find((m) => m.kind === 'angle');
  const label = s.stated.labels.find((l) => l.kind === 'angle');
  if (!arc || !label) return ['no angle mark or label'];
  const r = Math.hypot(pointsOf(arc.d)[0].x - V.x, pointsOf(arc.d)[0].y - V.y);
  const dist = Math.hypot(label.x - V.x, label.y - V.y);
  if (dist > ANGLE_LABEL_BOUND * Math.max(r, 8) + 0.5) out.push(`label ${dist.toFixed(1)}px from ${v}, arc radius ${r.toFixed(1)}`);
  const u = wedgeBisector(V, pt(s, a), pt(s, b));
  if ((label.x - V.x) * u.x + (label.y - V.y) * u.y <= 0) out.push('label on the reflex side');
  for (const o of s.points) {
    if (o.id === v) continue;
    if (Math.hypot(label.x - o.cx, label.y - o.cy) < dist) out.push(`label nearer ${o.id} than ${v}`);
  }
  return out;
}

describe('#1733 — 9/4: «63.43°» stays at A', () => {
  for (const [name, lines] of [
    ['as printed', q94.lines.slice(0, q94.printed)],
    ['with the figure note', q94.lines],
  ] as const) {
    it.each(SEEDS)(`${name}, seed %i`, (seed) => {
      const s = scene([...lines], seed);
      expect(s.stated.labels.find((l) => l.kind === 'angle')?.text.replace(/[⁦-⁩]/g, '')).toBe('63.43°');
      expect(angleLabelFaults(s, 'A', 'B', 'O')).toEqual([]);
    });
  }
});

describe('#1733 — the class: a crowded vertex and a narrow wedge', () => {
  it.each(SEEDS)('crowded: coordinate-labelled vertices, a stated side and a tan at A — seed %i', (seed) => {
    const s = scene(['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש ABC', 'tan∢BAC = 3', 'AB = 4'], seed);
    expect(angleLabelFaults(s, 'A', 'B', 'C')).toEqual([]);
  });

  it.each(SEEDS)('narrow: a 10° wedge — seed %i', (seed) => {
    const s = scene(['משולש ABC', '∢ABC = 10'], seed);
    expect(angleLabelFaults(s, 'B', 'A', 'C')).toEqual([]);
  });

  it.each(SEEDS)('an area label stays inside its triangle — seed %i', (seed) => {
    const s = scene(['משולש ABC', 'שטח המשולש ABC הוא 13', 'AB = 5'], seed);
    const l = s.stated.labels.find((x) => x.kind === 'area')!;
    const [a, b, c] = ['A', 'B', 'C'].map((id) => pt(s, id));
    const side = (p: MarkPt, q: MarkPt) => (q.x - p.x) * (l.y - p.y) - (q.y - p.y) * (l.x - p.x);
    const signs = [side(a, b), side(b, c), side(c, a)].map(Math.sign);
    expect(new Set(signs).size, 'centre inside ABC').toBe(1);
  });

  it.each(SEEDS)('an arc label stays in its band — seed %i', (seed) => {
    const s = scene(['נתון מעגל שמרכזו O', 'A ו-C על המעגל', '⌢{AC} = 60°'], seed);
    const l = s.stated.labels.find((x) => x.kind === 'arc')!;
    const O = pt(s, 'O');
    const r = Math.hypot(pt(s, 'A').x - O.x, pt(s, 'A').y - O.y);
    const d = Math.hypot(l.x - O.x, l.y - O.y);
    expect(d).toBeLessThan(r);
    expect(d).toBeGreaterThan(r - 30);
  });
});
