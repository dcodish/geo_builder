/**
 * #429 (ADR-423): which part of a circle is DRAWN is engine knowledge, and a free point on it is
 * confined to the ink.
 *
 * Reported (operator, 2026-07-30): "when i draw half a circle, all references to the circle need to be
 * to the drawn half and not the part that isnt shown." «חצי מעגל» + «משולש CDE חסום במעגל» put E at
 * θ = 280° — below the diameter, in empty space, `lastError: null` and no violation.
 *
 * Root cause: an arc's drawn extent was RENDERER-ONLY knowledge. `arc` objects were read at exactly one
 * site (`render/scene.ts`), and both decisions that fix which part is drawn — the bulge flip and the
 * traversal direction realising the intended span — were resolved at render time. The engine's circle was
 * always the FULL circle, so no requirement or sampling mechanism could restrict anything to the ink: it
 * could not even ask the question.
 */
import { describe, expect, it } from 'vitest';
import {
  angleIntoSpans, angleOffSpans, angleOnSpans, drawnArcSpans, drawnSign, norm2pi, orientArc, type ArcSpan,
} from '../arcs';
import { buildScene } from '@/render/scene';
import { factsOf } from '@/__tests__/scenarios-harness';
import { replay } from '@/store/geoStore';

const deg = (r: number) => (norm2pi(r) * 180) / Math.PI;

describe('the drawn-extent helpers', () => {
  const upper: ArcSpan[] = [{ start: 0, len: Math.PI }]; // the 0°..180° half

  it('a circle with NO arcs reports null — the whole circle is available', () => {
    expect(drawnArcSpans([], new Map(), '@ctr-O', 5)).toBeNull();
    // and every consumer must read null as "unrestricted" (the blast-radius guarantee)
    expect(angleOnSpans(4.2, null)).toBe(true);
    expect(angleIntoSpans(4.2, null)).toBe(4.2);
    expect(angleOffSpans(4.2, null)).toBe(0);
    expect(drawnSign(4.2, null)).toBe(1);
  });

  it('angleOnSpans admits the ink and the endpoints, rejects the rest', () => {
    expect(angleOnSpans(Math.PI / 2, upper)).toBe(true);
    expect(angleOnSpans(0, upper)).toBe(true); // an endpoint counts
    expect(angleOnSpans(Math.PI, upper)).toBe(true);
    expect(angleOnSpans(-Math.PI / 2, upper)).toBe(false); // 270° — the undrawn half
    expect(angleOnSpans((280 * Math.PI) / 180, upper)).toBe(false); // the reported E
  });

  it('angleOffSpans measures how far off the ink an angle is', () => {
    expect(angleOffSpans(Math.PI / 2, upper)).toBe(0);
    expect(angleOffSpans((270 * Math.PI) / 180, upper)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('angleIntoSpans maps ANY angle strictly inside the ink, monotonically', () => {
    const seen: number[] = [];
    for (let t = 0; t < 2 * Math.PI; t += 0.31) {
      const a = angleIntoSpans(t, upper);
      expect(angleOnSpans(a, upper), `${deg(t)}° → ${deg(a)}°`).toBe(true);
      // STRICTLY inside — never onto the endpoints A/B (the operator's ruling)
      expect(deg(a)).toBeGreaterThan(1);
      expect(deg(a)).toBeLessThan(179);
      seen.push(a);
    }
    // monotone ⇒ varying θ still sweeps along the arc, so "show another configuration" keeps its variety
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    expect(new Set(seen.map((x) => x.toFixed(3))).size).toBe(seen.length);
  });

  it('drawnSign picks the DRAWN one of two antipodal candidates', () => {
    expect(drawnSign(Math.PI / 2, upper)).toBe(1); // 90° is drawn — keep it
    expect(drawnSign(-Math.PI / 2, upper)).toBe(-1); // 270° is not — flip to 90°
    // no information (both/neither drawn) keeps the legacy choice
    expect(drawnSign(Math.PI / 2, [{ start: 0, len: 2 * Math.PI }])).toBe(1);
  });

  it('orientArc realises the INTENDED span, not the raw CCW sweep', () => {
    const c = { x: 0, y: 0 };
    const a = { x: 5, y: 0 };
    const b = { x: -5, y: 0 };
    // from B to A with a 180° span: whichever traversal gives 180°
    const or = orientArc(c, b, a, { spanDeg: 180 })!;
    expect(Math.abs(or.sweepAng)).toBeCloseTo(Math.PI, 9);
    // a quarter: the same endpoints can't make 90°, but a genuine quarter does
    const q = orientArc(c, { x: 5, y: 0 }, { x: 0, y: 5 }, { spanDeg: 90 })!;
    expect(Math.abs(q.sweepAng)).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('#429 — the engine and the RENDERER agree about the drawn extent', () => {
  // The whole point of extracting `orientArc`: before it, the two could not even be compared.
  for (const u of ['חצי מעגל', 'רבע מעגל']) {
    it(`«${u}»: every scene arc's sweep matches the engine's span`, () => {
      const fig = replay(factsOf([u]));
      const scene = buildScene(fig.construction, fig.positions);
      expect(scene.arcs.length).toBeGreaterThan(0);
      const arcs = fig.construction.objects.filter((o) => o.kind === 'arc');
      const ctrId = (fig.construction.objects.find((o) => o.kind === 'circle') as { center: string }).center;
      const r = [...fig.circles.values()][0].r;
      const spans = drawnArcSpans(arcs, fig.positions, ctrId, r)!;
      expect(spans).toHaveLength(scene.arcs.length);
      for (const sa of scene.arcs) {
        // the scene arc's own interval, normalized the way a span is
        const start = sa.sweepAng >= 0 ? norm2pi(sa.startAng) : norm2pi(sa.startAng + sa.sweepAng);
        const match = spans.find((sp) => Math.abs(norm2pi(sp.start - start)) < 1e-9 && Math.abs(sp.len - Math.abs(sa.sweepAng)) < 1e-9);
        expect(match, `scene arc ${sa.id} (start ${deg(start)}°, len ${deg(Math.abs(sa.sweepAng))}°) has no matching engine span`).toBeTruthy();
      }
    });
  }
});

describe('#429 — the class members, end to end', () => {
  /** θ of `id` about the semicircle's centre, in degrees. */
  function angles(steps: string[], ids: string[], seed = 0) {
    const fig = replay(factsOf(steps), seed);
    const ctr = fig.positions.get('@ctr-O')!;
    return {
      fig,
      deg: ids.map((id) => {
        const p = fig.positions.get(id)!;
        return ((Math.atan2(p.y - ctr.y, p.x - ctr.x) * 180) / Math.PI + 360) % 360;
      }),
      r: ids.map((id) => {
        const p = fig.positions.get(id)!;
        return Math.hypot(p.x - ctr.x, p.y - ctr.y);
      }),
    };
  }
  const onUpper = (d: number) => d > 0.5 && d < 179.5;

  it('(a) the reported figure — an inscribed triangle rides the DRAWN half', () => {
    const { fig, deg: d, r } = angles(['חצי מעגל', 'משולש CDE חסום במעגל'], ['C', 'D', 'E']);
    for (const x of r) expect(x).toBeCloseTo(5, 6); // still genuinely on the circle
    for (const x of d) expect(onUpper(x), `θ=${x.toFixed(1)}°`).toBe(true);
    expect(fig.violations).toEqual([]);
  });

  it('(a) holds across many seeds — and the configurations still VARY', () => {
    const facts = factsOf(['חצי מעגל', 'משולש CDE חסום במעגל']);
    const shapes = new Set<string>();
    for (let seed = 0; seed < 12; seed++) {
      const fig = replay(facts, seed);
      const ctr = fig.positions.get('@ctr-O')!;
      const ds = ['C', 'D', 'E'].map((id) => {
        const p = fig.positions.get(id)!;
        return ((Math.atan2(p.y - ctr.y, p.x - ctr.x) * 180) / Math.PI + 360) % 360;
      });
      for (const x of ds) expect(onUpper(x), `seed ${seed}: θ=${x.toFixed(1)}°`).toBe(true);
      shapes.add(ds.map((x) => x.toFixed(0)).join(','));
    }
    expect(shapes.size, 'sampling still explores genuinely different configurations').toBeGreaterThan(4);
  });

  it('(b) the ARC MIDPOINT takes the drawn arc — the deterministic, 0-DOF case', () => {
    // sharper than the report: the student names arc AB and reliably got the OTHER arc's midpoint
    const { deg: d, r } = angles(['חצי מעגל', 'F אמצע הקשת AB'], ['F']);
    expect(r[0]).toBeCloseTo(5, 6);
    expect(d[0]).toBeCloseTo(90, 4); // the top of the drawn half (was 270°)
  });

  it('(c) bare membership on the circle lands on the ink', () => {
    const { deg: d } = angles(['חצי מעגל', 'C, D, E על המעגל'], ['C', 'D', 'E']);
    for (const x of d) expect(onUpper(x), `θ=${x.toFixed(1)}°`).toBe(true);
  });

  it('generalizes beyond 180° — a QUARTER circle confines just as tightly', () => {
    const fig = replay(factsOf(['רבע מעגל', 'C, D על המעגל']));
    const arcs = fig.construction.objects.filter((o) => o.kind === 'arc');
    const ctrId = (fig.construction.objects.find((o) => o.kind === 'circle') as { center: string }).center;
    const rc = [...fig.circles.values()][0];
    const spans = drawnArcSpans(arcs, fig.positions, ctrId, rc.r)!;
    expect(spans.reduce((s, sp) => s + sp.len, 0)).toBeCloseTo(Math.PI / 2, 6); // a quarter, not a half
    for (const id of ['C', 'D']) {
      const p = fig.positions.get(id)!;
      const ang = Math.atan2(p.y - rc.center.y, p.x - rc.center.x);
      expect(angleOnSpans(ang, spans, 1e-6), `${id} on the drawn quarter`).toBe(true);
    }
  });

  it('a FULL circle is untouched — free vertices keep the whole 360° (byte-identical guarantee)', () => {
    const before = replay(factsOf(['מעגל O', 'משולש ABC חסום במעגל']));
    const ctr = before.positions.get('O')!;
    const ds = ['A', 'B', 'C'].map((id) => {
      const p = before.positions.get(id)!;
      return ((Math.atan2(p.y - ctr.y, p.x - ctr.x) * 180) / Math.PI + 360) % 360;
    });
    // vertices spread around the WHOLE circle — at least one outside the 0..180 half
    expect(ds.some((d) => d > 180), `angles ${ds.map((d) => d.toFixed(0)).join()}`).toBe(true);
    expect(before.violations).toEqual([]);
  });
});
