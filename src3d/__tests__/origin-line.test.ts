/**
 * #351 (ADR-3D-091): a parametric line through the ORIGIN, written with the anchor omitted —
 * `x = t(d,e,f)` rather than `x = (0,0,0) + t(d,e,f)`.
 *
 * Prod evidence (log-triage 2026-07-26): `l1:x=t(0,m,2m-2)` came back not-understood, while the identical
 * line WITH an explicit `(0,0,0) +` built fine. The anchor group in `parametricLine`'s body regex was
 * mandatory — nothing else was missing, so an omitted anchor now simply means the origin.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';

const ZERO = { k: 0, p: 0 };

describe('#351 — an omitted anchor means the origin', () => {
  it('the prod utterance `l1:x=t(0,m,2m-2)` parses', () => {
    const r = parse3('l1:x=t(0,m,2m-2)');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands[0]).toMatchObject({
      type: 'line3',
      name: 'ℓ1',
      anchor: [ZERO, ZERO, ZERO],
      dir: [ZERO, { k: 0, p: 1 }, { k: -2, p: 2 }],
      param: 'm',
    });
  });

  it('it lowers IDENTICALLY to the explicit-origin form (the only difference was the missing anchor)', () => {
    const withAnchor = parse3('l1:x=(0,0,0)+t(0,m,2m-2)');
    const without = parse3('l1:x=t(0,m,2m-2)');
    expect(withAnchor.ok && without.ok).toBe(true);
    if (!withAnchor.ok || !without.ok) return;
    expect(without.commands).toEqual(withAnchor.commands); // src echo included — it shows the origin
  });

  it('works for the named/prefixed and bare forms, He + En', () => {
    for (const u of [
      'הישר ℓ: x = t(2,-2,0)',
      'line ℓ: x = t(2,-2,0)',
      'x = t(2,-2,0)', // bare — auto-binds the canonical ℓ (#275)
      'x=t(2,-2,0)',
      'x = t·(2,-2,0)',
    ]) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      expect(r.ok && r.commands[0], u).toMatchObject({ type: 'line3', anchor: [ZERO, ZERO, ZERO] });
    }
  });

  it('a POINT-PAIR name still puts its points on the line (ADR-3D-031 is untouched)', () => {
    const r = parse3('משוואת הישר AB היא x = t(0,2,1)');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands).toEqual([
      expect.objectContaining({ type: 'line3', name: 'AB', anchor: [ZERO, ZERO, ZERO] }),
      { type: 'on-line', id: 'A', line: 'AB' },
      { type: 'on-line', id: 'B', line: 'AB' },
    ]);
  });

  it('the anchored form is unchanged', () => {
    const r = parse3('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands[0]).toMatchObject({ type: 'line3', name: 'ℓ', param: 'm' });
  });

  it('a PLANE equation is still never stolen by the bare form', () => {
    for (const u of ['x-y+z=1', 'המישור x-y+z=1', 'x = 4']) {
      const r = parse3(u);
      // either another rule owns it or it defers — what must NOT happen is a line3 named ℓ
      expect(r.ok && r.commands.some((c) => c.type === 'line3' && 'name' in c && c.name === 'ℓ'), u).toBeFalsy();
    }
  });

  it('two params in one line are still refused (the no-CAS boundary, D3)', () => {
    expect(parse3('l1:x=t(0,m,2k-2)').ok).toBe(false);
  });
});
