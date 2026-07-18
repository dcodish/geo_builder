/**
 * The two-circle bundle (issues #196/#210/#197/#191/#192, ADR-358..362):
 *  - mutual POSITION: «שני מעגלים זרים» disjoint / «מוכל בתוך» contained — a `set-circle-position`
 *    REQUIREMENT (verifier + meetsRequirements), never an LLM guess;
 *  - the WORD-relation honesty gate (`droppedWordRelations`) — a stated זרים/מוכל must be encoded;
 *  - common-tangent KIND («חיצוני»/«פנימי») + repetition avoid;
 *  - the four-point secant one-liner «ישר חותך את שני המעגלים בנקודות C, D, E ו-F»;
 *  - the ORDINAL circle reference «המעגל השלישי».
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx, droppedWordRelations } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { withVariant, variantCountOf } from '@/engine/variants';

function buildFacts(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const { construction, positions } = replay(facts);
    const r = parse(step, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`step did not parse: ${step} (${(r as { reason?: string }).reason})`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
}
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('ADR-358 (#196) — two circles: mutual position', () => {
  for (const u of ['שני מעגלים זרים', 'two disjoint circles']) {
    it(`«${u}» builds two genuinely DISJOINT circles, verifier clean`, () => {
      const fig = replay(buildFacts([u]));
      expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
      expect(fig.violations).toEqual([]);
      const [c1, c2] = [...fig.circles.values()];
      expect(c2, 'two circles').toBeTruthy();
      expect(d(c1.center, c2.center), 'centre gap beyond the radii sum').toBeGreaterThan(c1.r + c2.r);
    });
  }

  for (const u of ['שני מעגלים מוכלים', 'מעגל P מוכל בתוך מעגל O', 'circle P contained in circle O']) {
    it(`«${u}» builds one circle strictly INSIDE the other, verifier clean`, () => {
      const fig = replay(buildFacts([u]));
      expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
      expect(fig.violations).toEqual([]);
      const cs = [...fig.circles.values()];
      expect(cs).toHaveLength(2);
      const [big, small] = cs[0].r >= cs[1].r ? [cs[0], cs[1]] : [cs[1], cs[0]];
      expect(d(big.center, small.center) + small.r, 'inner fully inside outer').toBeLessThan(big.r);
    });
  }

  it('named form: «מעגל P מוכל בתוך מעגל O» — P is the stated INNER', () => {
    const r = parse('מעגל P מוכל בתוך מעגל O', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pos = r.commands.find((c): c is Extract<AnyCommand, { type: 'set-circle-position' }> => c.type === 'set-circle-position')!;
    expect(pos.relation).toBe('contained');
    expect(pos.a).toBe('circle-O'); // outer
    expect(pos.b).toBe('circle-P'); // inner
  });

  it('M1: «המעגלים זרים» on two EXISTING circles is the statement alone (no re-creation)', () => {
    const facts = buildFacts(['שני מעגלים נחתכים']);
    const { construction, positions } = replay(facts);
    const r = parse('המעגלים זרים', buildParseCtx(construction, positions));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.every((c) => c.type === 'set-circle-position')).toBe(true);
  });

  it('guard: a point-side «M בתוך המעגל» is NEVER claimed as a circle relation', () => {
    const facts = buildFacts(['מעגל O']);
    const { construction, positions } = replay(facts);
    const r = parse('M בתוך המעגל', buildParseCtx(construction, positions));
    if (r.ok) expect(r.commands.some((c) => c.type === 'set-circle-position')).toBe(false);
  });

  it('a second bare «מעגל P» beside an existing circle seats APART (no phantom overlap)', () => {
    const fig = replay(buildFacts(['מעגל O', 'מעגל P']));
    const cs = [...fig.circles.values()];
    expect(cs).toHaveLength(2);
    expect(d(cs[0].center, cs[1].center), 'seeded clear of each other').toBeGreaterThan(cs[0].r + cs[1].r);
  });

  it('…and a STATED crossing pulls apart-seated circles back together (the ADR-255 pattern, circle edition)', () => {
    const fig = replay(buildFacts(['מעגל O', 'מעגל P', 'A נקודת החיתוך של המעגלים']));
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    const A = fig.positions.get('A')!;
    for (const c of fig.circles.values()) expect(d(A, c.center), 'A on the circle').toBeCloseTo(c.r, 3);
  });
});

describe('#196 Am. — bare «שני מעגלים»: the mutual position is a cyclable VARIANT', () => {
  const classify = (fig: ReturnType<typeof replay>): string => {
    const [a, b] = [...fig.circles.values()];
    const gap = d(a.center, b.center);
    if (gap > a.r + b.r) return 'disjoint';
    if (gap + Math.min(a.r, b.r) < Math.max(a.r, b.r)) return 'contained';
    return 'intersecting';
  };
  for (const u of ['שני מעגלים', 'two circles']) {
    it(`bare «${u}» builds two circles and "show another" TOGGLES the cases`, () => {
      const facts = buildFacts([u]);
      const fig = replay(facts);
      expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
      expect(fig.violations).toEqual([]);
      expect([...fig.circles.values()]).toHaveLength(2);
      // Cycle the variant (what searchAnotherView's composite step applies) — the position class changes.
      const seen = new Set<string>();
      for (const v of [0, 1, 2]) {
        const stepped = facts.map((f) => (f.cmd.type === 'set-circle-position' ? { ...f, cmd: withVariant(f.cmd, v) } : f));
        seen.add(classify(replay(stepped)));
      }
      expect(seen, 'the three mutual-position cases are all reachable').toEqual(new Set(['intersecting', 'disjoint', 'contained']));
    });
  }
});

describe('#197 Am. — a kind-less common tangent TOGGLES its basin', () => {
  it('variant cycling flips the tangent between external and internal sides', () => {
    const facts = buildFacts(['שני מעגלים זרים', 'AB משיק משותף לשני המעגלים']);
    const ct = facts.find((f) => f.cmd.type === 'common-tangent');
    expect(ct, 'the kind-less tangent now carries the cyclable record').toBeTruthy();
    expect(variantCountOf(ct!.cmd)).toBe(4);
    const sideProduct = (v: number): number => {
      const stepped = facts.map((f) => (f.cmd.type === 'common-tangent' ? { ...f, cmd: withVariant(f.cmd, v) } : f));
      const fig = replay(stepped);
      const A = fig.positions.get('A')!, B = fig.positions.get('B')!;
      const [c1, c2] = [...fig.circles.values()];
      const side = (p: { x: number; y: number }) => (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
      return side(c1.center) * side(c2.center);
    };
    const signs = new Set([0, 1, 2, 3].map((v) => Math.sign(sideProduct(v))));
    expect(signs.has(1), 'an external basin (same side) is reachable').toBe(true);
    expect(signs.has(-1), 'an internal basin (opposite sides) is reachable').toBe(true);
  });
});

describe('#197 Am. 3 — מבחוץ/מבפנים synonyms + tangent EXHAUSTION refuses fast', () => {
  for (const [u, want] of [
    ['AB משיק משותף מבחוץ לשני המעגלים', 'external'],
    ['CD משיק משותף מבפנים לשני המעגלים', 'internal'],
  ] as const) {
    it(`«${u}» reads kind ${want}`, () => {
      const facts = buildFacts(['שני מעגלים זרים', u]);
      const ct = facts.find((f) => f.cmd.type === 'common-tangent')!.cmd as Extract<AnyCommand, { type: 'common-tangent' }>;
      expect(ct.kind).toBe(want);
    });
  }

  it("the operator's crash sequence: a THIRD external tangent refuses deterministically (never a solver grind)", () => {
    // All four tangents drawn (2 external + 2 internal), then a fifth request — the exact play-test
    // figure that burned the recruiter and blamed an unrelated old constraint.
    const facts = buildFacts([
      'שני מעגלים זרים',
      'משיק משותף חיצוני',
      'משיק משותף פנימי',
      'משיק משותף פנימי',
      'משיק משותף חיצוני',
    ]);
    const { construction, positions } = replay(facts);
    const t0 = Date.now();
    const r = parse('משיק משותף חיצוני', buildParseCtx(construction, positions));
    expect(Date.now() - t0, 'a deterministic refusal, not a solve').toBeLessThan(500);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('tangents-exhausted');
      if (r.reason === 'tangents-exhausted') expect(r.kind).toBe('external');
    }
    // And the kind-less fifth is refused too (all four taken).
    const r2 = parse('משיק משותף', buildParseCtx(construction, positions));
    expect(!r2.ok && r2.reason === 'tangents-exhausted').toBe(true);
  });
});

describe('#197 Am. 4 — TANGENT circles: capacity follows the mutual position', () => {
  it("the operator's sequence: on «שני מעגלים משיקים מבחוץ», two «משיק משותף» build and the THIRD refuses fast with the at-touch hint", () => {
    // Externally tangent circles have only TWO separate two-touch common tangents — the third common
    // tangent passes THROUGH the touch point (the at-form). Session 2026-07-18 18:52: the third
    // request ground the solver instead.
    const facts = buildFacts(['שני מעגלים משיקים מבחוץ', 'משיק משותף', 'משיק משותף']);
    const fig = replay(facts);
    expect(Object.values(fig.status).every((s) => s === 'ok'), 'two tangents build').toBe(true);
    const t0 = Date.now();
    const r = parse('משיק משותף', buildParseCtx(fig.construction, fig.positions));
    expect(Date.now() - t0).toBeLessThan(500);
    expect(!r.ok && r.reason === 'tangents-exhausted' && r.hint === 'at-touch').toBe(true);
  });

  it('perf lock (#197 Am. 4): the second tangent on tangent circles builds within budget (was 38 s)', () => {
    // The record precedes the ⟂ constraints, so the driven solves start at the analytic basin
    // (residual ≈ 0). Regression guard: a cold fold of the full sequence stays well under a second.
    const t0 = Date.now();
    const fig = replay(buildFacts(['שני מעגלים משיקים מבחוץ', 'משיק משותף', 'משיק משותף']));
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(Date.now() - t0, 'cold fold budget').toBeLessThan(3000);
  });

  it('INTERSECTING circles: the two externals build, an internal or a third refuses', () => {
    const facts = buildFacts(['שני מעגלים נחתכים']);
    const fig = replay(facts);
    const ctx = buildParseCtx(fig.construction, fig.positions);
    const rInt = parse('משיק משותף פנימי', ctx);
    expect(!rInt.ok && rInt.reason === 'tangents-exhausted', 'no internal tangents exist for intersecting circles').toBe(true);
    const facts2 = buildFacts(['שני מעגלים נחתכים', 'משיק משותף', 'משיק משותף']);
    const fig2 = replay(facts2);
    expect(Object.values(fig2.status).every((s) => s === 'ok'), 'the two externals build').toBe(true);
    const r3 = parse('משיק משותף', buildParseCtx(fig2.construction, fig2.positions));
    expect(!r3.ok && r3.reason === 'tangents-exhausted').toBe(true);
  });
});

describe('ADR-360 (#210) — the WORD-relation honesty gate', () => {
  it('a stated זרים not encoded in the commands is reported dropped', () => {
    const bare: AnyCommand[] = [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 5 },
    ];
    expect(droppedWordRelations('שני מעגלים זרים', bare)).toEqual(['זרים']);
    expect(droppedWordRelations('שני מעגלים מוכלים', bare)).toEqual(['מוכל']);
  });
  it('an encoded relation passes; a point-side utterance never trips', () => {
    const ok: AnyCommand[] = [{ type: 'set-circle-position', relation: 'disjoint', a: 'circle-O', b: 'circle-P' }];
    expect(droppedWordRelations('שני מעגלים זרים', ok)).toEqual([]);
    expect(droppedWordRelations('M בתוך המעגל', [])).toEqual([]);
  });
});

describe('ADR-359 (#197) — common tangent KIND + repetition', () => {
  it('«AB משיק משותף חיצוני» on two disjoint circles: external tangent, verifier clean', () => {
    const fig = replay(buildFacts(['שני מעגלים זרים', 'AB משיק משותף חיצוני לשני המעגלים']));
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(fig.violations).toEqual([]);
    const A = fig.positions.get('A')!, B = fig.positions.get('B')!;
    const [c1, c2] = [...fig.circles.values()];
    // Both centres on the SAME side of line AB (external).
    const side = (p: { x: number; y: number }) => (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
    expect(side(c1.center) * side(c2.center)).toBeGreaterThan(0);
    // Genuine tangency: each touch at radius distance.
    expect(d(A, c1.center)).toBeCloseTo(c1.r, 2);
    expect(d(B, c2.center)).toBeCloseTo(c2.r, 2);
  });

  it('«CD משיק משותף פנימי» — internal: centres on OPPOSITE sides', () => {
    const fig = replay(buildFacts(['שני מעגלים זרים', 'CD משיק משותף פנימי לשני המעגלים']));
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(fig.violations).toEqual([]);
    const C = fig.positions.get('C')!, D = fig.positions.get('D')!;
    const [c1, c2] = [...fig.circles.values()];
    const side = (p: { x: number; y: number }) => (D.x - C.x) * (p.y - C.y) - (D.y - C.y) * (p.x - C.x);
    expect(side(c1.center) * side(c2.center)).toBeLessThan(0);
  });

  it('label-less «משיק משותף חיצוני» auto-names the touches and builds (the #184 pattern)', () => {
    const fig = replay(buildFacts(['שני מעגלים זרים', 'משיק משותף חיצוני']));
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(fig.violations).toEqual([]);
    const touches = fig.construction.objects.filter((o) => o.kind === 'on-circle');
    expect(touches.length).toBeGreaterThanOrEqual(2);
  });

  it('«אלכסוני» is the INTERNAL tangent (centres on opposite sides)', () => {
    const facts = buildFacts(['שני מעגלים זרים', 'AB משיק משותף אלכסוני לשני המעגלים']);
    const ct = facts.find((f) => f.cmd.type === 'common-tangent')!.cmd as Extract<AnyCommand, { type: 'common-tangent' }>;
    expect(ct.kind).toBe('internal');
    const fig = replay(facts);
    expect(fig.violations).toEqual([]);
    const A = fig.positions.get('A')!, B = fig.positions.get('B')!;
    const [c1, c2] = [...fig.circles.values()];
    const side = (p: { x: number; y: number }) => (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
    expect(side(c1.center) * side(c2.center)).toBeLessThan(0);
  });

  it('the PLURAL «שני המשיקים המשותפים החיצוניים» builds TWO distinct external tangents at once', () => {
    const fig = replay(buildFacts(['שני מעגלים זרים', 'שני המשיקים המשותפים החיצוניים']));
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(fig.violations).toEqual([]);
    const cts = fig.construction.objects.filter((o) => o.kind === 'on-circle');
    expect(cts.length).toBeGreaterThanOrEqual(4); // four auto-named touches
    const segs = fig.construction.objects.filter((o) => o.kind === 'segment');
    expect(segs.length).toBeGreaterThanOrEqual(2); // two tangent segments
  });

  it('a label-less CUT compound still defers (never a bare tangent dropping the cut)', () => {
    const facts = buildFacts(['שני מעגלים זרים']);
    const { construction, positions } = replay(facts);
    const r = parse('משיק משותף חותך את הקטע בנקודה E', buildParseCtx(construction, positions));
    expect(r.ok).toBe(false);
  });

  it('a REPEATED external tangent takes the OTHER tangent (avoid, parse-level + end-to-end distinct)', () => {
    const steps = ['שני מעגלים זרים', 'AB משיק משותף חיצוני לשני המעגלים', 'CD משיק משותף חיצוני לשני המעגלים'];
    const facts = buildFacts(steps);
    const second = facts.filter((f) => f.utterance === steps[2] && f.cmd.type === 'common-tangent');
    expect(second).toHaveLength(1);
    const ct = second[0].cmd as Extract<AnyCommand, { type: 'common-tangent' }>;
    expect(ct.kind).toBe('external');
    expect(new Set(ct.avoid)).toEqual(new Set(['A', 'B']));
    const fig = replay(facts);
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(fig.violations).toEqual([]);
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => fig.positions.get(id)!);
    expect(d(A, C) + d(B, D), 'the two tangents are distinct').toBeGreaterThan(0.5);
  });
});

describe('ADR-361 (#191) — the four-point secant one-liner', () => {
  for (const u of ['ישר חותך את שני המעגלים בנקודות C, D, E ו-F', 'a line cuts the two circles at points C, D, E and F']) {
    it(`«${u}» — C,D on the first circle, E,F on the second, all four collinear`, () => {
      const fig = replay(buildFacts([u]));
      expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
      const [c1, c2] = [...fig.circles.values()];
      const [C, D, E, F] = ['C', 'D', 'E', 'F'].map((id) => fig.positions.get(id)!);
      expect(d(C, c1.center)).toBeCloseTo(c1.r, 2);
      expect(d(D, c1.center)).toBeCloseTo(c1.r, 2);
      expect(d(E, c2.center)).toBeCloseTo(c2.r, 2);
      expect(d(F, c2.center)).toBeCloseTo(c2.r, 2);
      // Collinear: every point within a hair of line C→F.
      const len = d(C, F);
      for (const P of [D, E]) {
        const cross = Math.abs((F.x - C.x) * (P.y - C.y) - (F.y - C.y) * (P.x - C.x)) / len;
        expect(cross, 'on the secant line').toBeLessThan(0.05);
      }
    });
  }
});

describe('ADR-362 (#192) — the ordinal circle reference', () => {
  it('«נקודה A על המעגל השלישי» binds the THIRD circle by creation order', () => {
    const facts = buildFacts(['מעגל O', 'מעגל P', 'מעגל Q', 'נקודה A על המעגל השלישי']);
    const fig = replay(facts);
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    const third = fig.circles.get('circle-Q')!;
    expect(d(fig.positions.get('A')!, third.center)).toBeCloseTo(third.r, 3);
  });
  it('out-of-range ordinal defers (never guesses)', () => {
    const facts = buildFacts(['מעגל O']);
    const { construction, positions } = replay(facts);
    const r = parse('נקודה A על המעגל השלישי', buildParseCtx(construction, positions));
    if (r.ok) expect(r.commands.some((c) => c.type === 'point-on-circle')).toBe(false);
  });
});
