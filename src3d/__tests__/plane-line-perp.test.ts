/**
 * #375 (ADR-3D-100): a POINT-RUN plane stated ⟂ a named LINE.
 *
 * Operator (2026-07-28) on a pyramid + `l1:x=t(0,m,2m-2)`: «ACD אנך למישור l1» → not understood.
 * Perpendicularity-to-a-plane was supported for {segment}×{named plane}, {segment}×{point-run plane}
 * and {line}×{named plane} — the fourth cell, {line}×{point-run plane}, was unreachable in any phrasing.
 *
 * The relation DRIVES: since ADR-3D-095 made an unstated placement a free DOF, what must move to satisfy
 * it is the figure's orientation. Verify-only would have refused `claim-refuted` on nearly every seed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { cross3, newellNormal, norm3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

/** sin of the angle between the point-run plane's normal and the line — 0 ⟺ plane ⟂ line. */
const misalignment = (seed: number, ids: string[], line = 'ℓ1'): number => {
  const d = derive3(state().facts, seed);
  const ring = ids.map((id) => d.resolved.positions.get(id)!);
  const n = newellNormal(ring);
  const ln = d.resolved.lines.get(line)!;
  return norm3(cross3(n, ln.dir)) / (norm3(n) * norm3(ln.dir));
};

const BASE = ['פירמידה משולשת ABCD', 'l1:x=t(0,m,2m-2)'];

describe('#375 — a point-run plane ⟂ a named line', () => {
  beforeEach(() => state().clear());

  it("the operator's exact utterance builds and DRIVES the figure into place", () => {
    for (const u of BASE) submit(u);
    const before = misalignment(0, ['A', 'C', 'D']);
    expect(before, 'the sampled placement does not satisfy it by luck').toBeGreaterThan(0.05);

    submit('ACD אנך למישור l1');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2, 3]) {
      expect(misalignment(seed, ['A', 'C', 'D']), `holds at seed ${seed}`).toBeLessThan(1e-3);
    }
  });

  it('every phrasing and order lowers to the same relation, both locales', () => {
    for (const u of BASE) submit(u);
    const forms = [
      'ACD אנך לישר l1',
      'מישור ACD אנך לישר l1',
      'המישור ACD ניצב לישר ℓ1',
      'הישר l1 אנך למישור ACD',
      'הישר ℓ1 ניצב למישור ACD',
      'plane ACD is perpendicular to line l1',
      'line l1 is perpendicular to plane ACD',
    ];
    for (const u of forms) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      expect(r.ok && r.commands[0], u).toMatchObject({ type: 'plane-line-perp', ids: ['A', 'C', 'D'], line: 'ℓ1' });
    }
  });

  it('the noun slip is BUILT and corrected, not ignored (operator ruling A)', () => {
    for (const u of BASE) submit(u);
    submit('ACD אנך למישור l1'); // «to the PLANE l1» — but l1 is a line
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, 0);
    const note = d.notices.find((n) => n.kind === 'line-called-plane');
    expect(note, 'the wording is corrected in a build notice').toBeTruthy();
    expect(note && 'line' in note && note.line).toBe('ℓ1');
    // and the relation genuinely holds — the notice is not a substitute for building it
    expect(misalignment(0, ['A', 'C', 'D'])).toBeLessThan(1e-3);
  });

  it('the correct wording builds the same figure WITHOUT a notice', () => {
    for (const u of BASE) submit(u);
    submit('מישור ACD אנך לישר l1');
    const d = derive3(state().facts, 0);
    expect(d.notices.some((n) => n.kind === 'line-called-plane')).toBe(false);
    expect(misalignment(0, ['A', 'C', 'D'])).toBeLessThan(1e-3);
  });

  it('no theft: the sibling relations still parse as themselves', () => {
    for (const u of BASE) submit(u);
    submit('המישור π: 3x + y + z + 4 = 0');
    expect(parse3('הישר ℓ1 ניצב למישור π').ok && (parse3('הישר ℓ1 ניצב למישור π') as any).commands[0].type)
      .toBe('line-perp-plane');
    const seg = parse3('AC אנך למישור ACD');
    expect(seg.ok && (seg as any).commands.some((k: any) => k.type === 'claim' || k.type === 'seg-plane-rel')).toBe(true);
  });

  it('an unknown line is refused, not silently dropped', () => {
    submit('פירמידה משולשת ABCD');
    submit('ACD אנך לישר l7');
    expect(state().lastError).not.toBeNull();
  });

  it('the DRIVEN figure still lands in general position — the relation fixes facing, not place', () => {
    // Operator, 2026-07-28: "l1 is always tied to A". It was: a ⟂-to-a-line relation constrains only
    // ORIENTATION, so translation stays free, and the pivot's least-squares has no reason to move the
    // figure off its canonical origin — where A sits, and where a line through the origin passes.
    // dist(A, ℓ1) measured 0.0000 at every seed. ADR-3D-095's guard ran only when NO pivot had run.
    useGeo3.getState().clear();
    submit('פירמידה משולשת');
    submit('l1:x=(0,0,0)+t(m,2m,3m)');
    submit('l1 מאונך למישור ACD');
    expect(state().lastError).toBeNull();

    for (const seed of [8, 0, 1, 2, 3]) {
      const d = derive3(state().facts, seed);
      const ln = d.resolved.lines.get('ℓ1')!;
      // (a) the student's relation still holds — translation cannot break a direction relation
      expect(misalignment(seed, ['A', 'C', 'D']), `⟂ holds at seed ${seed}`).toBeLessThan(1e-3);
      // (b) …and no vertex sits on the line
      for (const id of ['A', 'B', 'C', 'D']) {
        const p = d.resolved.positions.get(id)!;
        const ap = { x: p.x - ln.anchor.x, y: p.y - ln.anchor.y, z: p.z - ln.anchor.z };
        const dn = Math.hypot(ln.dir.x, ln.dir.y, ln.dir.z);
        const t = (ap.x * ln.dir.x + ap.y * ln.dir.y + ap.z * ln.dir.z) / (dn * dn);
        const gap = Math.hypot(ap.x - t * ln.dir.x, ap.y - t * ln.dir.y, ap.z - t * ln.dir.z);
        expect(gap, `${id} clears ℓ1 at seed ${seed}`).toBeGreaterThan(0.15);
      }
    }
  });
});
