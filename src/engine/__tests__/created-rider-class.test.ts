/**
 * #412 / ADR-414 — an engine-CREATED rider must declare its DOF class.
 *
 * `ensureCollinearRiders` (ADR-408) creates a new label in a collinearity statement as a rider on the
 * anchors' line. A rider placed BEYOND an anchor (t = 1.5) is the EXTENSION class, but it was born with
 * no `extension` flag — and that flag is what every mechanism reads to learn what the DOF is:
 *
 *  - `evaluate`'s driven range/clamp: `[1.02, 12]` for an extension vs the interior `[0, 1]`, so driving
 *    a flag-less rider CLAMPED it off the very side the letter order states;
 *  - `recruitableFreeDof`: failure-path eligibility (`free === true || extension === true`), so no rung
 *    could recruit it and it could not take over a satisfied order from its neighbour;
 *  - the sampler's `isSamplableExtension`: ADR-052 variation — its own doc names this smell, "a default
 *    masquerading as fixed".
 *
 * Consequence measured on the operator's play figure: both follow-on statements about the created point
 * refused as FALSE over-constraints although a solution existed in each case.
 */

import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { freeDofs } from '@/engine';
import { useGeoStore, replay } from '@/store/geoStore';
import type { GeoObject } from '@/engine/types';

const enter = (utterances: string[]) => {
  const st = useGeoStore.getState();
  st.clear();
  for (const u of utterances) {
    const facts = useGeoStore.getState().facts;
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    expect(r.ok, `parse: ${u}`).toBe(true);
    if (!r.ok) return;
    for (const cmd of r.commands) useGeoStore.getState().execute(cmd, u);
  }
};

const figure = () => {
  const st = useGeoStore.getState();
  return replay(st.facts, st.seed);
};

const riderOf = (id: string): Extract<GeoObject, { kind: 'on-segment' }> => {
  const o = figure().construction.objects.find((x: GeoObject) => x.id === id);
  expect(o, `${id} exists`).toBeTruthy();
  expect(o!.kind, `${id} is a rider`).toBe('on-segment');
  return o as Extract<GeoObject, { kind: 'on-segment' }>;
};

/** Parameter of P along a→b (1 = at b, >1 = beyond b). */
const tAlong = (fig: ReturnType<typeof figure>, a: string, b: string, p: string) => {
  const A = fig.positions.get(a)!;
  const B = fig.positions.get(b)!;
  const P = fig.positions.get(p)!;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  return ((P.x - A.x) * dx + (P.y - A.y) * dy) / (dx * dx + dy * dy);
};

const allOk = (fig: ReturnType<typeof figure>) => {
  for (const [id, s] of Object.entries(fig.status)) expect(s, `step ${id}`).toBe('ok');
};

const BASE = ['טרפז ABCD', 'EF קטע אמצעים', 'DB', 'AC', 'G על המשך AB', 'ישר GFH'];

describe('#412 — a created rider declares its DOF class', () => {
  it('a TRAILING new label is created as an extension rider (beyond the far anchor)', () => {
    enter(BASE);
    const H = riderOf('H');
    expect(H.extension, 'H carries the extension flag').toBe(true);
    expect(H.free, 'an extension rider is not an interior free slider').toBeUndefined();
    expect([H.a, H.b], 'H rides the anchors G→F').toEqual(['G', 'F']);
    expect(tAlong(figure(), 'G', 'F', 'H'), 'H sits beyond F (the stated order G→F→H)').toBeGreaterThan(1);
  });

  it('a LEADING new label is an extension rider on the other side', () => {
    enter(['טרפז ABCD', 'EF קטע אמצעים', 'G על המשך AB', 'ישר HGF']);
    const H = riderOf('H');
    expect(H.extension, 'the mirrored side is the same class').toBe(true);
    expect(tAlong(figure(), 'F', 'G', 'H'), 'H sits beyond G (the stated order H→G→F)').toBeGreaterThan(1);
  });

  it('an INTERIOR new label stays a free slider (unchanged)', () => {
    enter(['טרפז ABCD', 'EF קטע אמצעים', 'G על המשך AB', 'ישר GHF']);
    const H = riderOf('H');
    expect(H.free, 'an interior letter is a free slider (ADR-052)').toBe(true);
    expect(H.extension, 'and not an extension').toBeUndefined();
  });

  // ADR-052: the rider's distance beyond the anchor is UNSTATED, so it must vary across configurations.
  // Flag-less it was counted as movable but never sampled — frozen at t = 1.5 in every view.
  it('the created rider is a sampled free DOF, not a frozen default', () => {
    enter(BASE);
    expect(freeDofs(figure().construction), 'H is a free DOF').toContain('H');
    const ts = new Set<number>();
    for (let press = 0; press <= 8; press++) {
      if (press > 0) useGeoStore.getState().resample();
      const fig = figure();
      const t = tAlong(fig, 'G', 'F', 'H');
      expect(t, `view ${press}: H stays beyond F`).toBeGreaterThan(1);
      ts.add(Math.round(t * 4)); // bucket to 25% of the segment length
    }
    expect(ts.size, 'H lands at more than one distance beyond F across views').toBeGreaterThan(1);
  });

  it('a membership on ANOTHER host slides the rider to the crossing (was a false over-constraint)', () => {
    enter([...BASE, 'H על CD']);
    const fig = figure();
    allOk(fig);
    // H is now the GF × CD crossing: on line GF beyond F, and on segment CD.
    expect(tAlong(fig, 'G', 'F', 'H'), 'H stays on the stated side of F').toBeGreaterThan(1);
    const u = tAlong(fig, 'C', 'D', 'H');
    expect(u, 'H lands within segment CD').toBeGreaterThan(0);
    expect(u, 'H lands within segment CD').toBeLessThan(1);
  });

  it('a ∥ through the rider slides the referenced extension rider instead of morphing the trapezoid (#404)', () => {
    enter([...BASE, 'GH מקביל ל AD']);
    const fig = figure();
    allOk(fig);
    expect(fig.violations.map((v) => v.message).join('|'), 'the declared trapezoid is preserved').toBe('');
    const G = fig.positions.get('G')!;
    const H = fig.positions.get('H')!;
    const A = fig.positions.get('A')!;
    const D = fig.positions.get('D')!;
    const cross = (H.x - G.x) * (D.y - A.y) - (H.y - G.y) * (D.x - A.x);
    const norm = Math.hypot(H.x - G.x, H.y - G.y) * Math.hypot(D.x - A.x, D.y - A.y);
    expect(Math.abs(cross) / Math.max(norm, 1e-9), 'GH ∥ AD holds').toBeLessThan(1e-4);
  });
});
