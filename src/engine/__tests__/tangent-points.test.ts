/**
 * Naming a drawn tangent by two points — "הישר CD משיק למעגל בנקודה T" /
 * "line CD tangent to circle O at T" — must CREATE C and D as fixed markers on
 * the tangent (±offset from the tangency point T), so they're referenceable by a
 * later step. Previously the rule drew the tangent but silently dropped the CD
 * name, leaving C/D undefined (the operator's "AC ⊥ TC references an unknown point").
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';

const s = () => useGeoStore.getState();
const pos = () => replay(s().facts).positions;
const dot = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.x + a.y * b.y;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

beforeEach(() => s().clear());

describe('parse — a tangent named by two points', () => {
  it('emits the tangent plus a point-on-line for each named endpoint', () => {
    const r = parse('הישר CD משיק למעגל בנקודה T', { circles: ['M'], points: ['M', 'T'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.map((c) => c.type)).toEqual(['tangent', 'point-on-line', 'point-on-line']);
    const onLine = r.commands.filter((c) => c.type === 'point-on-line') as { id: string; line: string; offset: number }[];
    expect(onLine.map((c) => c.id).sort()).toEqual(['C', 'D']);
    expect(onLine.every((c) => c.line === 'tan-T')).toBe(true);
    expect(onLine.map((c) => Math.sign(c.offset)).sort()).toEqual([-1, 1]); // ± either side of T
  });

  it('the plain single-point tangent still creates no extra points', () => {
    const r = parse('tangent to circle O at A', { circles: ['O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.map((c) => c.type)).toEqual(['tangent']);
  });
});

/**
 * "AB tangent at F" where A, B and F ALREADY exist names an EXISTING line, not a new drawn
 * tangent — it is a tangency CONSTRAINT that flexes the circle (radius O–F ⟂ AB), NOT a tangent
 * line plus markers. Re-creating A,B as point-on-line markers on tan-F would close a dependency
 * cycle (A → tan-F → circle → … → A) and error "unresolved dependencies". ADR-075.
 */
describe('parse — an EXISTING line declared tangent is a constraint, not a drawn tangent', () => {
  it('emits set-perpendicular(O, F, A, B) when A, B, F all pre-exist', () => {
    const r = parse('AB משיק למעגל בנקודה F', { circles: ['O'], points: ['A', 'B', 'F', 'O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([{ type: 'set-perpendicular', a: 'O', b: 'F', c: 'A', d: 'B' }]);
    // crucially, NO point-on-line that would redefine the existing A/B (the dependency cycle)
    expect(r.commands.some((c) => c.type === 'point-on-line')).toBe(false);
  });

  it('English phrasing too', () => {
    const r = parse('AB is tangent to circle O at F', { circles: ['O'], points: ['A', 'B', 'F', 'O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([{ type: 'set-perpendicular', a: 'O', b: 'F', c: 'A', d: 'B' }]);
  });

  it('but a tangent named by NEW points still draws the tangent + markers (unchanged)', () => {
    // C, D are NOT in the figure → they NAME a fresh drawn tangent, so they ARE created.
    const r = parse('הישר CD משיק למעגל בנקודה T', { circles: ['M'], points: ['M', 'T'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.map((c) => c.type)).toEqual(['tangent', 'point-on-line', 'point-on-line']);
  });
});

describe('engine — C and D land on the tangent, symmetric about T', () => {
  beforeEach(() => {
    s().execute({ type: 'circle', id: 'circle-M', center: 'M', radius: 5 }, 'circle M');
    s().execute({ type: 'point-on-circle', id: 'T', circle: 'circle-M', theta: 0 }, 'T on circle');
    const r = parse('הישר CD משיק למעגל בנקודה T', { circles: ['M'], points: ['M', 'T'] });
    if (r.ok) r.commands.forEach((c) => s().execute(c, 'tangent CD'));
  });

  it('creates C and D', () => {
    expect(pos().has('C')).toBe(true);
    expect(pos().has('D')).toBe(true);
  });

  it('places them on the tangent: TC ⟂ radius MT, |TC| = |TD| = offset, T is their midpoint', () => {
    const M = pos().get('M')!;
    const T = pos().get('T')!;
    const C = pos().get('C')!;
    const D = pos().get('D')!;
    const MT = { x: T.x - M.x, y: T.y - M.y };
    const TC = { x: C.x - T.x, y: C.y - T.y };
    expect(Math.abs(dot(MT, TC))).toBeLessThan(1e-6); // tangent ⟂ radius
    expect(dist(T, C)).toBeCloseTo(5, 6);
    expect(dist(T, D)).toBeCloseTo(5, 6);
    expect({ x: (C.x + D.x) / 2, y: (C.y + D.y) / 2 }).toEqual(T); // C and D straddle T
  });

  it('the named points are now referenceable — a segment AC builds', () => {
    s().execute({ type: 'segment', a: 'T', b: 'C' }, 'segment TC');
    const f = s().facts.find((x) => x.utterance === 'segment TC')!;
    expect(replay(s().facts).status[f.id]).toBe('ok');
  });

  it('a marker is DRIVABLE: a later constraint slides C along the tangent (ADR-036)', () => {
    // M=(0,0), T=(5,0) (θ=0), tangent vertical; C starts at T+5·(0,1)=(5,5).
    const C0 = pos().get('C')!;
    expect(C0).toEqual({ x: 5, y: 5 });
    // A fixed point off the tangent; AC ⊥ TC forces C to the foot of ⟂ from A onto the
    // tangent. With A=(0,10) and the tangent x=5, that foot is (5,10).
    s().execute({ type: 'free-point', id: 'A', x: 0, y: 10 }, 'A');
    s().execute({ type: 'set-perpendicular', a: 'A', b: 'C', c: 'T', d: 'C' }, 'AC ⟂ TC');
    const C1 = pos().get('C')!;
    const A = pos().get('A')!;
    const T = pos().get('T')!;
    expect(C1.x).toBeCloseTo(5, 4); // stayed ON the tangent
    expect(C1.y).toBeCloseTo(10, 3); // slid up to the perpendicular foot
    const AC = { x: C1.x - A.x, y: C1.y - A.y };
    const TC = { x: C1.x - T.x, y: C1.y - T.y };
    expect(Math.abs(dot(AC, TC))).toBeLessThan(1e-3); // AC ⟂ TC now holds
  });
});
