/**
 * #918 ([ADR-3D-235](../../docs/06b-decisions-3d.md)) — A STATED LENGTH IS DRAWN ON THE FIGURE.
 *
 * The operator, playing round #915's T5: *"might be a new request but when we say AB=5 should 5 be
 * drawn next to AB?"* Ruled 2026-09-06: **stated lengths, always**, at the segment midpoint, including
 * on a dashed back edge.
 *
 * The gap was an inconsistency INSIDE 3-D rather than a missing capability: a stated DISTANCE already
 * drew a witness line labelled with its value and a stated ANGLE an arc with its value — a stated
 * LENGTH was the one kind of magnitude that reached the data panel and never the canvas. CLAUDE.md's
 * honesty invariant is *"everything the student stated is visible on the figure"*, and it was true of
 * two magnitude kinds out of three.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { statedLengths } from '../engine/dataView';

const BOX = "תיבה ABCDA'B'C'D'";
const st = () => useGeo3.getState();
function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
function scene(us: string[]) {
  reset();
  for (const u of us) st().submit(u);
  const d = derive3(st().facts, st().seed);
  expect(st().lastError, us.join(' · ')).toBeNull();
  return { d, s: buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1) };
}
const labels = (us: string[]) => scene(us).s.measures.map((m) => `${m.a}${m.b}:${m.text}`).sort();

describe('#918 — a stated length reaches the canvas', () => {
  beforeEach(reset);

  it('«AB = 5» draws exactly one label, reading «5»', () => {
    const { s } = scene([BOX, 'AB = 5']);
    expect(s.measures).toHaveLength(1);
    expect(s.measures[0].text).toBe('5');
    expect([s.measures[0].a, s.measures[0].b].sort()).toEqual(['A', 'B']);
  });

  it('the label sits at the segment’s PROJECTED midpoint', () => {
    const { s } = scene([BOX, 'AB = 5']);
    const at = (id: string) => s.points.find((p) => p.id === id)!;
    const A = at('A');
    const B = at('B');
    const m = s.measures[0];
    // The label carries the same small offset the distance witness uses, so "at the midpoint" means
    // within that offset — not that it is drawn exactly on the ink.
    expect(Math.abs(m.labelX - (A.x + B.x) / 2), 'x near the midpoint').toBeLessThan(20);
    expect(Math.abs(m.labelY - (A.y + B.y) / 2), 'y near the midpoint').toBeLessThan(20);
  });

  it('two different stated lengths draw two labels', () => {
    expect(labels([BOX, 'AB = 5', 'AD = 3'])).toEqual(['AB:5', 'AD:3']);
  });

  it('a RESTATED length is one statement and one label («AB = 5» then «BA = 5»)', () => {
    expect(labels([BOX, 'AB = 5', 'BA = 5'])).toEqual(['AB:5']);
  });

  it('a DERIVED length gets no label — only what the student stated', () => {
    // AB and AD are stated; BD is forced by them and its value is knowable — and it stays in the data
    // panel. Putting derived numbers on the drawing turns it into an answer sheet, which is the
    // opposite of the pedagogy (the stated-only rule, matching 2-D's MeasureLabels).
    const shown = labels([BOX, 'AB = 5', 'AD = 3']);
    expect(shown.some((l) => l.startsWith('BD')), 'the derived diagonal is not labelled').toBe(false);
    expect(shown, 'exactly the two stated ones').toEqual(['AB:5', 'AD:3']);
  });

  it('a figure with no stated length draws none', () => {
    expect(scene([BOX]).s.measures).toEqual([]);
  });
});

describe('#918 — a HIDDEN edge still carries its label (the ruling, locked)', () => {
  beforeEach(reset);

  it('the label is drawn even when the segment is a dashed back edge', () => {
    // The operator ruled "always, including on a dashed back edge", and the alternative — suppressing
    // it — was explicitly rejected: a number that comes and goes as you orbit reads as the tool losing
    // the given. This asserts the promise on a figure that actually HAS hidden edges, so a later
    // "cleanup" that gates labels on visibility fails here.
    const { s } = scene([BOX, 'AB = 5', 'AD = 3', "AA' = 4"]);
    expect(s.edges.some((e) => e.hidden), 'the box really does have hidden edges').toBe(true);
    expect(labels([BOX, 'AB = 5', 'AD = 3', "AA' = 4"]), 'every stated length labelled, hidden or not').toEqual([
      "AA':4",
      'AB:5',
      'AD:3',
    ]);
  });
});

describe('#918 — the class: every stated magnitude kind, swept', () => {
  beforeEach(reset);

  it('a stated DISTANCE keeps its witness and grows no length label', () => {
    const { s } = scene([BOX, "המרחק בין A למישור BCC'B' הוא 5"]);
    expect(s.witnesses.length, 'the witness lane is untouched').toBe(1);
    expect(s.measures, 'a distance is not a length').toEqual([]);
  });

  it('a stated ANGLE keeps its arc and grows no length label', () => {
    const { s } = scene([BOX, "הזווית בין AC לבין BA היא 40"]);
    expect(s.angles.length, 'the arc lane is untouched').toBe(1);
    expect(s.measures).toEqual([]);
  });

  it('a magnitude given «|u| = 5» is ALREADY this lane — it lowers to a length pin', () => {
    // Measured, not assumed: the sweep the fix plan asked for. `mag-val` is not a separate kind at
    // this seam, so there is nothing further to build for it — recorded here so the next session does
    // not go looking.
    const { d, s } = scene([BOX, 'נסמן: AB = u', '|u| = 5']);
    expect(d.construction.scalarPins.map((p) => p.kind), 'it becomes a length pin').toContain('length');
    expect(s.measures.map((m) => m.text), 'and is drawn by the same lane').toEqual(['5']);
  });
});

describe('#918 — one source for "what did the student state"', () => {
  it('the canvas labels exactly the engine’s statedLengths — no second enumeration', () => {
    // The drift this guards: a renderer-local list of "stated lengths" that has to agree with the data
    // panel's. There is one list; this asserts the canvas is reading it.
    const { d, s } = scene([BOX, 'AB = 5', 'AD = 3', "AA' = 4"]);
    const fromEngine = [...statedLengths(d.construction).entries()]
      .map(([k, v]) => `${k.split('|').join('')}:${v}`)
      .sort();
    expect(s.measures.map((m) => `${[m.a, m.b].sort().join('')}:${m.text}`).sort()).toEqual(fromEngine);
  });
});
