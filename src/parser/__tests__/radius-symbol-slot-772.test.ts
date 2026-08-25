/**
 * #772 — the radius statement's VALUE SLOT accepts a SYMBOL wherever it accepts a NUMBER.
 *
 * The shipped defect: `setRadius` (numeric) never needed a copula — it just looks for a number
 * anywhere in the utterance — while `radiusSymbolStatement` (symbolic) required «הוא»/«היא»/«=»/"is".
 * So «רדיוס המעגל 5» built and «רדיוס המעגל R» went not-handled, alone among its neighbours:
 *
 *     רדיוס המעגל 5        → set-radius      ✓
 *     רדיוס המעגל הוא R    → radius-symbol   ✓
 *     רדיוס המעגל = R      → radius-symbol   ✓
 *     רדיוס המעגל R        → not-handled     ✗   ← the hole
 *
 * In prod (session ah1kqxz5) that cost a student a turn on an otherwise fully deterministic bagrut
 * circle problem: they had to RE-DECLARE the whole circle («מעגל שרדיוסו R ומרכזו O») to attach its
 * radius — the incremental-building premise failing at its most ordinary step, on the R-parameterised
 * circle that is the bagrut norm. See ADR-459.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function build(steps: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  const results: { u: string; ok: boolean; commands: AnyCommand[] }[] = [];
  for (const u of steps) {
    const fig = replay(facts);
    const r = parse(u, buildParseCtx(fig.construction, fig.positions));
    results.push({ u, ok: r.ok, commands: r.ok ? (r.commands as AnyCommand[]) : [] });
    if (r.ok) for (const cmd of r.commands) facts.push({ id: `f${g++}`, utterance: u, cmd: cmd as AnyCommand, enabled: true });
  }
  return { results, fig: replay(facts) };
}

const on = (prefix: string[], u: string) => build([...prefix, u]).results.at(-1)!;
const CIRCLE = ['מעגל שמרכזו O'];

describe('#772 — the copula-less symbolic radius', () => {
  it('«רדיוס המעגל R» binds the symbol to the EXISTING circle (the reported hole)', () => {
    const r = on(CIRCLE, 'רדיוס המעגל R');
    expect(r.ok).toBe(true);
    expect(r.commands).toEqual([{ type: 'radius-symbol', circle: 'circle-O', name: 'R' }]);
  });

  it.each([
    ['רדיוס המעגל הוא R'],
    ['רדיוס המעגל = R'],
    ['רדיוס = R'],
    ['רדיוס מעגל O הוא R'],
    ['רדיוס המעגל R'],
    ['הרדיוס R'],
    ['הרדיוס הוא R'],
    ['radius of the circle R'],
    ['the radius of circle O is R'],
  ])('the whole slot is one behaviour, copula or not: «%s»', (u) => {
    const r = on(CIRCLE, u);
    expect(r.ok, `«${u}» must build`).toBe(true);
    expect(r.commands).toEqual([{ type: 'radius-symbol', circle: 'circle-O', name: 'R' }]);
  });

  it('the NUMBER and the SYMBOL take the same slot — with a copula and without', () => {
    for (const u of ['רדיוס המעגל 5', 'רדיוס המעגל הוא 5']) {
      expect(on(CIRCLE, u).commands).toEqual([{ type: 'set-radius', circle: 'circle-O', value: 5 }]);
    }
    for (const u of ['רדיוס המעגל R', 'רדיוס המעגל הוא R']) {
      expect(on(CIRCLE, u).commands).toEqual([{ type: 'radius-symbol', circle: 'circle-O', name: 'R' }]);
    }
  });

  it('the bagrut lowercase radius letter is a symbol too («רדיוס המעגל r»)', () => {
    expect(on(CIRCLE, 'רדיוס המעגל r').commands).toEqual([{ type: 'radius-symbol', circle: 'circle-O', name: 'r' }]);
  });
});

describe('#772 — what the copula used to separate, now stated explicitly', () => {
  it('a NOUN-FIRST description is still a circle CREATION, in every context', () => {
    // The copula-less slot must not steal the catalog's own creation form the moment its circle
    // exists — the shadow-matrix hard gate caught exactly that during this fix.
    for (const ctx of [CIRCLE, []]) {
      for (const u of ['circle O with radius R', 'מעגל O שרדיוסו R']) {
        const cmds = on(ctx, u).commands;
        expect(cmds.map((c) => c.type), `«${u}» creates the circle`).toEqual(['circle', 'radius-symbol']);
      }
    }
  });

  it('a BARE circle noun is awaiting its NAME, not a value — «רדיוס מעגל P» states no magnitude', () => {
    for (const u of ['רדיוס מעגל P', 'radius of circle P', 'רדיוס מעגל O']) {
      expect(on(CIRCLE, u).ok, `«${u}» must not claim a value`).toBe(false);
    }
  });

  it('the letter must not BE the circle — «רדיוס המעגל O» never names a radius after its own centre', () => {
    expect(on(CIRCLE, 'רדיוס המעגל O').ok).toBe(false);
  });

  it('a glued label run is not a symbol — «רדיוס OB» stays the drawn-radius segment', () => {
    const cmds = on(CIRCLE, 'רדיוס OB').commands;
    expect(cmds.map((c) => c.type)).toEqual(['point-on-circle', 'segment']);
    expect(cmds.some((c) => c.type === 'radius-symbol')).toBe(false);
  });

  it('a two-letter tail is not a symbol either — «רדיוס המעגל AB» states no radius', () => {
    expect(on(CIRCLE, 'רדיוס המעגל AB').ok).toBe(false);
  });
});

describe('#772 — the prod sequence (session ah1kqxz5), end to end', () => {
  it('the circle keeps its identity and R stays the parametric radius for a later measure', () => {
    const { results, fig } = build(['מעגל שמרכזו O', 'רדיוס המעגל R', 'A ו D על המעגל', 'AD = 18R/7']);
    for (const r of results) expect(r.ok, `«${r.u}» must build`).toBe(true);

    // ONE circle — the student never had to re-declare it (the workaround the prod row records)
    const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
    expect(circles.length, 'no second circle was minted').toBe(1);
    expect((circles[0] as { radiusSymbol?: string }).radiusSymbol, 'R is bound to THAT circle').toBe('R');

    // and R resolves as the parametric radius in a later relation, not as a point label
    const measure = results.at(-1)!.commands[0] as { type: string; expr?: { var?: string; coef?: number } };
    expect(measure.type).toBe('measure-length');
    expect(measure.expr?.var).toBe('R');
    expect(measure.expr?.coef).toBeCloseTo(18 / 7, 9);
  });
});
