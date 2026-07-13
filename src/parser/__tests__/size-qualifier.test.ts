/**
 * Issue #102 — «המעגל הגדול/הקטן» between two INDEPENDENT circles (operator ruling 2026-07-13:
 * "when we say המעגל הגדול או הקטן we should translate it to a R>r like constraint").
 *
 * The size qualifier both REFERS and ASSERTS: `resolveSizeQualifier` (a ctx-aware rewrite at the one
 * parse boundary — the ADR-119/244 chokepoint) resolves each definite qualifier to the concrete
 * circle, using the RECORDED roles (`set-radius-order` → `Circle.orderedBelow` → ctx.radiusOrder)
 * when they exist; an unrecorded FIRST use ASSIGNS the roles from the currently-drawn sizes (M4 soft
 * default — what the student sees) and appends the locking `set-radius-order`, so sampling can never
 * swap which circle is the big one. The INDEFINITE creation adjective («מעגל גדול שרדיוסו R») is a
 * creation whose adjective shapes the SEED only (small draws smaller, sizes stay free DOFs);
 * concentric pairs keep their ADR-244 path.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function runLines(lines: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `expected to parse: ${line} (got ${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}
/** Two independent circles with a size split: O the small (seeded 0.72×), P the big. */
const TWO = ['מעגל קטן שמרכזו בנקודה O ורדיוסו r', 'מעגל גדול שרדיוסו R'];

describe('issue #102 — size-qualified circle references', () => {
  it('the FIRST use resolves by the drawn sizes AND appends the locking set-radius-order', () => {
    const facts = runLines(TWO);
    const r = parse('הנקודה O נמצאת על המעגל הגדול', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([
      { type: 'point-on-circle', id: 'O', circle: 'circle-P' }, // the big = P (seeded 5 vs O's 3.6)
      { type: 'set-radius-order', outer: 'circle-P', inner: 'circle-O' }, // the R>r-like assert (operator ruling)
    ]);
  });

  it('a SECOND use resolves from the recorded roles with NO duplicate assert', () => {
    const facts = runLines([...TWO, 'הנקודה O נמצאת על המעגל הגדול']);
    const r = parse('B על המעגל הקטן', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([{ type: 'point-on-circle', id: 'B', circle: 'circle-O' }]);
  });

  it('recorded roles WIN over the drawn sizes (the record is the truth once assigned)', () => {
    // record the OPPOSITE of the seed sizes: R bound to the SMALL-seeded circle O, then "R > r"
    const facts = runLines(['מעגל קטן שמרכזו בנקודה O ורדיוסו R', 'מעגל גדול שמרכזו בנקודה P ורדיוסו r', 'R > r']);
    const r = parse('B על המעגל הגדול', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // the big is circle-O (the recorded outer), NOT the bigger-drawn circle-P
    expect(r.commands).toEqual([{ type: 'point-on-circle', id: 'B', circle: 'circle-O' }]);
  });

  it('BOTH qualifiers in one utterance resolve ("A היא אחת מנקודות החיתוך של המעגל הגדול והמעגל הקטן")', () => {
    const facts = runLines(TWO);
    const r = parse('A היא אחת מנקודות החיתוך של המעגל הגדול והמעגל הקטן', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cci = r.commands.find((c) => c.type === 'circle-circle-intersection') as Extract<AnyCommand, { type: 'circle-circle-intersection' }>;
    expect(cci).toBeDefined();
    expect([cci.circle1, cci.circle2].sort()).toEqual(['circle-O', 'circle-P']);
    expect(r.commands.filter((c) => c.type === 'set-radius-order')).toHaveLength(1); // one assert, not two
  });

  it('En mirror: "the big circle" / "the small circle"', () => {
    const facts = runLines(['small circle centered at O with radius r', 'big circle with radius R']);
    const r = parse('point O is on the big circle', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands[0]).toMatchObject({ type: 'point-on-circle', id: 'O', circle: 'circle-P' });
    expect(r.commands[1]).toMatchObject({ type: 'set-radius-order', outer: 'circle-P', inner: 'circle-O' });
  });

  it('the INDEFINITE creation adjective is a creation, not a reference — and shapes the seed', () => {
    // «מעגל גדול שרדיוסו R» with two circles already present must NOT rewrite to a reference
    const facts = runLines(TWO);
    const small = facts.find((f) => f.cmd.type === 'circle' && (f.cmd as { id?: string }).id === 'circle-O')!.cmd as Extract<AnyCommand, { type: 'circle' }>;
    const big = facts.find((f) => f.cmd.type === 'circle' && (f.cmd as { id?: string }).id === 'circle-P')!.cmd as Extract<AnyCommand, { type: 'circle' }>;
    expect(small.radius).toBeLessThan(big.radius); // קטן seeds smaller (a STARTING value; both stay free DOFs)
    expect(small.freeRadius).toBe(true);
    expect(big.freeRadius).toBe(true);
  });

  it('defers gracefully off the two-circle case: one circle / three circles keep existing behavior', () => {
    // one circle: «המעגל» resolves to it regardless of the (vacuous) qualifier path — no rewrite crash
    const one = runLines(['מעגל O']);
    const r1 = parse('A על המעגל', ctxOf(one));
    expect(r1.ok).toBe(true);
    // three circles: the qualifier is ambiguous — no rewrite, the utterance escalates rather than guessing
    const three = runLines(['מעגל O', 'מעגל P', 'מעגל Q']);
    const r3 = parse('B על המעגל הגדול', ctxOf(three));
    expect(r3.ok).toBe(false);
  });

  it('concentric pairs keep the ADR-244 path (qualifier = the pair roles, no independent assert)', () => {
    const facts = runLines(['שני מעגלים בעלי מרכז משותף O']);
    const r = parse('A על המעגל הגדול', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // resolves within the concentric pair (outer id `circle-O`), and appends NO new set-radius-order
    expect(r.commands.filter((c) => c.type === 'set-radius-order')).toHaveLength(0);
    expect(r.commands[0]).toMatchObject({ type: 'point-on-circle', circle: 'circle-O' });
  });
});
