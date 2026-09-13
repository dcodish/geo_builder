/**
 * #260 ([ADR-512](../../../docs/06-decisions.md#adr-512)) — a statement that names a point as the MEETING of
 * two carriers moves the carrier that is genuinely loose, whatever command kind carried the statement.
 *
 * `AB` · `P על AB` · `CD` · `P על CD` refused «cannot place P on segment AB so that P, C, D collinear»: P is
 * a free rider of AB, the second membership lowers to a collinear drive on P's slide, and that drive was
 * rooted against C,D's DEFAULT placement (line CD met line AB beyond B) — while C and D were free 2-DOF
 * points nothing referenced. The re-seat that fixes exactly this (`reseatLooseMeetEndpoint`, ADR-255)
 * existed, wired at two call sites by command kind; the rider case never reached it. Now ONE semantic
 * predicate (`meetingCarriers`) routes every member, and the reseat may move an endpoint of EITHER
 * carrier (fewest dependents first) — here C, so A and B never move (stability, M2).
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { replay } from '@/replay/core';
import { meetingCarriers } from '@/engine/apply';
import type { GeoObject, Vec } from '@/engine';

const at = (fig: ReturnType<typeof replay>, id: string): Vec => {
  const p = fig.positions.get(id);
  if (!p) throw new Error(`${id} has no position: ${fig.lastError}`);
  return p;
};
const param = (s: Vec, e: Vec, x: Vec): number => ((x.x - s.x) * (e.x - s.x) + (x.y - s.y) * (e.y - s.y)) / ((e.x - s.x) ** 2 + (e.y - s.y) ** 2);
const cross = (s: Vec, e: Vec, x: Vec): number => Math.abs((e.x - s.x) * (x.y - s.y) - (e.y - s.y) * (x.x - s.x)) / Math.hypot(e.x - s.x, e.y - s.y);

/** P lies on BOTH stated segments — collinear with each pair and strictly between its ends. */
function meetsBoth(fig: ReturnType<typeof replay>, seg1: [string, string], seg2: [string, string], label: string) {
  expect(fig.lastError, label).toBeNull();
  for (const s of Object.values(fig.status)) expect(s, label).toBe('ok');
  const P = at(fig, 'P');
  for (const [u, v] of [seg1, seg2]) {
    const a = at(fig, u), b = at(fig, v);
    expect(cross(a, b, P), `${label}: P on line ${u}${v}`).toBeLessThan(1e-6);
    const t = param(a, b, P);
    expect(t, `${label}: P inside ${u}${v}`).toBeGreaterThan(0.02);
    expect(t, `${label}: P inside ${u}${v}`).toBeLessThan(0.98);
  }
}

describe('#260 — the operator’s two-host membership (the rider edition of the crossing statement)', () => {
  it('`AB` · `P על AB` · `CD` · `P על CD` builds with P at the crossing — and the FIRST segment never moves', () => {
    const facts = factsOf(['AB', 'P על AB', 'CD', 'P על CD']);
    const before = replay(facts.slice(0, 3));
    const fig = replay(facts);
    meetsBoth(fig, ['A', 'B'], ['C', 'D'], 'reported');
    for (const id of ['A', 'B']) expect(at(fig, id), `${id} stays where it was (stability)`).toEqual(at(before, id));
    const P = fig.construction.objects.find((o) => o.id === 'P') as Extract<GeoObject, { kind: 'on-segment' | 'on-segment-solved' }>;
    expect(['on-segment', 'on-segment-solved'], 'P stays a rider of its first host — solved onto the crossing').toContain(P.kind);
    expect(P.a + P.b).toBe('AB');
  });

  it('entry-order permutations reach the same kind of figure (docs/17 §6 — M2 work)', () => {
    const orders: string[][] = [
      ['AB', 'CD', 'P על AB', 'P על CD'],
      ['CD', 'AB', 'P על CD', 'P על AB'],
      ['CD', 'P על CD', 'AB', 'P על AB'],
      ['AB', 'CD', 'P על CD', 'P על AB'],
    ];
    for (const seq of orders) meetsBoth(replay(factsOf(seq)), ['A', 'B'], ['C', 'D'], seq.join(' · '));
  });

  it('mirrored slots and both locales', () => {
    meetsBoth(replay(factsOf(['AB', 'P על BA', 'CD', 'P על DC'])), ['A', 'B'], ['C', 'D'], 'mirrored');
    meetsBoth(replay(factsOf(['AB', 'P on AB', 'CD', 'P on CD'])), ['A', 'B'], ['C', 'D'], 'english');
  });

  it('hosts the student PINNED apart still refuse honestly, naming the statement — never a moved given', () => {
    // All four endpoints are stated coordinates (givens, ADR-052): line CD meets line AB beyond B, and
    // nothing loose remains to re-seat — the refusal stands and names P's statement.
    const facts = factsOf(['נקודה A ב-(0,0)', 'נקודה B ב-(5,0)', 'AB', 'P על AB', 'נקודה C ב-(9,0)', 'נקודה D ב-(9,3)', 'CD', 'P על CD']);
    const fig = replay(facts);
    expect(fig.lastError, 'refused').not.toBeNull();
    expect(fig.lastError, 'names the statement, not solver state').toMatch(/P/);
    const pre = replay(facts.slice(0, 7));
    expect(at(pre, 'A')).toEqual({ x: 0, y: 0 });
    expect(at(pre, 'C')).toEqual({ x: 9, y: 0 });
  });

  it('only ONE loose carrier: with C, D pinned the re-seat moves the segment that is still free (never a given)', () => {
    const facts = factsOf(['AB', 'P על AB', 'נקודה C ב-(9,0)', 'נקודה D ב-(9,3)', 'CD', 'P על CD']);
    const fig = replay(facts);
    meetsBoth(fig, ['A', 'B'], ['C', 'D'], 'C,D pinned');
    expect(at(fig, 'C')).toEqual({ x: 9, y: 0 });
    expect(at(fig, 'D')).toEqual({ x: 9, y: 3 });
  });
});

describe('#260 — `meetingCarriers`, the one routing predicate', () => {
  const rider = (id: string, a: string, b: string): GeoObject => ({ kind: 'on-segment', id, a, b, t: 0.5, free: true });
  const pt = (id: string): GeoObject => ({ kind: 'free-point', id, x: 0, y: 0 });
  const objects = [pt('A'), pt('B'), pt('C'), pt('D'), rider('P', 'A', 'B')];

  it('a named segment-meet (onSeg) and the point-free crossing statement are meetings', () => {
    expect(meetingCarriers(objects, { type: 'line-line-intersection', id: 'K', a: 'A', b: 'B', c: 'C', d: 'D', onSeg: true })).toEqual([['A', 'B'], ['C', 'D']]);
    expect(meetingCarriers(objects, { type: 'line-line-intersection', id: 'K', a: 'A', b: 'B', c: 'C', d: 'D' }), 'a LINE meet asserts no crossing inside the segments').toBeNull();
    expect(meetingCarriers(objects, { type: 'segments-cross', a: 'A', b: 'B', c: 'C', d: 'D' })).toEqual([['A', 'B'], ['C', 'D']]);
  });

  it('a rider named onto a SECOND host is a meeting of its host and the pair; the same host restated is not', () => {
    expect(meetingCarriers(objects, { type: 'set-collinear', a: 'P', b: 'C', c: 'D' })).toEqual([['A', 'B'], ['C', 'D']]);
    expect(meetingCarriers(objects, { type: 'set-collinear', a: 'P', b: 'A', c: 'B' }), 'restating the host').toBeNull();
    expect(meetingCarriers(objects, { type: 'set-collinear', a: 'A', b: 'C', c: 'D' }), 'no rider at all — a plain collinear').toBeNull();
    expect(meetingCarriers(objects, { type: 'set-collinear', a: 'P', b: 'C', c: 'X' }), 'an unknown point is not a carrier').toBeNull();
  });
});
