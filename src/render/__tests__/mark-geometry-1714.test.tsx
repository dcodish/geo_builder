/**
 * #1714 (ADR-AG-225) — 2-D's thin lock on the shared planar mark geometry (docs/28 §5c).
 *
 * 2-D's knee, angle arc and equal ticks were hoisted into `shell/marks` when analytic's stated-measure layer was
 * about to be the third copy. This renders 2-D's REAL figure and hands the marks it drew to the shared checks
 * (`shell/__tests__/fixtures/mark-geometry-rows.ts`), so a 2-D renderer that drifts from the kit fails here.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { factsOf, replayFacts } from '../../__tests__/scenario-pipeline';
import { Figure } from '@/render/Figure';
import { arcFaults, kneeFaults, pointsOf, tickFaults } from '../../../shell/__tests__/fixtures/mark-geometry-rows';
import type { MarkPt } from '../../../shell/marks';

const NO_RELATIONS = { equalSegments: [], equalAngles: [], definiteAngles: [], definiteLengths: [], samplesUsed: 0 };

function draw(steps: string[], statedEqual: [string, string][][] = []) {
  const fig = replayFacts(factsOf(steps));
  expect(fig.lastError, steps.join(' · ')).toBeNull();
  const html = renderToStaticMarkup(
    <Figure
      construction={fig.construction}
      positions={fig.positions}
      circles={fig.circles}
      labels={fig.labels}
      angleMarks={fig.angleMarks}
      relations={NO_RELATIONS}
      statedEqual={statedEqual}
    />,
  );
  const dots: MarkPt[] = [...html.matchAll(/<circle data-ink-dot="1" cx="([^"]+)" cy="([^"]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  const marks = [...html.matchAll(/<polyline points="([^"]+)" fill="none" stroke="#1d4ed8"/g)].map((m) => pointsOf(m[1]));
  const ticks = [...html.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" stroke="#d97706"/g)].map(
    (m): [MarkPt, MarkPt] => [{ x: Number(m[1]), y: Number(m[2]) }, { x: Number(m[3]), y: Number(m[4]) }],
  );
  return { dots, marks, ticks };
}

/** The drawn vertex a mark is centred on, and the other two vertices as its rays. */
function cornerOf(mark: MarkPt[], dots: MarkPt[], knee: boolean) {
  const score = (v: MarkPt) => {
    if (knee) return Math.abs(Math.hypot(mark[0].x - v.x, mark[0].y - v.y) - Math.hypot(mark[2].x - v.x, mark[2].y - v.y));
    const r = mark.map((p) => Math.hypot(p.x - v.x, p.y - v.y));
    return Math.max(...r) - Math.min(...r);
  };
  const v = [...dots].sort((a, b) => score(a) - score(b))[0];
  const [p1, p2] = dots.filter((d) => d !== v);
  return { v, p1, p2 };
}

describe('#1714 — 2-D draws its marks with the shared planar kit', () => {
  it('a stated angle: the arc sweeps the interior angle at its vertex', () => {
    const { dots, marks } = draw(['משולש ABC', 'זווית ABC = 40']);
    expect(marks).toHaveLength(1);
    const c = cornerOf(marks[0], dots, false);
    expect(arcFaults(marks[0], c.v, c.p1, c.p2, 1e-6)).toEqual([]);
  });

  it('a stated right angle: the knee is a square on the two rays', () => {
    const { dots, marks } = draw(['משולש ABC', 'זווית ABC = 90']);
    expect(marks).toHaveLength(1);
    const c = cornerOf(marks[0], dots, true);
    expect(kneeFaults(marks[0], c.v, c.p1, c.p2, 1e-6)).toEqual([]);
  });

  it("a named shape's declared equality: one tick across each equal side, centred", () => {
    const { dots, ticks } = draw(['משולש ABC'], [[['A', 'B'], ['A', 'C']]]);
    expect(ticks).toHaveLength(2);
    for (const tk of ticks) {
      const mid = { x: (tk[0].x + tk[1].x) / 2, y: (tk[0].y + tk[1].y) / 2 };
      const pairs = dots.flatMap((a, i) => dots.slice(i + 1).map((b) => [a, b] as const));
      const [a, b] = pairs.sort(
        (p, q) => Math.hypot((p[0].x + p[1].x) / 2 - mid.x, (p[0].y + p[1].y) / 2 - mid.y) - Math.hypot((q[0].x + q[1].x) / 2 - mid.x, (q[0].y + q[1].y) / 2 - mid.y),
      )[0];
      const half = Math.hypot(tk[1].x - tk[0].x, tk[1].y - tk[0].y) / 2;
      expect(tickFaults([tk], a, b, 1, half, 1e-6)).toEqual([]);
    }
  });
});
