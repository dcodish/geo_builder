import { describe, expect, it } from 'vitest';
import { absC, argDeg, cisDeg, cx, formatCart, formatPolar, mul } from '../engine/complex';
import { defaultFree, derive, type Fact } from '../engine/model';
import { parseLine } from '../parser/parse';
import { useComplexStore } from '../store/useComplexStore';

const fact = (line: string): Fact => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`did not parse: ${line} (${r.key})`);
  return r.fact;
};

describe('parser', () => {
  it('cartesian literal', () => {
    const s = derive([fact('z1 = 3+4i')], {});
    expect(s.points[0].z.re).toBeCloseTo(3);
    expect(s.points[0].z.im).toBeCloseTo(4);
    expect(s.points[0].label).toBe('z₁');
  });

  it('polar cis literal, degrees', () => {
    const s = derive([fact('z2 = 2cis150')], {});
    expect(absC(s.points[0].z)).toBeCloseTo(2);
    expect(argDeg(s.points[0].z)).toBeCloseTo(150);
  });

  it('hebrew free declaration', () => {
    const f = fact('z1 מספר מרוכב');
    expect(f.kind).toBe('free');
  });

  it('hebrew conjugate form', () => {
    const f = fact('w = הצמוד של z1');
    expect(f.kind).toBe('def');
    const s = derive([fact('z1 = 3+4i'), f], {});
    expect(s.points[1].z.im).toBeCloseTo(-4);
  });

  it('strips invisible bidi controls at the parse seam', () => {
    const f = fact('w ‏= ‫3+4i‬');
    expect(f.kind).toBe('def');
  });

  it('normalizes unicode superscripts to powers', () => {
    const s = derive([fact('z1 = 1+i'), fact('w = z1³')], {});
    // (1+i)^3 = -2+2i
    expect(s.points[1].z.re).toBeCloseTo(-2);
    expect(s.points[1].z.im).toBeCloseTo(2);
  });

  it('rejects nonsense with not-handled (the LLM-fallback seam)', () => {
    const r = parseLine('שלום עולם');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.key).toBe('not-handled');
  });
});

describe('engine', () => {
  it('multiplication adds arguments and multiplies moduli', () => {
    const p = mul(cisDeg(2, 30), cisDeg(3, 60));
    expect(absC(p)).toBeCloseTo(6);
    expect(argDeg(p)).toBeCloseTo(90);
  });

  it('roots of z^3 = 8 form the radius-2 constellation at 0/120/240', () => {
    const s = derive([fact('z^3 = 8')], {});
    expect(s.points).toHaveLength(3);
    expect(s.circles[0].r).toBeCloseTo(2);
    const args = s.points.map((p) => argDeg(p.z));
    expect(args[0]).toBeCloseTo(0);
    expect(args[1]).toBeCloseTo(120);
    expect(args[2]).toBeCloseTo(240);
    expect(s.points.map((p) => p.label)).toEqual(['z₁', 'z₂', 'z₃']);
  });

  it('derived numbers follow their inputs; unknown refs error without killing later facts', () => {
    const facts = [fact('w = z9*2'), fact('u = 1+i')];
    const s = derive(facts, {});
    expect(s.errors[facts[0].id]).toEqual({ key: 'unknown-ref', detail: 'z9' });
    expect(s.points.map((p) => p.label)).toEqual(['u']);
  });

  it('free numbers place deterministically by NAME, not insertion order', () => {
    const a = derive([fact('q1 מספר מרוכב')], {});
    const b = derive([fact('z5 = 1'), fact('q1 מספר מרוכב')], {});
    expect(b.points[1].z).toEqual(a.points[0].z);
    expect(defaultFree('q1')).toEqual(a.points[0].z);
  });

  it('formatting: pure imaginary and polar', () => {
    expect(formatCart(cx(0, 1))).toBe('i');
    expect(formatCart(cx(3, -1))).toBe('3-i');
    expect(formatPolar(cisDeg(2, 150))).toBe('2·cis 150°');
  });
});

describe('store honesty', () => {
  it('duplicate name refuses and names the CONFLICTING statement', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    expect(st.addLine('z1 = 3+4i')).toBe(true);
    expect(st.addLine('z1 = 5')).toBe(false);
    expect(useComplexStore.getState().lastError).toEqual({
      key: 'duplicate-name',
      detail: 'z1 = 3+4i',
    });
    useComplexStore.getState().clearAll();
  });

  it('re-issuing the identical statement is idempotent', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z1 = 3+4i');
    expect(st.addLine('z1 = 3+4i')).toBe(true);
    expect(useComplexStore.getState().facts).toHaveLength(1);
    useComplexStore.getState().clearAll();
  });

  it('roots equation reserves its solution names', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z^3 = 8');
    expect(st.addLine('z2 = 5')).toBe(false);
    useComplexStore.getState().clearAll();
  });
});
