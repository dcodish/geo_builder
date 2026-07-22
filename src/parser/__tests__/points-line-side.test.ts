/**
 * Issue #265 (ADR-389) — points' RELATIVE side of a LINE: «C ו-D בצדדים שונים של AB» /
 * "C and D on different (the same) sides of AB" — the ADR-254/303 side family, line edition.
 *
 * Prod session m01ophid (2026-07-22): after «AB», the operator's «נקודת C ו D נמצאות בצדדים שונים
 * של AB» had no owner rule — it escalated to the LLM, whose decomposition dropped the relation
 * (two bare free points, same side, green row — the #266 honesty half). Now the deterministic
 * `pointsVsLine` rule owns it: the carrier drawn + ONE relational `points-line-side` REQUIREMENT
 * (the ADR-244 shape — verifier + meetsRequirements gate), new subjects seeded on their sides in
 * general position, existing free subjects re-seated (M1), contradictions amber.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { meetsRequirements, replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function factsFrom(lines: (string | AnyCommand[])[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const group = `g${g++}`;
    if (typeof line !== 'string') {
      for (const cmd of line) facts.push({ id: `${group}.${facts.length}`, utterance: '(direct)', group, cmd, enabled: true });
      continue;
    }
    const fig = replay(facts);
    const r = parse(line, buildParseCtx(fig.construction, fig.positions));
    expect(r.ok, `expected to parse: ${line} (${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}

function sideOf(fig: ReturnType<typeof replay>, a: string, b: string, p: string): number {
  const A = fig.positions.get(a)!;
  const B = fig.positions.get(b)!;
  const P = fig.positions.get(p)!;
  return Math.sign((B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x));
}

type PLS = Extract<AnyCommand, { type: 'points-line-side' }>;

describe('#265 — parse forms', () => {
  const ctx = () => {
    const fig = replay(factsFrom(['AB']));
    return buildParseCtx(fig.construction, fig.positions);
  };
  it.each([
    ['He, the prod utterance', 'נקודת C ו D נמצאות בצדדים שונים של AB', 'different'],
    ['He, plural noun + hyphen list', 'הנקודות C ו-D בצדדים שונים של AB', 'different'],
    ['He, מצדדים שונים + הישר', 'C ו-D מצדדים שונים של הישר AB', 'different'],
    ['He, משני צידי (no של)', 'C ו D משני צידי AB', 'different'],
    ['He, same side', 'C ו-D באותו צד של AB', 'same'],
    ['He, same side of the segment', 'הנקודות C ו-D נמצאות באותו צד של הקטע AB', 'same'],
    ['En, different sides', 'points C and D are on different sides of AB', 'different'],
    ['En, opposite sides of line', 'C and D lie on opposite sides of line AB', 'different'],
    ['En, same side', 'C and D are on the same side of AB', 'same'],
  ])('%s', (_t, u, rel) => {
    const r = parse(u, ctx());
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    const cmd = r.commands.find((c): c is PLS => c.type === 'points-line-side');
    expect(cmd, 'the requirement command').toBeTruthy();
    expect(cmd!.rel).toBe(rel);
    expect(cmd!.subjects).toEqual(['C', 'D']);
    expect([cmd!.a, cmd!.b]).toEqual(['A', 'B']);
    // the carrier is drawn (idempotent segment)
    expect(r.commands.some((c) => c.type === 'segment' && (c as { a: string }).a === 'A')).toBe(true);
  });

  it.each([
    ['three subjects on DIFFERENT sides is ambiguous', 'C, D ו-E בצדדים שונים של AB'],
    ['a carrier endpoint as a subject', 'A ו-C בצדדים שונים של AB'],
    ['duplicate subjects', 'C ו-C בצדדים שונים של AB'],
    ['one subject alone (a relation needs two)', 'C באותו צד של AB'],
  ])('defers: %s', (_t, u) => {
    const r = parse(u, ctx());
    // not claimed by pointsVsLine — escalates (and the #266 gate keeps any dropping lowering out)
    expect(r.ok && r.commands.some((c) => c.type === 'points-line-side')).toBe(false);
  });

  it('SAME side accepts three subjects', () => {
    const r = parse('C, D ו-E באותו צד של AB', ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.commands.find((c): c is PLS => c.type === 'points-line-side');
    expect(cmd!.rel).toBe('same');
    expect(cmd!.subjects).toEqual(['C', 'D', 'E']);
  });
});

describe('#265 — build, M1, requirement gating', () => {
  it('the exact prod sequence builds green with C and D strictly on opposite sides', () => {
    const facts = factsFrom(['AB', 'נקודת C ו D נמצאות בצדדים שונים של AB']);
    const fig = replay(facts);
    for (const [id, st] of Object.entries(fig.status)) expect(st, `status of ${id}`).toBe('ok');
    expect(fig.violations).toEqual([]);
    expect(sideOf(fig, 'A', 'B', 'C') * sideOf(fig, 'A', 'B', 'D')).toBe(-1);
  });

  it('the same-side dual builds with all subjects on one side', () => {
    const facts = factsFrom(['AB', 'C, D ו-E באותו צד של AB']);
    const fig = replay(facts);
    expect(fig.violations).toEqual([]);
    const s = ['C', 'D', 'E'].map((p) => sideOf(fig, 'A', 'B', p));
    expect(s.every((x) => x === s[0] && x !== 0)).toBe(true);
  });

  it('M1: EXISTING free points on the same side — one is re-seated across, the figure never errors', () => {
    const facts = factsFrom([
      'AB',
      // both existing, deliberately seeded on the SAME side (unpinned free points — re-seatable defaults)
      [
        { type: 'free-point', id: 'C', x: 1.4, y: 2.1, free: true } as AnyCommand,
        { type: 'free-point', id: 'D', x: 3.6, y: 1.7, free: true } as AnyCommand,
      ],
      'C ו-D בצדדים שונים של AB',
    ]);
    const fig = replay(facts);
    for (const [id, st] of Object.entries(fig.status)) expect(st, `status of ${id}`).toBe('ok');
    expect(fig.violations).toEqual([]);
    expect(sideOf(fig, 'A', 'B', 'C') * sideOf(fig, 'A', 'B', 'D')).toBe(-1);
  });

  it('a genuinely contradicted relation reads AMBER (pinned points), never a crash or a silent drop', () => {
    const facts = factsFrom([
      'AB',
      [
        { type: 'free-point', id: 'C', x: 1.4, y: 2.1 } as AnyCommand, // pinned (no free flag) — a stated placement
        { type: 'free-point', id: 'D', x: 3.6, y: 1.7 } as AnyCommand,
      ],
      'C ו-D בצדדים שונים של AB',
    ]);
    const fig = replay(facts);
    expect(fig.lastError).toBeNull();
    expect(fig.violations.some((v) => v.messageKey === 'figure.v.lineSideDifferent')).toBe(true);
  });

  it('sampling keeps the stated sides: every requirement-satisfying seed shows opposite sides', () => {
    const facts = factsFrom(['AB', 'נקודת C ו D נמצאות בצדדים שונים של AB']);
    const satisfying = [...Array(12).keys()].filter((s) => meetsRequirements(facts, s));
    expect(satisfying.length, 'plenty of valid configurations').toBeGreaterThan(5);
    for (const s of satisfying) {
      const fig = replay(facts, s);
      expect(sideOf(fig, 'A', 'B', 'C') * sideOf(fig, 'A', 'B', 'D'), `seed ${s}`).toBe(-1);
    }
  });

  it('re-stating the relation on a satisfied figure is DATA, not a refused no-op (the ADR-234 class)', () => {
    const facts = factsFrom(['AB', 'C ו-D בצדדים שונים של AB']);
    const fig = replay(facts);
    const r = parse('C ו-D בצדדים שונים של AB', buildParseCtx(fig.construction, fig.positions));
    expect(r.ok && r.commands.some((c) => c.type === 'points-line-side')).toBe(true);
  });
});
