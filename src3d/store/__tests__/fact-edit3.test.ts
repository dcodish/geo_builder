/**
 * B5 / D6 — edit-in-place for the 3-D builder (`replaceFact`), the operation the walkthrough found
 * missing here. The contract mirrors the complex builder's `editLine` where the models agree —
 * an edit keeps the statement's POSITION, re-parses, and runs the full acceptance chain; a refusal
 * changes nothing and names itself — and diverges exactly where the products' honesty surfaces
 * diverge: this product admits-and-FLAGS per row (the toggle auto-drop contract), so an edit that
 * orphans a dependent commits and the dependent's own row shows the refusal.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}

const st = () => useGeo3.getState();
const derived = () => derive3(st().facts, st().seed);

describe('replaceFact — in place, re-parsed, gated', () => {
  beforeEach(reset);

  it('a good edit replaces the statement at its position, keeping id and order', () => {
    st().submit('קובייה ABCD');
    st().submit("M אמצע BB'");
    const [cube, mid] = st().facts;
    expect(st().replaceFact(mid.id, "M אמצע AA'")).toBe(true);
    expect(st().facts.map((f) => f.id)).toEqual([cube.id, mid.id]); // same position, same id
    expect(st().facts[1].utterance).toBe("M אמצע AA'");
    expect(st().lastError).toBeNull();
    expect(derived().status[mid.id]).toBe('ok');
  });

  it('an edit the parser refuses changes nothing and names itself', () => {
    st().submit('קובייה ABCD');
    const fact = st().facts[0];
    expect(st().replaceFact(fact.id, 'דבר שאיננו נתמך כלל')).toBe(false);
    expect(st().facts[0].utterance).toBe('קובייה ABCD');
    expect(st().lastError).toEqual({ code: 'not-understood' });
  });

  it('an edit that breaks the FIGURE is refused keep-prior', () => {
    st().submit('קובייה ABCD');
    st().submit("M אמצע BB'");
    const mid = st().facts[1];
    // Q is undefined — the edited fact's own status goes bad, so the edit refuses
    expect(st().replaceFact(mid.id, 'M אמצע QW')).toBe(false);
    expect(st().facts[1].utterance).toBe("M אמצע BB'");
    expect(st().lastError).toEqual({ code: 'unknown-point', id: 'Q' });
  });

  it('an edit that orphans a DEPENDENT commits — the dependent flags on its own row (the toggle contract)', () => {
    st().submit('קובייה ABCD');
    st().submit("M אמצע BB'");
    const [cube, mid] = st().facts;
    // A tetrahedron has no B' — M's anchor vanishes, but the EDITED fact itself is fine.
    expect(st().replaceFact(cube.id, 'טטראדר KLMN')).toBe(true);
    const d = derived();
    expect(d.status[cube.id]).toBe('ok');
    expect(d.status[mid.id]).toEqual({ code: 'unknown-point', id: 'B' }); // flagged, not deleted
    // reversible exactly like a toggle: restore the cube and the dependent heals
    expect(st().replaceFact(cube.id, 'קובייה ABCD')).toBe(true);
    expect(derive3(st().facts, st().seed).status[mid.id]).toBe('ok');
  });

  it('editing a MUTED fact rewrites it, muted — it gates for real on re-enable', () => {
    st().submit('קובייה ABCD');
    st().submit("M אמצע BB'");
    const mid = st().facts[1];
    st().toggle(mid.id);
    expect(st().replaceFact(mid.id, "M אמצע CC'")).toBe(true);
    expect(st().facts[1].enabled).toBe(false); // still muted
    expect(st().facts[1].utterance).toBe("M אמצע CC'");
    expect(derived().status[mid.id]).toBe('disabled');
  });

});
