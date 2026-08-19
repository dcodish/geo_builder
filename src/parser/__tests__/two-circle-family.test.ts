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
  it("the operator's sequence: on «שני מעגלים משיקים מבחוץ», the THIRD «משיק משותף» BUILDS the touch tangent; a FOURTH refuses", () => {
    // Externally tangent circles have two separate two-touch tangents + ONE through the touch point.
    // The third kind-less request builds that remaining tangent directly (operator: "when there is an
    // ability to do the 3rd one, it told me it cannot"); only a fourth is a genuine refusal.
    const facts = buildFacts(['שני מעגלים משיקים מבחוץ', 'משיק משותף', 'משיק משותף', 'משיק משותף']);
    const fig = replay(facts);
    expect(Object.values(fig.status).every((s) => s === 'ok'), 'all three tangents build').toBe(true);
    // The third is the tangent LINE at the true touch point (on both circles).
    const tangents = fig.construction.objects.filter((o) => o.kind === 'line' && o.id.startsWith('tan-'));
    expect(tangents.length).toBeGreaterThanOrEqual(1);
    const touchId = tangents[0].id.slice(4);
    const touch = fig.positions.get(touchId)!;
    for (const c of fig.circles.values()) expect(d(touch, c.center), 'the touch on the circle').toBeCloseTo(c.r, 2);
    // The FOURTH refuses fast — nothing remains (the touch tangent is taken, no hint).
    const t0 = Date.now();
    const r = parse('משיק משותף', buildParseCtx(fig.construction, fig.positions));
    expect(Date.now() - t0).toBeLessThan(500);
    expect(!r.ok && r.reason === 'tangents-exhausted').toBe(true);
    if (!r.ok && r.reason === 'tangents-exhausted') expect(r.hint).toBeUndefined();
  });

  it('perf lock (#197 Am. 4): the second tangent on tangent circles builds within budget (was 38 s)', () => {
    // The record precedes the ⟂ constraints, so the driven solves start at the analytic basin
    // (residual ≈ 0). Regression guard: a cold fold of the full sequence stays well under a second.
    const t0 = Date.now();
    const fig = replay(buildFacts(['שני מעגלים משיקים מבחוץ', 'משיק משותף', 'משיק משותף']));
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(Date.now() - t0, 'cold fold budget').toBeLessThan(3000);
  });

  it("«משיק משותף בנקודת ההשקה» — the touch referenced by ROLE resolves to the circles' common point (the operator's follow-up)", () => {
    // Session 2026-07-18 19:15: following the at-touch hint, the operator typed the ROLE form — and it
    // silently built a SECOND external tangent (wrong figure, all green). Now it takes the at-variant.
    const facts = buildFacts(['שני מעגלים משיקים מבחוץ', 'משיק משותף', 'משיק משותף בנקודת ההשקה']);
    const roleCmds = facts.filter((f) => f.utterance === 'משיק משותף בנקודת ההשקה').map((f) => f.cmd);
    expect(roleCmds.some((c) => c.type === 'tangent'), 'the drawn tangent AT the touch').toBe(true);
    expect(roleCmds.some((c) => c.type === 'common-tangent'), 'NOT a two-touch pair').toBe(false);
    const fig = replay(facts);
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    // The tangent line anchors at the actual touch point — the common member of both circles.
    const tangent = roleCmds.find((c): c is Extract<AnyCommand, { type: 'tangent' }> => c.type === 'tangent')!;
    const touch = fig.positions.get(tangent.at)!;
    for (const c of fig.circles.values()) expect(d(touch, c.center), 'the touch on the circle').toBeCloseTo(c.r, 2);
    // And a further two-touch tangent still builds (the second external — capacity 2, one taken).
    const more = parse('משיק משותף', buildParseCtx(fig.construction, fig.positions));
    expect(more.ok, 'the second external is still available').toBe(true);
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

describe('#197 Am. 6 — naming the tangents’ MEET', () => {
  const collinear = (P: { x: number; y: number }, Q: { x: number; y: number }, R: { x: number; y: number }) =>
    Math.abs((Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x)) / Math.max(1e-9, d(P, Q));

  it('the definite «המשיקים נפגשים בנקודה K» resolves THE two drawn tangents and names their crossing', () => {
    const facts = buildFacts(['שני מעגלים זרים', 'משיק משותף חיצוני', 'משיק משותף חיצוני', 'המשיקים נפגשים בנקודה K']);
    const fig = replay(facts);
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    const K = fig.positions.get('K')!;
    expect(K, 'K exists').toBeTruthy();
    // K is collinear with each tangent's touch pair (the crossing of the two tangent LINES).
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => fig.positions.get(id)!);
    expect(collinear(A, B, K), 'K on line AB').toBeLessThan(0.05);
    expect(collinear(C, D, K), 'K on line CD').toBeLessThan(0.05);
  });

  it('the labeled form «AB ו-CD נפגשים בנקודה K» on recognised tangents drops the within-segment requirement', () => {
    const facts = buildFacts([
      'שני מעגלים זרים',
      'AB משיק משותף חיצוני לשני המעגלים',
      'CD משיק משותף חיצוני לשני המעגלים',
      'AB ו-CD נפגשים בנקודה K',
    ]);
    const fig = replay(facts);
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(fig.violations).toEqual([]); // no within-segment amber — tangents meet BEYOND their touches
    const K = fig.positions.get('K')!;
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => fig.positions.get(id)!);
    expect(collinear(A, B, K)).toBeLessThan(0.05);
    expect(collinear(C, D, K)).toBeLessThan(0.05);
  });
});

describe('#197 Am. 7 — the naming DOT at a drawn-line × segment crossing', () => {
  it("the touch tangent's visible crossings with the two-touch tangents offer pick dots (the operator's red marks)", async () => {
    const { buildScene } = await import('@/render/scene');
    const { findInkCrossings } = await import('@/engine');
    // The operator's exact figure: tangent circles, both two-touch tangents, then the touch tangent.
    const facts = buildFacts(['שני מעגלים משיקים מבחוץ', 'משיק משותף', 'משיק משותף', 'משיק משותף']);
    const fig = replay(facts);
    const scene = buildScene(fig.construction, fig.positions, undefined, undefined, { circles: fig.circles });
    expect(scene.lines.length, 'the touch tangent is a drawn line').toBeGreaterThanOrEqual(1);
    const crossings = findInkCrossings(fig.construction, fig.positions, { lines: scene.lines });
    const lineDots = crossings.filter((x) => x.line1);
    // The vertical touch tangent crosses BOTH tangent segments strictly inside them — two dots.
    expect(lineDots.length, 'both visible crossings offer dots').toBeGreaterThanOrEqual(2);
  });
});

describe('#197 Am. 8 — position-accurate refusals (not everything is "4 tangents")', () => {
  const exhausted = (r: ReturnType<typeof parse>) => (!r.ok && r.reason === 'tangents-exhausted' ? r : null);

  it('CONTAINED circles: any tangent request refuses with position=contained (0 exist)', () => {
    const facts = buildFacts(['מעגל P מוכל בתוך מעגל O']);
    const fig = replay(facts);
    const r = exhausted(parse('משיק משותף', buildParseCtx(fig.construction, fig.positions)));
    expect(r?.position).toBe('contained');
  });

  it('INTERNALLY tangent circles: the first request BUILDS the single tangent; the second refuses with position=int-tangent (1 exists)', () => {
    const facts = buildFacts(['שני מעגלים משיקים מבפנים', 'משיק משותף']);
    const fig = replay(facts);
    expect(Object.values(fig.status).every((s) => s === 'ok'), 'the single touch tangent builds').toBe(true);
    expect(fig.construction.objects.some((o) => o.kind === 'line' && o.id.startsWith('tan-'))).toBe(true);
    const r = exhausted(parse('משיק משותף', buildParseCtx(fig.construction, fig.positions)));
    expect(r?.position).toBe('int-tangent');
  });

  it('INTERSECTING circles: position lands on the refusal (2 exist)', () => {
    const facts = buildFacts(['שני מעגלים נחתכים']);
    const fig = replay(facts);
    const r = exhausted(parse('משיק משותף פנימי', buildParseCtx(fig.construction, fig.positions)));
    expect(r?.position).toBe('intersecting');
    expect(r?.kind).toBe('internal');
  });

  it('EXTERNALLY tangent circles: the post-touch refusal carries position=ext-tangent (3 exist)', () => {
    const facts = buildFacts(['שני מעגלים משיקים מבחוץ', 'משיק משותף', 'משיק משותף', 'משיק משותף']);
    const fig = replay(facts);
    const r = exhausted(parse('משיק משותף', buildParseCtx(fig.construction, fig.positions)));
    expect(r?.position).toBe('ext-tangent');
  });
});

describe('#212 — a KIND adjective without «משותף» is a common-tangent request', () => {
  for (const [u, want] of [
    ['AB משיק פנימי', 'internal'],
    ['משיק אלכסוני', 'internal'],
    ['משיק חיצוני', 'external'],
    ['CD משיק מבחוץ', 'external'],
  ] as const) {
    it(`«${u}» on two disjoint circles builds the ${want} common tangent — never the LLM`, () => {
      const facts = buildFacts(['שני מעגלים זרים', u]);
      const ct = facts.find((f) => f.cmd.type === 'common-tangent')!.cmd as Extract<AnyCommand, { type: 'common-tangent' }>;
      expect(ct.kind).toBe(want);
      const fig = replay(facts);
      expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
      expect(fig.violations).toEqual([]);
      // The stated disjointness SURVIVES (the prod bug repositioned the circles into tangency).
      const [c1, c2] = [...fig.circles.values()];
      expect(d(c1.center, c2.center), 'the circles stay disjoint').toBeGreaterThan(c1.r + c2.r);
    });
  }

  it('the plural participle «שני מעגלים משיקים מבחוץ» is still the CIRCLES-tangent state (no theft)', () => {
    const r = parse('שני מעגלים משיקים מבחוץ', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'circles-tangent')).toBe(true);
    expect(r.commands.some((c) => c.type === 'common-tangent')).toBe(false);
  });

  it('the gate reports a kind-tangent request the lowering dropped', () => {
    const bare: AnyCommand[] = [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 5 },
    ];
    expect(droppedWordRelations('AB משיק פנימי במעגלים', bare)).toContain('משיק');
    const ok: AnyCommand[] = [{ type: 'common-tangent', a: 'A', b: 'B', circle1: 'circle-O', circle2: 'circle-P', kind: 'internal' }];
    expect(droppedWordRelations('AB משיק פנימי במעגלים', ok)).toEqual([]);
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

/**
 * #757 (P1) — the ADR-024 LEFTOVER GUARD on `circlesTangent`.
 *
 * The rule reads a tangency KIND and a circle PAIR. Everything else it discarded in SILENCE, so
 * «שני מעגלים משיקים מבחוץ ברדיוסים שווים» committed two circles with a green ✓ and the student's
 * equal-radii relation gone (r = 5 and 3.6 on the canvas). No honesty gate saw it: the `dropped*`
 * family enumerates categories, and a magnitude equality between two implied objects is a category
 * none of them has — the docs/23 G1 shape verbatim.
 *
 * The class fix is all-or-nothing: strip exactly what the rule consumes, decline whole if anything
 * geometry-significant remains. So this locks the CLASS (any unread modifier), not the instance —
 * plus the working forms, because a leftover guard's real risk is false-blocking (#138/#140).
 */
describe('#757 — a two-circle tangency declines rather than swallowing a modifier it cannot read', () => {
  const refuses = (u: string) => expect(parse(u).ok, `must NOT commit: ${u}`).toBe(false);
  const builds = (u: string) => {
    const r = parse(u);
    expect(r.ok, `must still build: ${u}`).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'circles-tangent'), u).toBe(true);
  };

  it('the reported utterance, and its whole spelling matrix', () => {
    // {external, internal} × {ב-, עם} × {he, en} — the class, not the one sentence the operator typed.
    refuses('שני מעגלים משיקים מבחוץ ברדיוסים שווים');
    refuses('שני מעגלים משיקים מבחוץ עם רדיוסים שווים');
    refuses('שני מעגלים משיקים מבפנים ברדיוסים שווים');
    refuses('שני מעגלים משיקים מבפנים עם רדיוסים שווים');
    refuses('two circles tangent externally with equal radii');
    refuses('two circles tangent internally with equal radii');
  });

  it('the class beyond equal radii — unread modifiers nobody reported also decline', () => {
    // The docs/17 test of a real class fix: it closes siblings that were never filed.
    refuses('שני מעגלים משיקים מבחוץ שרדיוסו של האחד 5');
    refuses('שני מעגלים משיקים מבחוץ שקוטרם שווה');
    refuses('שני מעגלים משיקים מבחוץ והזווית ABC');
    // Scope boundary, stated rather than assumed: a modifier that another rule CLAIMS
    // («…ואלכסון AB» → a lone `segment`; «…with a chord AB» → the chord rule) never reaches this
    // guard, and those rules drop the tangency in their own right. That is a different rule's
    // contract and a separate class — filed, not silently folded in here.
  });

  it('RESIDUAL, recorded rather than hidden: an AREA modifier still commits', () => {
    // `SHAPE_LEFTOVER` is a denylist and has no area/perimeter token, so «ששטחם שווה» survives it —
    // the same class as the reported bug, still open. Widening that denylist touches all 13 of its
    // consumers, so it is scoped separately rather than smuggled into a P1 fix. This test asserts the
    // CURRENT state deliberately: when the denylist grows, it fails and points at the follow-up.
    expect(parse('שני מעגלים משיקים מבחוץ ששטחם שווה').ok).toBe(true);
  });

  it('every form the rule DOES read still builds — the false-block risk a leftover guard carries', () => {
    builds('שני מעגלים משיקים');
    builds('שני מעגלים משיקים מבחוץ');
    builds('שני מעגלים משיקים מבפנים');
    builds('שני מעגלים משיקים מבחוץ בנקודה T');
    builds('המעגלים משיקים זה לזה');
    builds('מעגל O ומעגל P משיקים מבחוץ בנקודה M');
    builds('circle O and circle P are tangent internally at M');
    builds('two circles are tangent externally');
  });

  it('the refusal is HONEST — nothing is committed, so nothing contradicts the given', () => {
    // The P1 was not "it refused"; it was that it BUILT while dropping the relation. The contract is
    // that the statement never commits a figure asserting the opposite of what the student said.
    const r = parse('שני מעגלים משיקים מבחוץ ברדיוסים שווים');
    expect(r.ok).toBe(false);
  });
});
