/**
 * #775 (ADR-465) — a special line to a side named by its ROLE: «תיכון ליתר» / «גובה ליתר» /
 * «תיכון לבסיס», + the «על צלע» preposition. Prod (session ks1up71f, 2026-08-17…24): «תיכון ליתר»
 * — the median to the hypotenuse, the phrasing a textbook uses — escalated to the paid LLM twice
 * for a construct the grammar nearly had. The hole was in the shared side-reference resolver
 * (both the median and the altitude heads failed identically), so the fix is one resolver:
 * the role noun resolves against the figure's DECLARED structure (`ctx.roleSides`) and the
 * utterance is rewritten to the letter form, serving every head that shares the side matchers.
 * A role with no unique referent refuses NAMING THE ROLE — never an arbitrary side (ADR-052).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '../index';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

function ctxAfter(utterances: string[]) {
  const facts: Fact[] = [];
  utterances.forEach((u, gi) => {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    expect(r.ok, u).toBe(true);
    if (r.ok) r.commands.forEach((cmd, ci) => facts.push({ id: `g${gi}.${ci}`, utterance: u, group: `g${gi}`, cmd, enabled: true }));
  });
  const { construction, positions } = replay(facts, 0);
  return buildParseCtx(construction, positions);
}

describe('#775 — the prod session: a right triangle, then the median to the hypotenuse', () => {
  const rt = ctxAfter(['משולש ישר זווית ABC']); // right angle at C (the engine convention) ⇒ hypotenuse AB

  it('«תיכון ליתר» builds the median from C to the midpoint of AB (the ks1up71f replay)', () => {
    for (const u of ['תיכון ליתר', 'התיכון ליתר', 'median to the hypotenuse']) {
      const r = parse(u, rt);
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        const mid = r.commands.find((c) => c.type === 'midpoint') as { a: string; b: string; id: string };
        expect([mid.a, mid.b].sort(), u).toEqual(['A', 'B']);
        const seg = r.commands.find((c) => c.type === 'segment') as { a: string; b: string };
        expect(seg.a, u).toBe('C');
      }
    }
  });

  it('the fix serves BOTH heads: «גובה ליתר» builds the altitude foot on AB from C', () => {
    const r = parse('גובה ליתר', rt);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const foot = r.commands.find((c) => c.type === 'foot') as { from: string; a: string; b: string };
      expect(foot.from).toBe('C');
      expect([foot.a, foot.b].sort()).toEqual(['A', 'B']);
    }
  });

  it('a run restating the side folds into the role («תיכון ליתר AB»)', () => {
    const r = parse('תיכון ליתר AB', rt);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const mid = r.commands.find((c) => c.type === 'midpoint') as { a: string; b: string };
      expect([mid.a, mid.b].sort()).toEqual(['A', 'B']);
    }
  });

  it('the «על» preposition joins the letter-form slot: «תיכון על צלע BC» ≡ «תיכון לצלע BC»', () => {
    const a = parse('תיכון על צלע BC', rt);
    const b = parse('תיכון לצלע BC', rt);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.commands).toEqual(b.commands);
  });
});

describe('#775 — the isosceles roles, and the honest refusals', () => {
  const iso = ctxAfter(['משולש שווה שוקיים ABC']); // variant 0: apex A ⇒ base BC, legs AB, AC

  it('«תיכון לבסיס» / «גובה לבסיס» resolve the declared base', () => {
    for (const u of ['תיכון לבסיס', 'גובה לבסיס']) {
      const r = parse(u, iso);
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        const target = r.commands.find((c) => c.type === 'midpoint' || c.type === 'foot') as { a: string; b: string };
        expect([target.a, target.b].sort(), u).toEqual(['B', 'C']);
      }
    }
  });

  it('«גובה לשוק» / «תיכון לשוק» DRAW ONE leg deterministically (#805 play, ADR-465 Am. 1)', () => {
    // the one isosceles' two legs are congruent by the declaring constraint — the drawing is
    // symmetric in them, so the pick is pure gauge (the parallelogram-height precedent)
    for (const u of ['גובה לשוק', 'תיכון לשוק']) {
      const r = parse(u, iso);
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        const target = r.commands.find((c) => c.type === 'midpoint' || c.type === 'foot') as { a: string; b: string };
        const edge = [target.a, target.b].sort().join('');
        expect(['AB', 'AC'], u).toContain(edge); // one of THE legs, never the base
      }
    }
    // determinism: the same utterance always picks the same leg
    const a = parse('גובה לשוק', iso);
    const b = parse('גובה לשוק', iso);
    if (a.ok && b.ok) expect(a.commands).toEqual(b.commands);
  });

  it('a role with NO referent refuses naming the role — a plain triangle has no hypotenuse', () => {
    const plain = ctxAfter(['משולש ABC']);
    const r = parse('תיכון ליתר', plain);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r).toEqual({ ok: false, reason: 'role-side-unresolved', role: 'יתר' });
  });

  it('a LATER-declared right angle induces the hypotenuse too (the class, not the macro)', () => {
    const rt2 = ctxAfter(['משולש ABC', 'זווית ABC = 90']);
    const r = parse('תיכון ליתר', rt2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const mid = r.commands.find((c) => c.type === 'midpoint') as { a: string; b: string };
      expect([mid.a, mid.b].sort()).toEqual(['A', 'C']); // right angle at B ⇒ hypotenuse AC
    }
  });
});
