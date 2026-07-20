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
  it('emits the FULL tangency conjunction when A, B, F all pre-exist (#233: membership + ⟂ + on-line — the ⟂ alone was satisfiable with AB far from the circle)', () => {
    const r = parse('AB משיק למעגל בנקודה F', { circles: ['O'], points: ['A', 'B', 'F', 'O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([
      { type: 'point-on-circle', id: 'F', circle: 'circle-O' }, // the touch ON the circle (idempotent for a member)
      { type: 'set-perpendicular', a: 'O', b: 'F', c: 'A', d: 'B', implicit: true },
      { type: 'set-line', points: ['A', 'F', 'B'] }, // F on the named line (a loose F in this bare ctx)
    ]);
    // crucially, NO point-on-line that would redefine the existing A/B (the dependency cycle)
    expect(r.commands.some((c) => c.type === 'point-on-line')).toBe(false);
  });

  it('English phrasing too', () => {
    const r = parse('AB is tangent to circle O at F', { circles: ['O'], points: ['A', 'B', 'F', 'O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands[0]).toEqual({ type: 'point-on-circle', id: 'F', circle: 'circle-O' });
    expect(r.commands[1]).toEqual({ type: 'set-perpendicular', a: 'O', b: 'F', c: 'A', d: 'B', implicit: true });
  });

  it('but a tangent named by NEW points still draws the tangent + markers (unchanged)', () => {
    // C, D are NOT in the figure → they NAME a fresh drawn tangent, so they ARE created.
    const r = parse('הישר CD משיק למעגל בנקודה T', { circles: ['M'], points: ['M', 'T'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.map((c) => c.type)).toEqual(['tangent', 'point-on-line', 'point-on-line']);
  });
});

/**
 * "KB tangent at K" — the tangent's touch point K is also an ENDPOINT of the named segment KB (the
 * segment IS the tangent, touching at its end). The greedy `tangentFromExternal` used to misread this as
 * a tangent FROM external point B, inventing a NEW touch point (a Thales circle∩circle) and ignoring K
 * entirely — so KB was never made tangent. Now it routes to a tangency relation: K on the circle + radius
 * O–K ⟂ KB, and the figure flexes to make it a real tangent. ADR-081.
 */
describe('parse — a segment tangent at its OWN endpoint (KB tangent at K)', () => {
  const ctx = { circles: ['O'], points: ['B', 'K', 'C', 'D', 'O'], circleMembers: [{ center: 'O', points: ['C', 'D'] }] };

  it('emits point-on-circle K + set-perpendicular(O,K,K,B), NOT a tangent-from-external (no invented touch)', () => {
    for (const u of ['KB משיק למעגל O בנקודה K', 'KB tangent to circle O at K', 'הצלע KB משיקה למעגל בנקודה K']) {
      const r = parse(u, ctx);
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      expect(r.commands, u).toEqual([
        { type: 'point-on-circle', id: 'K', circle: 'circle-O' },
        { type: 'set-perpendicular', a: 'O', b: 'K', c: 'K', d: 'B', implicit: true },
      ]);
      // none of the tangent-from-external scaffolding (the invented touch point / Thales circle)
      expect(r.commands.some((c) => c.type === 'circle-circle-intersection' || c.type === 'circle-through'), u).toBe(false);
    }
  });

  it('builds a real tangent: K lands on the circle and OK ⟂ KB', () => {
    s().clear();
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true }, 'circle O');
    s().execute({ type: 'point-on-circle', id: 'K', circle: 'circle-O' }, 'K on O');
    s().execute({ type: 'free-point', id: 'B', x: 12, y: 0, free: true }, 'B');
    s().execute({ type: 'segment', a: 'K', b: 'B' }, 'KB');
    const r = parse('KB משיק למעגל O בנקודה K', { circles: ['O'], points: ['B', 'K', 'O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r.commands.forEach((c) => s().execute(c, 'KB tangent at K'));
    const p = pos();
    const O = p.get('O')!, K = p.get('K')!, B = p.get('B')!;
    expect(dist(O, K)).toBeCloseTo(5, 3); // K is on the circle
    const OK = { x: K.x - O.x, y: K.y - O.y }, KB = { x: B.x - K.x, y: B.y - K.y };
    expect(dot(OK, KB) / (Math.hypot(OK.x, OK.y) * Math.hypot(KB.x, KB.y))).toBeCloseTo(0, 4); // OK ⟂ KB → tangent
    expect(replay(s().facts).violations).toEqual([]); // verified
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
