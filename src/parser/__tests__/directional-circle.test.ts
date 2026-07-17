/**
 * #188 / ADR-349 — directional circle qualifiers: «המעגל הימני/השמאלי» / "the right/left circle".
 *
 * With two unnamed circles on canvas the student's natural handles are position, size (ADR-244/342),
 * and naming (#112). Position was missing — the prod utterance «מיתר DF במעגל הימני» (session
 * hqxbjh0x) burned a paid LLM call for a resolvable reference. The resolver is a POINTING gesture:
 * picked by the circles' drawn centre x-positions at utterance time, wired at the `resolveCenter` /
 * `resolveMentionedCircle` chokepoints (every circle-consuming rule gains it at once) and into
 * `parseNameCenter` («מרכז המעגל הימני הוא O1»). Deliberately NOT a standing left/right constraint —
 * a membership/naming that lands on the picked circle is what persists.
 */
import { describe, it, expect } from 'vitest';
import { parse, parseNameCenter, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const build = (steps: string[]): Fact[] => {
  let facts: Fact[] = [];
  let g = 0;
  for (const u of steps) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`step did not parse: ${u}`);
    const group = `g${g++}`;
    facts = [...facts, ...r.commands.map((cmd, i) => ({ id: `${group}.${i}`, utterance: u, group, cmd, enabled: true }))];
  }
  return facts;
};
const ctxOf = (facts: Fact[]) => {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
};
/** The centre TOKENS ordered by drawn x — [leftmost, rightmost]. */
const byX = (facts: Fact[]): [string, string] => {
  const ctx = ctxOf(facts);
  const xs = [...(ctx.circleXs ?? [])].sort((a, b) => a.x - b.x);
  if (xs.length < 2) throw new Error('need two circles');
  return [xs[0].center, xs[xs.length - 1].center];
};

describe('#188 — «במעגל הימני» resolves by drawn position at the chokepoint', () => {
  it('the prod chord utterance parses deterministically onto the RIGHT circle (no LLM)', () => {
    const facts = build(['שני מעגלים נחתכים']);
    const [, right] = byX(facts);
    const r = parse('מיתר DF במעגל הימני', ctxOf(facts));
    expect(r.ok, 'parses deterministically').toBe(true);
    if (r.ok) {
      const memberships = r.commands.filter((c): c is Extract<AnyCommand, { type: 'point-on-circle' }> => c.type === 'point-on-circle');
      expect(memberships.map((m) => m.id).sort()).toEqual(['D', 'F']);
      for (const m of memberships) expect(m.circle, 'membership on the RIGHT circle').toBe(`circle-${right}`);
    }
  });

  it('«המעגל השמאלי» picks the LEFT circle; the En mirrors work', () => {
    const facts = build(['שני מעגלים נחתכים']);
    const [left, right] = byX(facts);
    for (const [u, tok] of [
      ['נקודה K על המעגל השמאלי', left],
      ['point K on the left circle', left],
      ['point K on the right circle', right],
    ] as const) {
      const r = parse(u, ctxOf(facts));
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        const m = r.commands.find((c): c is Extract<AnyCommand, { type: 'point-on-circle' }> => c.type === 'point-on-circle');
        expect(m?.circle, u).toBe(`circle-${tok}`);
      }
    }
  });

  it('with ONE circle the directional word defers to the ordinary single-circle resolution', () => {
    const facts = build(['מעגל']);
    const r = parse('נקודה K על המעגל הימני', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const m = r.commands.find((c): c is Extract<AnyCommand, { type: 'point-on-circle' }> => c.type === 'point-on-circle');
      expect(m?.circle).toBeDefined(); // the sole circle — no misreading, no refusal
    }
  });

  it('«מרכז המעגל הימני הוא O1» names the right circle (parseNameCenter, the store-op seam)', () => {
    const facts = build(['שני מעגלים נחתכים']);
    const [left, right] = byX(facts);
    const nc = parseNameCenter('מרכז המעגל הימני הוא O1', ctxOf(facts));
    expect(nc).toEqual({ from: right, to: 'O1' });
    const ncL = parseNameCenter('the centre of the left circle is Q', ctxOf(facts));
    expect(ncL).toEqual({ from: left, to: 'Q' });
  });

  it('no-theft: «נקודה ימנית» (a right-hand POINT) is not read as a circle qualifier', () => {
    const facts = build(['שני מעגלים נחתכים']);
    const r = parse('נקודה ימנית K על המעגל', ctxOf(facts));
    // two circles + no qualifier adjacent to the circle noun → the definite "המעגל" stays ambiguous
    // (defer/escalate), it must NOT silently pick a side.
    if (r.ok) {
      const m = r.commands.find((c) => c.type === 'point-on-circle');
      expect(m, 'must not silently resolve a circle').toBeUndefined();
    }
  });
});
