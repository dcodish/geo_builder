import { describe, expect, it } from 'vitest';
import { absC, argDeg, cisDeg, cx, formatCart, formatPolar, mul } from '../engine/complex';
import { defaultFree, derive, factNames, type Fact } from '../engine/model';
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

  it('exam typography: the §2b exemplar equation pastes verbatim (ADR-CX-003 P2)', () => {
    // Z⁵ = Z₁Z₂³Z₄ with real subscripts/superscripts ≡ z^5 = z1*z2^3*z4
    const f = fact('Z⁵ = Z₁Z₂³Z₄');
    expect(f.kind).toBe('roots');
    const s = derive(
      [fact('z1 = 2cis100'), fact('z2 = 1cis50'), fact('z4 = 3cis10'), f],
      {},
    );
    // rhs = z1·z2³·z4 = 2·1·3 cis(100+150+10) → roots on circle r=6^(1/5), five of them
    const roots = s.points.filter((p) => p.kind === 'root');
    expect(roots).toHaveLength(5);
    expect(absC(roots[0].z)).toBeCloseTo(Math.pow(6, 1 / 5));
    expect(argDeg(roots[0].z)).toBeCloseTo(52); // 260/5
  });

  it('symbol-palette forms all parse: |z|, 1/(z), conj(z), cis, ^, ·, °', () => {
    const s = derive(
      [
        fact('z1 = 3+4i'),
        fact('w1 = |z1|'), // abs → real 5
        fact('w2 = 1/(z1)'), // reciprocal
        fact('w3 = conj(z1)*z1'), // z·z̄ = |z|²
        fact('w4 = 2·z1^2'),
        fact('w5 = 1cis90°'),
      ],
      {},
    );
    expect(s.errors).toEqual({});
    const by = (l: string) => s.points.find((p) => p.label === l)!.z;
    expect(by('w₁')).toMatchObject({ re: 5, im: 0 });
    expect(by('w₂').re).toBeCloseTo(3 / 25);
    expect(by('w₂').im).toBeCloseTo(-4 / 25);
    expect(by('w₃').re).toBeCloseTo(25);
    expect(by('w₃').im).toBeCloseTo(0);
    expect(by('w₄').re).toBeCloseTo(-14);
    expect(by('w₄').im).toBeCloseTo(48);
    expect(by('w₅').re).toBeCloseTo(0);
    expect(by('w₅').im).toBeCloseTo(1);
  });

  it('hebrew reciprocal form: ההופכי של', () => {
    const s = derive([fact('z1 = 2i'), fact('w = ההופכי של z1')], {});
    expect(s.errors).toEqual({});
    const w = s.points.find((p) => p.label === 'w')!.z;
    expect(w.re).toBeCloseTo(0);
    expect(w.im).toBeCloseTo(-0.5);
  });

  it('exam z-bar overbar notation is the conjugate (2024 locus typography)', () => {
    const s = derive([fact('z1 = 3+4i'), fact('w = z̅1 * i')], {});
    expect(s.errors).toEqual({});
    // conj(z1)·i = (3-4i)i = 4+3i
    const w = s.points.find((p) => p.label === 'w')!.z;
    expect(w.re).toBeCloseTo(4);
    expect(w.im).toBeCloseTo(3);
  });

  it('bare expression lines plot as anonymous points labeled by themselves', () => {
    const s = derive([fact('z1 = 3+4i'), fact('|z1|'), fact('z1^2')], {});
    expect(s.errors).toEqual({});
    const abs = s.points.find((p) => p.label === '|z₁|')!;
    expect(abs.z).toMatchObject({ re: 5, im: 0 });
    const sq = s.points.find((p) => p.label === 'z₁^2')!;
    expect(sq.z.re).toBeCloseTo(-7);
    expect(sq.z.im).toBeCloseTo(24);
  });

  it('a bare expression auto-creates its z/w references too', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    expect(st.addLine('z1^5')).toBe(true);
    const { facts } = useComplexStore.getState();
    expect(facts.map((f) => f.kind)).toEqual(['free', 'show']);
    expect(derive(facts, {}).errors).toEqual({});
    useComplexStore.getState().clearAll();
  });

  it('a bare z/w name IS its free declaration; a bare other word stays not-handled', () => {
    const f = fact('z10');
    expect(f).toMatchObject({ kind: 'free', name: 'z10' });
    const r = parseLine('hello');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.key).toBe('not-handled');
  });

  it('re-issuing the same bare expression is idempotent', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z1 = 3+4i');
    st.addLine('|z1|');
    expect(st.addLine('| z1 |')).toBe(true); // same normalized expression
    expect(useComplexStore.getState().facts).toHaveLength(2);
    useComplexStore.getState().clearAll();
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

describe('implicit complex names (ADR-CX-004: z*/w* are complex by convention)', () => {
  it('referencing undefined z-family names auto-creates visible draggable frees', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    expect(st.addLine('w = z1*z2')).toBe(true);
    const { facts } = useComplexStore.getState();
    expect(facts.map((f) => f.id)).toEqual(['free-z1', 'free-z2', 'def-w']);
    expect(facts[0]).toMatchObject({ kind: 'free', implicit: true });
    const s = derive(facts, {});
    expect(s.errors).toEqual({});
    expect(s.points.filter((p) => p.freeName)).toHaveLength(2);
    useComplexStore.getState().clearAll();
  });

  it('an explicit definition UPGRADES an implicit free instead of refusing', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('w = z1*i');
    expect(st.addLine('z1 = 3+4i')).toBe(true);
    const { facts } = useComplexStore.getState();
    expect(facts.filter((f) => factNames(f).includes('z1'))).toHaveLength(1);
    expect(facts.find((f) => f.id === 'def-z1')).toBeDefined();
    // w now follows the explicit value: (3+4i)·i = -4+3i
    const s = derive(facts, {});
    const w = s.points.find((p) => p.label === 'w')!;
    expect(w.z.re).toBeCloseTo(-4);
    expect(w.z.im).toBeCloseTo(3);
    useComplexStore.getState().clearAll();
  });

  it('non-z/w names stay explicit: unknown ref still errors honestly', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('u = q*2');
    const s = derive(useComplexStore.getState().facts, {});
    expect(s.errors['def-u']).toEqual({ key: 'unknown-ref', detail: 'q' });
    useComplexStore.getState().clearAll();
  });

  it('solutions of an equation are referencable named points', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z^3 = 8');
    st.addLine('w = z2*z3');
    const s = derive(useComplexStore.getState().facts, {});
    expect(s.errors).toEqual({});
    // z2·z3 = (2cis120)(2cis240) = 4cis0
    const w = s.points.find((p) => p.label === 'w')!;
    expect(w.z.re).toBeCloseTo(4);
    expect(w.z.im).toBeCloseTo(0);
    useComplexStore.getState().clearAll();
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
