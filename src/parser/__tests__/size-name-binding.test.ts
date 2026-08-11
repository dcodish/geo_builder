/**
 * Issue #538 (ADR-439) — a SIZE statement on a circle named by a FRESH name is a REFERENCE, and it
 * reaches the #186 naming-by-use binding like every other circle reference.
 *
 * The class: the size lane (`circleSizeExisting`, `setRadius`, `radiusSymbolStatement`) bowed out when
 * the named circle didn't exist, deferring to the `circle` CREATION rule — which minted a PHANTOM
 * circle beside the drawn unnamed pair and attached the student's stated size to it with a green ✓
 * («שני מעגלים משיקים מבחוץ» → «היקף מעגל O1 הוא 6π» built FOUR circles; operator session s0cr31).
 * The #186 ruling has no size exception: an auto-centred circle's internal name is hidden (FR-RN-8),
 * so a fresh name aimed at a drawn circle is naming-by-use. The fix routes the size lane's fresh-name
 * form through `set-radius` + `withImplicitCircles` (marked `implied`) so `impliedCircleBinding`
 * decides — with a new INTERCHANGEABILITY rung: two unnamed circles NOTHING distinguishes (fresh pair
 * macro — free radii, no members, no order, a symmetric relation) bind deterministically instead of
 * asking a question with no informative answer (the ADR-244 creation-binding gauge argument).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx, impliedCircleBinding } from '@/parser';
import { replay, nameCentreFacts, trialFacts } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

/** Build through the real parse → bind → replay loop (App.submit's shape). */
function build(lines: string[]): { facts: Fact[]; fig: ReturnType<typeof replay>; clarified: string | null } {
  let facts: Fact[] = [];
  let fig = replay([], 0);
  let clarified: string | null = null;
  for (const u of lines) {
    let pctx = buildParseCtx(fig.construction, fig.positions);
    let r = parse(u, pctx);
    expect(r.ok, `parses: ${u}`).toBe(true);
    if (!r.ok) continue;
    for (let guard = 0; r.ok && guard < 3; guard++) {
      const bind = impliedCircleBinding(r.commands, pctx);
      if (!bind) break;
      if ('clarify' in bind) {
        clarified = bind.center;
        break;
      }
      const nc = nameCentreFacts(facts, bind.from, bind.to);
      if (!nc.ok) break;
      facts = nc.facts;
      fig = replay(facts, 0);
      pctx = buildParseCtx(fig.construction, fig.positions);
      r = parse(u, pctx);
    }
    if (clarified) break;
    if (!r.ok) continue;
    facts = trialFacts(facts, r.commands);
    fig = replay(facts, 0);
  }
  return { facts, fig, clarified };
}

const circlesOf = (fig: ReturnType<typeof replay>) =>
  fig.construction.objects.filter((o): o is Extract<typeof o, { kind: 'circle' }> => o.kind === 'circle' && !o.id.startsWith('tanaux-'));

describe('#538 — a size statement binds the drawn unnamed circle instead of minting a phantom', () => {
  it.each([
    ['He circumference + area', ['שני מעגלים משיקים מבחוץ', 'היקף מעגל O1 הוא 6π', 'שטח מעגל O2 הוא 81π']],
    ['En circumference + area', ['two circles tangent externally', 'the circumference of circle O1 is 6π', 'the area of circle O2 is 81π']],
  ])('%s: the pair is NAMED and SIZED — exactly two circles, r=3 and r=9', (_t, lines) => {
    const { fig, clarified } = build(lines as string[]);
    expect(clarified, 'interchangeable fresh pair — never a clarify with no informative answer').toBeNull();
    const cs = circlesOf(fig);
    expect(cs.map((c) => c.id).sort(), 'the DRAWN pair took the names — no phantom').toEqual(['circle-O1', 'circle-O2']);
    const r = (id: string) => {
      const c = cs.find((x) => x.id === id)!;
      return 'value' in c.radius ? c.radius.value : NaN;
    };
    expect(r('circle-O1')).toBe(3);
    expect(r('circle-O2')).toBe(9);
    for (const [id, st] of Object.entries(fig.status)) expect(st, id).toBe('ok');
  });

  it('the numeric-radius sibling: «רדיוס מעגל O1 הוא 3» binds the same way', () => {
    const { fig, clarified } = build(['שני מעגלים משיקים מבחוץ', 'רדיוס מעגל O1 הוא 3']);
    expect(clarified).toBeNull();
    expect(circlesOf(fig).map((c) => c.id).sort()).toEqual(['circle-O1', 'circle-P']);
    const c = circlesOf(fig).find((x) => x.id === 'circle-O1')!;
    expect('value' in c.radius && c.radius.value).toBe(3);
  });

  it('empty canvas: «היקף מעגל O1 הוא 6π» still CREATES circle-O1 with r=3 (no autos — the implied creation stands)', () => {
    const { fig } = build(['היקף מעגל O1 הוא 6π']);
    const cs = circlesOf(fig);
    expect(cs.map((c) => c.id)).toEqual(['circle-O1']);
    expect('value' in cs[0].radius && cs[0].radius.value).toBe(3);
  });

  it('a NAMED existing circle beside the fresh name: no autos ⇒ a genuine second circle is created (apart), never a rebind', () => {
    const { fig, clarified } = build(['מעגל O רדיוס 4', 'היקף מעגל P הוא 6π']);
    expect(clarified).toBeNull();
    const cs = circlesOf(fig);
    expect(cs.map((c) => c.id).sort()).toEqual(['circle-O', 'circle-P']);
    const p = cs.find((c) => c.id === 'circle-P')!;
    expect('value' in p.radius && p.radius.value).toBe(3);
  });

  it('NOT interchangeable — internal tangency is asymmetric: the fresh name asks instead of guessing', () => {
    const { clarified } = build(['שני מעגלים משיקים מבפנים', 'היקף מעגל O1 הוא 6π']);
    expect(clarified, 'the honest clarify — which circle is O1 is a real question here').toBe('O1');
  });

  it('NOT interchangeable — a member point distinguishes the pair: «A על המעגל» then sizing by a fresh name asks', () => {
    // A rides ONE of the pair (the sole-circle-reference resolution picks one) — the circles are no
    // longer identical under swap, so a fresh name must not silently pick.
    const { clarified } = build(['שני מעגלים נחתכים', 'A על המעגל הגדול', 'היקף מעגל O1 הוא 6π']);
    expect(clarified).toBe('O1');
  });
});
