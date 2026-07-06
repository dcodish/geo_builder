/**
 * ADR-244 — two CONCENTRIC circles (a common centre): the pair macro, the outer/inner qualifier
 * resolution post-pass, membership disambiguation, and the ambiguous-reference clarification.
 *
 * Root cause locked here: circle identity used to BE the centre letter (`circle-<centre>`), so a
 * second circle centred at O was unrepresentable — the En phrasing half-parsed to ONE circle, the He
 * phrasing dead-ended at the LLM, and every qualifier reference silently attached to the one circle.
 */
import { describe, it, expect } from 'vitest';
import { build, evaluate, checkGivens } from '@/engine';
import type { AnyCommand, Command } from '@/engine';
import { parse, type ParseContext } from '../parse';

const cmds = (input: string, ctx?: ParseContext): AnyCommand[] => {
  const r = parse(input, ctx);
  expect(r.ok, `"${input}" should parse: ${JSON.stringify(r)}`).toBe(true);
  return r.ok ? r.commands : [];
};

/** The figure context AFTER the pair exists (as buildParseCtx derives it). */
const pairCtx = (members?: { id: string; center: string; points: string[] }[]): ParseContext => ({
  circles: ['O'],
  points: ['O', ...(members ?? []).flatMap((m) => m.points)],
  circleMembers: members ?? [
    { id: 'circle-O', center: 'O', points: [] },
    { id: 'circle-O-2', center: 'O', points: [] },
  ],
  concentric: [{ center: 'O', outer: 'circle-O', inner: 'circle-O-2' }],
});

describe('the concentric-pair creation macro', () => {
  it.each([
    'נתונים שני מעגלים בעלי מרכז משותף O',
    'שני מעגלים עם מרכז משותף O',
    'two circles with a common center O',
    'two concentric circles centered at O',
  ])('creates the PAIR + the radius-order binding: %s', (u) => {
    const c = cmds(u);
    expect(c).toHaveLength(3);
    expect(c[0]).toMatchObject({ type: 'circle', id: 'circle-O', center: 'O', freeRadius: true, ifAbsent: true });
    expect(c[1]).toMatchObject({ type: 'circle', id: 'circle-O-2', center: 'O', freeRadius: true, ifAbsent: true });
    expect(c[2]).toEqual({ type: 'set-radius-order', outer: 'circle-O', inner: 'circle-O-2' });
    // Both radii are free DOFs seeded APART (ADR-052 — the sizes are the student's to state).
    const [r1, r2] = [c[0], c[1]].map((x) => (x.type === 'circle' ? x.radius : NaN));
    expect(r1).not.toBe(r2);
  });

  it('an UNNAMED common centre is auto-assigned (hidden until used)', () => {
    const c = cmds('שני מעגלים בעלי מרכז משותף');
    expect(c[0]).toMatchObject({ type: 'circle', id: 'circle-O', autoCenter: true });
    expect(c[1]).toMatchObject({ type: 'circle', id: 'circle-O-2', autoCenter: true });
  });

  it('the En phrasing no longer HALF-PARSES to one circle (the ADR-244 honesty bug)', () => {
    // Before the macro, the plain `circle` rule claimed this and dropped "two" — a silently wrong figure.
    const c = cmds('two circles with a common center O');
    expect(c.filter((x) => x.type === 'circle')).toHaveLength(2);
  });

  it('re-stating the pair is idempotent (ifAbsent), never a resize/conflict', () => {
    const c = cmds('שני מעגלים בעלי מרכז משותף O', pairCtx());
    expect(c.filter((x) => x.type === 'circle').every((x) => x.type === 'circle' && x.ifAbsent)).toBe(true);
  });
});

describe('outer/inner qualifier resolution (the post-pass chokepoint — every circle rule at once)', () => {
  it.each([
    ['AD מיתר במעגל החיצוני', 'circle-O'],
    ['BC מיתר במעגל הפנימי', 'circle-O-2'],
    ['מיתר AD במעגל הגדול', 'circle-O'],
    ['מיתר BC במעגל הקטן', 'circle-O-2'],
    ['chord AD in the outer circle', 'circle-O'],
    ['chord BC in the inner circle', 'circle-O-2'],
    ['chord AD in the larger circle', 'circle-O'],
    ['chord BC in the smaller circle', 'circle-O-2'],
  ])('a chord lands on the QUALIFIED circle: %s → %s', (u, target) => {
    const c = cmds(u, pairCtx());
    const on = c.filter((x) => x.type === 'point-on-circle');
    expect(on).toHaveLength(2);
    for (const x of on) expect(x.type === 'point-on-circle' && x.circle).toBe(target);
  });

  it.each([
    ['E נקודה על המעגל החיצוני', 'circle-O'],
    ['E על המעגל הפנימי', 'circle-O-2'],
    ['E is on the outer circle', 'circle-O'],
    ['E is a point on the inner circle', 'circle-O-2'],
  ])('a point-on-circle lands on the QUALIFIED circle: %s → %s', (u, target) => {
    const c = cmds(u, pairCtx());
    expect(c).toContainEqual(expect.objectContaining({ type: 'point-on-circle', id: 'E', circle: target }));
  });

  it('a radius given by WORD resolves per qualifier ("רדיוס המעגל הפנימי הוא 2" → the inner circle)', () => {
    const c = cmds('רדיוס המעגל הפנימי הוא 2', pairCtx());
    expect(c).toContainEqual({ type: 'set-radius', circle: 'circle-O-2', value: 2 });
  });

  it('stated MEMBERSHIP disambiguates an unqualified reference (arc BC with B,C on the inner circle)', () => {
    const ctx = pairCtx([
      { id: 'circle-O', center: 'O', points: ['A', 'D'] },
      { id: 'circle-O-2', center: 'O', points: ['B', 'C'] },
    ]);
    const c = cmds('M אמצע הקשת BC במעגל O', ctx);
    expect(c).toContainEqual(expect.objectContaining({ type: 'arc-midpoint', id: 'M', circle: 'circle-O-2' }));
  });

  it('an UNQUALIFIED, non-disambiguated reference asks for clarification — never a silent pick or an LLM guess', () => {
    for (const u of ['F על המעגל', 'F is on the circle', 'AB משיק למעגל O בנקודה T']) {
      const r = parse(u, pairCtx());
      expect(r.ok, `"${u}" must not silently pick a circle`).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe('ambiguous-circle');
        if (r.reason === 'ambiguous-circle') expect(r.center).toBe('O');
      }
    }
  });

  it('a circle at a DIFFERENT centre is untouched by the pair', () => {
    const c = cmds('מעגל P', pairCtx());
    expect(c).toContainEqual(expect.objectContaining({ type: 'circle', id: 'circle-P' }));
  });
});

describe('the radius-order requirement (engine + verifier)', () => {
  const pair = (rOuter: number, rInner: number): Command[] => [
    { type: 'circle', id: 'circle-O', center: 'O', radius: rOuter },
    { type: 'circle', id: 'circle-O-2', center: 'O', radius: rInner },
    { type: 'set-radius-order', outer: 'circle-O', inner: 'circle-O-2' },
  ];
  const commands5v3 = pair(5, 3);

  it('inner < outer verifies clean; the inner circle carries the innerOf binding', () => {
    const { construction } = build(commands5v3);
    const e = evaluate(construction);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(checkGivens(commands5v3, e.positions, e.circles)).toEqual([]);
    const inner = construction.objects.find((o) => o.id === 'circle-O-2');
    expect(inner && inner.kind === 'circle' && inner.innerOf).toBe('circle-O');
  });

  it('inner ≥ outer is FLAGGED (figure.v.radiusOrder) — meetsRequirements then skips such configs', () => {
    const commands = pair(3, 5);
    const { construction } = build(commands);
    const e = evaluate(construction);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const v = checkGivens(commands, e.positions, e.circles);
    expect(v.some((x) => x.relation === 'radius-order' && x.messageKey === 'figure.v.radiusOrder')).toBe(true);
  });
});
