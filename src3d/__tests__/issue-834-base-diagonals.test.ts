/**
 * #834 — «אלכסוני הבסיס» DRAWS the base's two diagonals, naming no crossing.
 *
 * Two unrelated prod users, same lesson, 2026-08-23, on a square pyramid:
 *
 *   פירמידה ישרה מרובעת            ✓ solid, concyclic
 *   אלכסוני הבסיס נפגשים בנקודה O  ✓ diag-intersection   ← the construct EXISTS
 *   אלכסוני הבסיס                  ✗ not-handled          ← just DRAW them
 *   הוסף אלכסוני בסיס              ✗ not-handled          ← both users typed this
 *
 * A missing ARM of an existing construct, not a missing construct: the base carrier and the diagonal
 * pair both existed, reachable only through the form that names the crossing. Both refusals escalated to
 * the paid LLM, which built something for one user and failed the other.
 *
 * The operator's ruling — *"diagonals of base should relate to the bottom base of a shape"* — is already
 * implemented at a chokepoint (`face: []` → `faces[0]`, base-first for every solid kind), so the fix
 * routes through it rather than resolving a base of its own. A prism has two candidate rings and the top
 * one must never be picked; a second resolver is precisely how the two forms would drift apart.
 */
import { describe, it, expect } from 'vitest';
import { parse3 } from '../parser/parse3';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3 } from '../engine/types';
import type { Construction3 } from '../engine/types';

function build(lines: string[]): Construction3 {
  let c = emptyConstruction3();
  for (const l of lines) {
    const r = parse3(l);
    if (!r.ok) throw new Error(`did not parse: ${l}`);
    for (const cmd of r.commands) {
      const a = applyCommand3(c, cmd);
      if (!a.ok) throw new Error(`did not apply: ${l} — ${JSON.stringify(a.error)}`);
      c = a.next;
    }
  }
  return c;
}
const pair = (s: readonly string[]) => [...s].sort().join('');
const segs = (c: Construction3) => c.segments.map(pair).sort();

describe('#834 — the point-free form parses', () => {
  it.each([
    'אלכסוני הבסיס',
    'אלכסוני הבסיס של הפירמידה',
    'הוסף אלכסוני בסיס',
    'diagonals of the base',
  ])('%s lowers to quad-diagonals with the base sentinel', (utterance) => {
    const r = parse3(utterance);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.map((c) => c.type)).toEqual(['quad-diagonals']);
    expect((r.commands[0] as { face: string[] }).face, 'the "the base" sentinel').toEqual([]);
  });

  it('«אלכסוני ABCD» names its ring explicitly, same lowering', () => {
    const r = parse3('אלכסוני ABCD');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.commands[0] as { type: string; face: string[] })).toMatchObject({
      type: 'quad-diagonals',
      face: ['A', 'B', 'C', 'D'],
    });
  });

  it('THE OWNERSHIP BOUNDARY: a sentence that NAMES the crossing still belongs to diagIntersection', () => {
    for (const u of ['אלכסוני הבסיס נפגשים בנקודה O', 'O מפגש אלכסוני הבסיס']) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands.map((c) => c.type), u).toEqual(['diag-intersection']);
    }
  });

  it('the SINGULAR named diagonal is untouched — «אלכסון AC\'» is still a segment', () => {
    const r = parse3("אלכסון AC'");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.type)).toEqual(['segment3']);
  });
});

describe('#834 — it draws the BOTTOM base, on every solid kind', () => {
  it.each([
    ['פירמידה ישרה מרובעת'],
    ['מנסרה ישרה מרובעת'],
    ["תיבה ABCDA'B'C'D'"],
  ])('%s — the diagonals are AC and BD of the base ring', (solid) => {
    const c = build([solid, 'אלכסוני הבסיס']);
    expect(c.solids[0].faces[0], 'base-first convention').toEqual(['A', 'B', 'C', 'D']);
    // the operator's ruling: the BOTTOM base. On a prism the top ring A'B'C'D' is the trap.
    expect(segs(c)).toEqual(['AC', 'BD']);
  });

  it('mints NO point — the student named no crossing (that is the whole difference from #834\'s sibling)', () => {
    const before = build(['פירמידה ישרה מרובעת']);
    const after = build(['פירמידה ישרה מרובעת', 'אלכסוני הבסיס']);
    expect([...after.points.keys()].sort()).toEqual([...before.points.keys()].sort());
  });

  it('is idempotent — re-issuing does not double the ink', () => {
    const c = build(['פירמידה ישרה מרובעת', 'אלכסוני הבסיס', 'אלכסוני הבסיס']);
    expect(segs(c)).toEqual(['AC', 'BD']);
  });
});

describe('#834 — the refusals that must stay refusals', () => {
  it('TWO solids: which base is meant is the student\'s to say (ADR-052), never a silent pick', () => {
    const c = build(['פירמידה ישרה מרובעת', "קובייה EFGHE'F'G'H'"]);
    const r = parse3('אלכסוני הבסיס');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = applyCommand3(c, r.commands[0]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toMatchObject({ code: 'unknown-plane', id: 'base' });
  });

  it('…but naming the ring resolves it, even with two solids present', () => {
    const c = build(['פירמידה ישרה מרובעת', "קובייה EFGHE'F'G'H'", 'אלכסוני EFGH']);
    expect(segs(c)).toEqual(['EG', 'FH']);
  });

  it('a TRIANGULAR base has no diagonals — refused, not silently skipped', () => {
    const c = build(['מנסרה ישרה משולשת']);
    const r = parse3('אלכסוני הבסיס');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = applyCommand3(c, r.commands[0]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toMatchObject({ code: 'no-solution' });
  });
});
