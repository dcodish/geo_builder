/**
 * Structured-id-aware rename/swap ([docs/15-hardening-plan.md] C9 / PAR-9).
 *
 * `renameInCommand` rewrote only whole-field single-letter matches, so a point letter EMBEDDED in a
 * structured id — `circle-O`, `bis-XYZ`, `tan-O`, `sec-EO`, `line-XY` — survived a rename of that letter.
 * Meanwhile the `center` field WAS rewritten and `hiddenCircles` WAS remapped, so renaming O→M left the
 * circle with id `circle-O` but centre `M`: a hidden circle popped back, and the deterministic-id
 * idempotency broke (a later "circle M" resolves to `circle-M`, a DIFFERENT id → a duplicate construction).
 * Fix: rewrite every WHOLE embedded label via `relabelId` (a bare "O" ≠ the "O" of "O1").
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AnyCommand } from '@/engine';
import { useGeoStore } from '../geoStore';

const s = () => useGeoStore.getState();
const cmds = () => s().facts.map((f) => f.cmd);
const byType = <T extends AnyCommand['type']>(t: T) => cmds().find((c) => c.type === t) as Extract<AnyCommand, { type: T }> | undefined;

beforeEach(() => s().clear());

describe('PAR-9 — rename rewrites the letter INSIDE a structured id', () => {
  it('rename O→M rewrites circle-O in the circle id, the centre, AND a referencing field', () => {
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 } as AnyCommand, 'circle O radius 5');
    s().execute({ type: 'point-on-circle', id: 'A', circle: 'circle-O' } as AnyCommand, 'A on circle O');

    expect(s().rename('O', 'M')).toEqual({ ok: true });

    const circle = byType('circle') as { id: string; center: string };
    expect(circle.id, 'the circle id tracks the renamed centre').toBe('circle-M');
    expect(circle.center).toBe('M');
    const onCircle = byType('point-on-circle') as { circle: string };
    expect(onCircle.circle, 'the reference is not stale').toBe('circle-M');
  });

  it('after rename O→M, re-issuing "A on circle M" resolves to the SAME circle id (idempotency restored)', () => {
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 } as AnyCommand, 'circle O');
    s().rename('O', 'M');
    // The parser would now emit circle:'circle-M' for "circle M"; that must match the existing object's id.
    const circleId = (byType('circle') as { id: string }).id;
    expect(circleId).toBe('circle-M'); // not the stale circle-O, so no phantom duplicate on re-issue
  });

  it('a hidden circle stays hidden under the renamed centre (no pop-back)', () => {
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 } as AnyCommand, 'circle O');
    s().toggleCircleHidden('circle-O');
    expect(s().hiddenCircles).toEqual(['circle-O']);

    s().rename('O', 'M');
    expect(s().hiddenCircles, 'hiddenCircles remapped').toEqual(['circle-M']);
    expect((byType('circle') as { id: string }).id, 'and the object id matches → it stays hidden').toBe('circle-M');
  });

  it('rewrites letters inside line-family ids (bis/tan/sec/line)', () => {
    s().execute({ type: 'square', ids: ['A', 'B', 'C', 'D'] } as AnyCommand, 'square ABCD');
    s().execute({ type: 'tangent', id: 'tan-A', circle: 'circle-O', at: 'A' } as AnyCommand, 'tangent at A');
    s().execute({ type: 'line-intersection', id: 'X', line1: 'bis-ABC', line2: 'sec-AD' } as AnyCommand, 'X = bis ∩ sec');

    s().rename('A', 'P');

    expect((byType('tangent') as { id: string; at: string }).id).toBe('tan-P');
    expect((byType('tangent') as { at: string }).at).toBe('P');
    const li = byType('line-intersection') as { line1: string; line2: string };
    expect(li.line1).toBe('bis-PBC'); // the A inside bis-ABC → P
    expect(li.line2).toBe('sec-PD'); // the A inside sec-AD → P
  });

  it('does NOT corrupt a multi-char label: renaming O leaves O1 / circle-O1 untouched', () => {
    s().execute({ type: 'circle', id: 'circle-O1', center: 'O1', radius: 5 } as AnyCommand, 'circle O1');
    s().execute({ type: 'point-on-circle', id: 'O', circle: 'circle-O1' } as AnyCommand, 'O on circle O1');

    s().rename('O', 'T'); // rename the bare point O, NOT O1

    const circle = byType('circle') as { id: string; center: string };
    expect(circle.id, 'circle-O1 is not touched by renaming O').toBe('circle-O1');
    expect(circle.center).toBe('O1');
    expect((byType('point-on-circle') as { id: string; circle: string }).id).toBe('T');
    expect((byType('point-on-circle') as { circle: string }).circle).toBe('circle-O1');
  });
});

describe('PAR-9 — swap exchanges structured ids too', () => {
  it('swap O↔P exchanges circle-O and circle-P', () => {
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 } as AnyCommand, 'circle O');
    s().execute({ type: 'circle', id: 'circle-P', center: 'P', radius: 3 } as AnyCommand, 'circle P');
    s().execute({ type: 'point-on-circle', id: 'A', circle: 'circle-O' } as AnyCommand, 'A on circle O');

    expect(s().swap('O', 'P')).toEqual({ ok: true });

    const circles = cmds().filter((c) => c.type === 'circle') as { id: string; center: string; radius: number }[];
    const cO = circles.find((c) => c.center === 'O')!;
    const cP = circles.find((c) => c.center === 'P')!;
    expect(cO.id, 'centre O now carries id circle-O again (radius 3, was P)').toBe('circle-O');
    expect(cO.radius).toBe(3);
    expect(cP.id).toBe('circle-P');
    expect(cP.radius).toBe(5);
    // A referenced circle-O (radius 5 originally) followed its object → now circle-P.
    expect((byType('point-on-circle') as { circle: string }).circle).toBe('circle-P');
  });
});
