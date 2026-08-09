/**
 * #483 — a determined-but-unnamed ℓ∩π crossing is OFFERED as a clickable dot.
 *
 * Operator, 2026-08-09, prod: "when we now have l perpendicular to π1, I would expect to see the
 * intersection point between them like we have in the 2d tool. When there is an intersection, give a dot
 * the user can click and name."
 *
 * The capability to name one already existed; what was missing is the offer. So the tests that matter are
 * about WHEN the offer appears — and above all when it must not, because a dot on a point the givens do
 * not fix invites the student to name an artefact of the branch we happened to draw.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { crossingUtterance3, nextFreeLabel3, openCrossings3 } from '../engine/crossings3';
import { dist3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const at = (seed = 0) => derive3(state().facts, seed);
const offers = (seed = 0) => {
  const d = at(seed);
  return openCrossings3(d.construction, d.resolved);
};

/** The 2024-Q2 pair, pinned by ⟂ to a SINGLE root (m = -5) — the operator's "now perpendicular" case. */
const perpFigure = () => {
  submit('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)');
  submit('המישור π: 3x + my + (m+6)z + 4 = 0');
  submit('הישר ℓ ניצב למישור π');
};

describe('#483 — the offer appears exactly when the crossing is knowledge', () => {
  beforeEach(() => state().clear());

  it('a ⟂ line and plane offer their crossing', () => {
    perpFigure();
    expect(state().lastError).toBeNull();
    const ks = offers();
    expect(ks).toHaveLength(1);
    expect(ks[0]).toMatchObject({ line: 'ℓ', plane: 'π' });
  });

  it('the offered point actually LIES on both the line and the plane', () => {
    perpFigure();
    const { resolved } = at();
    const k = offers()[0];
    const pl = resolved.planes.get('π')!;
    const ln = resolved.lines.get('ℓ')!;
    // on the plane: n·p + d = 0
    expect(pl.n.x * k.point.x + pl.n.y * k.point.y + pl.n.z * k.point.z + pl.d).toBeCloseTo(0, 6);
    // on the line: (p − anchor) ∥ dir
    const t = (k.point.x - ln.anchor.x) / ln.dir.x;
    expect(k.point.y).toBeCloseTo(ln.anchor.y + t * ln.dir.y, 6);
    expect(k.point.z).toBeCloseTo(ln.anchor.z + t * ln.dir.z, 6);
  });

  it('it is the SAME point in every configuration — that is what makes it offerable', () => {
    perpFigure();
    const a = offers(0)[0];
    const b = offers(3)[0];
    expect(dist3(a.point, b.point)).toBeLessThan(1e-9);
  });

  /**
   * The honesty gate. An unpinned parameter makes the line a sample of itself, so the crossing moves
   * between drawings — offering it would invite the student to name a point the givens never fixed
   * (ADR-052, and ADR-3D-118 for the canvas echo of the same rule).
   */
  it('an UNFORCED parameter offers nothing, even though the line does cross the plane', () => {
    submit('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)');
    submit('המישור π: 3x + my + (m+6)z + 4 = 0'); // m is open — no pinning given
    expect(state().lastError).toBeNull();
    // the drawn figure DOES have a crossing at whatever m this seed sampled…
    const d = at();
    expect(d.resolved.lines.get('ℓ')).toBeDefined();
    expect(d.resolved.planes.get('π')).toBeDefined();
    // …and it must not be offered, precisely because it is a sample
    expect(offers()).toHaveLength(0);
  });

  it("the operator's ∥ figure offers nothing — there is no crossing to name", () => {
    submit('הישר ℓ: x = (1,2,3) + t(m-2, m, m+2)');
    submit('המישור π1: x + (m-2)y + (m-1)z - 5 = 0');
    submit('הישר ℓ מקביל למישור π1'); // m = ±√2, and ∥ means no single point
    expect(offers()).toHaveLength(0);
  });
});

describe('#483 — naming retires the offer', () => {
  beforeEach(() => state().clear());

  it('the synthesized utterance parses, lands the point, and the dot disappears', () => {
    perpFigure();
    const k = offers()[0];
    const id = nextFreeLabel3(at().construction)!;
    const utterance = crossingUtterance3(k, id, true);

    submit(utterance);
    expect(state().lastError, `the click's own sentence must parse: ${utterance}`).toBeNull();

    const d = at();
    const placed = d.resolved.positions.get(id);
    expect(placed, 'the named point exists').toBeDefined();
    expect(dist3(placed!, k.point), 'and it is where the dot was').toBeLessThan(1e-6);
    expect(offers(), 'the offer is retired once the point has a name').toHaveLength(0);
  });

  it('the English sentence parses too (the click follows the UI language)', () => {
    perpFigure();
    const k = offers()[0];
    submit(crossingUtterance3(k, 'A', false));
    expect(state().lastError).toBeNull();
    expect(at().resolved.positions.get('A')).toBeDefined();
  });

  it('a point that arrived some OTHER way also retires the offer (position, not provenance)', () => {
    perpFigure();
    const k = offers()[0];
    // name it by the verb frame instead — a different command path, same point
    submit(`ℓ חותך את π בנקודה Q`);
    expect(state().lastError).toBeNull();
    expect(dist3(at().resolved.positions.get('Q')!, k.point)).toBeLessThan(1e-6);
    expect(offers()).toHaveLength(0);
  });
});

describe('#483 — the scene carries the offer to the renderer', () => {
  beforeEach(() => state().clear());

  it('buildScene3 projects each offer to a screen position', () => {
    perpFigure();
    const d = at();
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
    expect(scene.crossings).toHaveLength(1);
    expect(scene.crossings[0]).toMatchObject({ line: 'ℓ', plane: 'π' });
    expect(Number.isFinite(scene.crossings[0].x)).toBe(true);
    expect(Number.isFinite(scene.crossings[0].y)).toBe(true);
  });

  it('a figure with no algebraic objects offers nothing (and costs nothing)', () => {
    submit("תיבה ABCDA'B'C'D'");
    const d = at();
    expect(openCrossings3(d.construction, d.resolved)).toHaveLength(0);
    expect(buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1).crossings).toHaveLength(0);
  });
});

describe('#483 — label allocation', () => {
  beforeEach(() => state().clear());

  it('picks the first free capital, skipping the ones already in the figure', () => {
    submit("תיבה ABCDA'B'C'D'");
    const free = nextFreeLabel3(at().construction)!;
    expect(at().construction.points.has(free)).toBe(false);
    expect(['A', 'B', 'C', 'D']).not.toContain(free);
  });
});
