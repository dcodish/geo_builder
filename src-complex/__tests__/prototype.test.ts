import { describe, expect, it } from 'vitest';
import { absC, argDeg, formatCart, formatPolar, mul, sub } from '../engine/complex';
import { cPolar, cx } from '../value/value';
import { derive, deriveScene } from '../engine/model';
import { defaultFree, factNames, type Fact } from '../model/fact';
import { parseLine } from '../parser/parse';
import { useComplexStore } from '../store/useComplexStore';
import { hydrateSession } from '../app/submit';

const wrap360 = (d: number): number => ((d % 360) + 360) % 360;
const angDist = (d: number): number => Math.min(wrap360(d), 360 - wrap360(d));

const facts = (line: string): Fact[] => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`did not parse: ${line} (${r.key})`);
  return r.facts;
};
const fact = (line: string): Fact => facts(line)[0];

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

  it('bare expressions: complex ones plot; scalar calcs go to the DATA PANEL', () => {
    const s = derive([fact('z1 = 3+4i'), fact('|z1|'), fact('z1^2')], {});
    expect(s.errors).toEqual({});
    // |z1| is a calc: measures panel only, never a point on the plane
    expect(s.points.find((p) => p.label === '|z₁|')).toBeUndefined();
    expect(s.measures).toEqual([
      { key: 'show-|z1|', label: '|z₁|', value: 5, factId: 'show-|z1|' },
    ]);
    // z1^2 is a point: stays on the plane
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
    const p = mul(cPolar(2, 30), cPolar(3, 60));
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
    expect(formatPolar(cPolar(2, 150))).toBe('2·cis 150°');
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

describe('relations: driveOrCheck-lite (F3 modulus / F4 argument)', () => {
  it('the exemplar setup with r=1: arg(z1)-arg(z2)=90, |z1|=9, |z2|=12 → |z1-z2| = 15', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('arg(z1)-arg(z2)=90'); // implicit-creates z1, z2; drives arg(z1)
    st.addLine('|z1| = 9');
    st.addLine('|z2| = 12');
    st.addLine('|z1 - z2|');
    const s = derive(useComplexStore.getState().facts, {});
    expect(s.errors).toEqual({});
    expect(Object.values(s.checks).every((c) => c.ok)).toBe(true);
    const dist = s.measures.find((m) => m.label === '|z₁ - z₂|')!;
    expect(dist.value).toBeCloseTo(15); // the 9-12-15 right triangle
    useComplexStore.getState().clearAll();
  });

  it('check mode: a relation over determined numbers verifies ✓ or refutes ✗', () => {
    const s = derive(
      [fact('z1 = 1+i'), fact('arg(z1) = 45'), fact('arg z1 = 44')],
      {},
    );
    const ids = Object.keys(s.checks);
    expect(ids).toHaveLength(2);
    expect(s.checks[ids[0]]).toEqual({ ok: true, driven: false });
    expect(s.checks[ids[1]]).toEqual({ ok: false, driven: false });
  });

  it('modulus ratio drives: |z1| = 2|z2|', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('|z1| = 2|z2|');
    const s = derive(useComplexStore.getState().facts, {});
    const z1 = s.points.find((p) => p.label === 'z₁')!.z;
    const z2 = s.points.find((p) => p.label === 'z₂')!.z;
    expect(absC(z1)).toBeCloseTo(2 * absC(z2));
    useComplexStore.getState().clearAll();
  });

  it('a derived number typed BEFORE the constraint still reflects it (two-pass)', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('w = z1*z2');
    st.addLine('arg(z1)-arg(z2)=90');
    st.addLine('|z1| = 2');
    st.addLine('|z2| = 3');
    const s = derive(useComplexStore.getState().facts, {});
    const w = s.points.find((p) => p.label === 'w')!.z;
    const z1 = s.points.find((p) => p.label === 'z₁')!.z;
    const z2 = s.points.find((p) => p.label === 'z₂')!.z;
    expect(absC(w)).toBeCloseTo(6);
    expect(wrap360(argDeg(z1) - argDeg(z2))).toBeCloseTo(90);
    expect(angDist(argDeg(w) - argDeg(z1) - argDeg(z2))).toBeCloseTo(0);
    useComplexStore.getState().clearAll();
  });
});

describe('generic forms, re/im, configurations', () => {
  it('z = rcis(theta) and z2 = x+iy declare FREE numbers (the generic exam forms)', () => {
    expect(fact('z = rcis(theta)')).toMatchObject({ kind: 'free', name: 'z' });
    expect(fact('z1 = r cis θ')).toMatchObject({ kind: 'free', name: 'z1' });
    expect(fact('z2 = x+iy')).toMatchObject({ kind: 'free', name: 'z2' });
    expect(fact('w = a+bi')).toMatchObject({ kind: 'free', name: 'w' });
  });

  it('re/im are scalar functions; re(z)+i·im(z) rebuilds z', () => {
    const s = derive([fact('z1 = 3+4i'), fact('w = re(z1) + i*im(z1)')], {});
    expect(s.errors).toEqual({});
    const w = s.points.find((p) => p.label === 'w')!.z;
    expect(w.re).toBeCloseTo(3);
    expect(w.im).toBeCloseTo(4);
  });

  it('a bare im(...) plots ON the imaginary axis AND lists in the data panel', () => {
    const s = derive([fact('z1 = 3+4i'), fact('im(z1)'), fact('re(z1)')], {});
    const im = s.points.find((p) => p.label === 'im(z₁)')!;
    expect(im.z).toMatchObject({ re: 0, im: 4 }); // projection onto Im axis
    expect(im.valueOverride).toMatchObject({ re: 4, im: 0 }); // the value itself is real 4
    const re = s.points.find((p) => p.label === 're(z₁)')!;
    expect(re.z).toMatchObject({ re: 3, im: 0 }); // already on the Re axis
    expect(s.measures.map((m) => [m.label, m.value])).toEqual([
      ['im(z₁)', 4],
      ['re(z₁)', 3],
    ]);
  });

  it('mixed polar declarations lower to free + relation (nothing stated is dropped)', () => {
    // z = 2cis(θ): free with modulus pinned to 2
    const st = useComplexStore.getState();
    st.clearAll();
    expect(st.addLine('z = 2cis(θ)')).toBe(true);
    let s = derive(useComplexStore.getState().facts, {});
    expect(absC(s.points.find((p) => p.label === 'z')!.z)).toBeCloseTo(2);
    expect(Object.values(s.checks)).toEqual([{ ok: true, driven: true }]);
    st.clearAll();
    // w = r·cis(45): free with argument pinned to 45°
    expect(useComplexStore.getState().addLine('w = r cis 45')).toBe(true);
    s = derive(useComplexStore.getState().facts, {});
    expect(argDeg(s.points.find((p) => p.label === 'w')!.z)).toBeCloseTo(45);
    useComplexStore.getState().clearAll();
  });

  it('β normalizes like θ and α', () => {
    expect(fact('z = rcis(β)')).toMatchObject({ kind: 'free', name: 'z' });
  });

  it('hebrew re/im forms parse', () => {
    const s = derive([fact('z1 = 3+4i'), fact('w = החלק הממשי של z1')], {});
    expect(s.points.find((p) => p.label === 'w')!.z).toMatchObject({ re: 3, im: 0 });
  });

  it('another configuration resamples frees deterministically per seed', () => {
    const facts = [fact('z1 מספר מרוכב')];
    const a = derive(facts, {}, 0);
    const b = derive(facts, {}, 1);
    const a2 = derive(facts, {}, 0);
    expect(a.points[0].z).toEqual(a2.points[0].z); // same seed → same figure
    expect(a.points[0].z).not.toEqual(b.points[0].z); // new seed → new sample
  });

  it('constraints survive a configuration change', () => {
    const facts = [
      fact('arg(z1)-arg(z2)=90'),
      fact('z1 מספר מרוכב'),
      fact('z2 מספר מרוכב'),
    ];
    // note: rel first references frees declared later — store order normally prevents this;
    // here we mimic the store layout: frees before rel
    const ordered = [facts[1], facts[2], facts[0]];
    for (const seed of [0, 1, 2]) {
      const s = derive(ordered, {}, seed);
      const z1 = s.points.find((p) => p.label === 'z₁')!.z;
      const z2 = s.points.find((p) => p.label === 'z₂')!.z;
      expect(wrap360(argDeg(z1) - argDeg(z2))).toBeCloseTo(90);
    }
  });
});

describe('roots equations relate to their letter (operator ruling 2026-08-15)', () => {
  it('a fresh letter enumerates solutions AND reserves the bare letter', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z^3 = 8');
    // z is now related to z1..z3 — an unrelated z must refuse, naming the equation
    expect(st.addLine('z = 5')).toBe(false);
    expect(useComplexStore.getState().lastError).toMatchObject({ key: 'duplicate-name' });
    // and z is never implicit-created as a disconnected free point
    st.clearError();
    st.addLine('w = z*i');
    const s = derive(useComplexStore.getState().facts, {});
    expect(s.errors['def-w']).toEqual({ key: 'unknown-ref', detail: 'z' });
    useComplexStore.getState().clearAll();
  });

  it('an existing FREE letter is CONSTRAINED by its equation — even self-referentially', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z מספר מרוכב');
    st.addLine('w = z*z');
    st.addLine('z^3 = w'); // z³ = z² → z snaps to 1
    const s = derive(useComplexStore.getState().facts, {});
    const z = s.points.find((p) => p.label === 'z')!.z;
    expect(z.re).toBeCloseTo(1);
    expect(z.im).toBeCloseTo(0);
    const check = Object.values(s.checks)[0];
    expect(check).toEqual({ ok: true, driven: true });
    // the candidate set is represented: cube roots of w = 1
    const roots = s.points.filter((p) => p.kind === 'root');
    expect(roots).toHaveLength(3);
    expect(roots.map((p) => p.label)).toEqual(['z₁', 'z₂', 'z₃']);
    useComplexStore.getState().clearAll();
  });

  it('an existing DETERMINED letter turns the equation into a verified claim', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z1 = 2i');
    st.addLine('z1^2 = -4');
    st.addLine('z1^2 = 4');
    const s = derive(useComplexStore.getState().facts, {});
    const ids = Object.keys(s.checks);
    expect(ids).toHaveLength(2); // distinct equations about z1 are distinct facts
    expect(s.checks[ids[0]]).toEqual({ ok: true, driven: false });
    expect(s.checks[ids[1]]).toEqual({ ok: false, driven: false });
    useComplexStore.getState().clearAll();
  });
});

describe('shared parameters and inequalities (operator: |z1|=9r, arg(z2)<45)', () => {
  it('the r-generic exemplar: |z1|=9r, |z2|=12r, right angle → |z1-z2| = 15r for EVERY r', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('arg(z1)-arg(z2)=90');
    st.addLine('|z1| = 9r');
    st.addLine('|z2| = 12r');
    st.addLine('|z1 - z2|');
    const factList = useComplexStore.getState().facts;
    for (const seed of [0, 1, 2, 3]) {
      const s = derive(factList, {}, seed);
      expect(s.errors).toEqual({});
      expect(Object.values(s.checks).every((c) => c.ok)).toBe(true);
      const r = s.params.r;
      expect(r).toBeGreaterThan(0);
      const dist = s.measures.find((m) => m.label === '|z₁ - z₂|')!.value;
      expect(dist / r).toBeCloseTo(15); // linear in the SHARED r, any sample
      expect(s.params.r).not.toBe(derive(factList, {}, seed + 10).params.r); // r resamples
    }
    useComplexStore.getState().clearAll();
  });

  it('arg(z2) < 45 folds a violating free number into range and verifies', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('arg(z2) > 100'); // put it far outside first
    st.clearAll();
    st.addLine('arg(z2) < 45');
    const s = derive(useComplexStore.getState().facts, {});
    const a = argDeg(s.points.find((p) => p.label === 'z₂')!.z);
    expect(a).toBeLessThan(45);
    expect(Object.values(s.checks)[0].ok).toBe(true);
  });

  it('inequalities over determined numbers are pure checks', () => {
    const s = derive([fact('z1 = 1+i'), fact('arg(z1) < 30'), fact('arg z1 < 60'), fact('|z1| < 2')], {});
    const vals = Object.values(s.checks);
    expect(vals.map((c) => c.ok)).toEqual([false, true, true]);
    expect(vals.map((c) => c.driven)).toEqual([false, false, false]);
  });

  it('a z/w name in the parameter slot is refused (a modulus cannot equal a complex number)', () => {
    const r = parseLine('|z1| = 9w');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.key).toBe('parse-error');
  });

  it('constraints hold jointly across sweeps: equality then inequality', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('arg(z1)-arg(z2)=90');
    st.addLine('arg(z2) < 45');
    for (const seed of [0, 1, 2]) {
      const s = derive(useComplexStore.getState().facts, {}, seed);
      expect(Object.values(s.checks).every((c) => c.ok)).toBe(true);
      const z1 = s.points.find((p) => p.label === 'z₁')!.z;
      const z2 = s.points.find((p) => p.label === 'z₂')!.z;
      expect(argDeg(z2)).toBeLessThan(45);
      expect(wrap360(argDeg(z1) - argDeg(z2))).toBeCloseTo(90);
    }
    useComplexStore.getState().clearAll();
  });
});

describe('quadrant givens (F5: רביע)', () => {
  it('folds a free number into the stated quadrant, both languages', () => {
    const cases: Array<[string, number, number]> = [
      ['z1 ברביע הראשון', 0, 90],
      ['z2 נמצא ברביע השלישי', 180, 270],
      ['z3 in the second quadrant', 90, 180],
      ['z4 quadrant 4', 270, 360],
    ];
    for (const [line, lo, hi] of cases) {
      const st = useComplexStore.getState();
      st.clearAll();
      expect(st.addLine(line)).toBe(true);
      for (const seed of [0, 1, 2]) {
        const s = derive(useComplexStore.getState().facts, {}, seed);
        const p = s.points[0];
        const a = argDeg(p.z);
        expect(a).toBeGreaterThan(lo);
        expect(a).toBeLessThan(hi);
        expect(Object.values(s.checks)[0].ok).toBe(true);
      }
      st.clearAll();
    }
  });

  it('verifies (not drives) over a determined number', () => {
    const s = derive([fact('z1 = 1+i'), fact('z1 ברביע הראשון'), fact('z1 ברביע השני')], {});
    const vals = Object.values(s.checks);
    expect(vals[0]).toEqual({ ok: true, driven: false });
    expect(vals[1]).toEqual({ ok: false, driven: false });
  });

  it('the FULL exemplar setup paragraph holds jointly across seeds', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('arg(z1)-arg(z2)=90');
    st.addLine('|z1| = 9r');
    st.addLine('|z2| = 12r');
    st.addLine('z2 ברביע הראשון');
    st.addLine('arg(z2) < 45');
    st.addLine('|z1 - z2|');
    for (const seed of [0, 1, 2, 3, 4]) {
      const s = derive(useComplexStore.getState().facts, {}, seed);
      expect(s.errors).toEqual({});
      expect(Object.values(s.checks).every((c) => c.ok)).toBe(true);
      const z2 = s.points.find((p) => p.label === 'z₂')!.z;
      expect(argDeg(z2)).toBeGreaterThan(0);
      expect(argDeg(z2)).toBeLessThan(45);
      const dist = s.measures.find((m) => m.label === '|z₁ - z₂|')!.value;
      expect(dist / s.params.r).toBeCloseTo(15);
    }
    useComplexStore.getState().clearAll();
  });
});

describe('symbolic parameter forms in the calc panel (הביעו באמצעות r)', () => {
  it('|z1-z2| displays as 15r while r is undetermined — every seed', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('arg(z1)-arg(z2)=90');
    st.addLine('|z1| = 9r');
    st.addLine('|z2| = 12r');
    st.addLine('|z1 - z2|');
    for (const seed of [0, 1, 2]) {
      const s = deriveScene(useComplexStore.getState().facts, {}, seed);
      expect(s.measures[0].form).toBe('15r');
    }
    useComplexStore.getState().clearAll();
  });

  it('quadratic dependence reads r², parameter-independent stays numeric', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('|z1| = 3r');
    st.addLine('|z1|*|z1|'); // 9r²
    st.addLine('z2 = 3+4i');
    st.addLine('|z2|'); // 5, no r in it
    const s = deriveScene(useComplexStore.getState().facts, {});
    expect(s.measures.find((m) => m.label === '|z₁|*|z₁|')!.form).toBe('9r²');
    const plain = s.measures.find((m) => m.label === '|z₂|')!;
    expect(plain.form).toBeUndefined();
    expect(plain.value).toBeCloseTo(5);
    useComplexStore.getState().clearAll();
  });

  it('without parameters, deriveScene is plain derive', () => {
    const s = deriveScene([fact('z1 = 3+4i'), fact('|z1|')], {});
    expect(s.measures[0].form).toBeUndefined();
    expect(s.measures[0].value).toBe(5);
  });
});

describe('shapes over O, and area/perimeter driveOrCheck (F6/F7)', () => {
  it('name-runs draw: Oz1 is a segment, מרובע oz1z2z3 a closed polygon; vertices auto-create', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    expect(st.addLine('Oz1')).toBe(true);
    expect(st.addLine('z1z2')).toBe(true);
    expect(st.addLine('מרובע oz1z2z3')).toBe(true);
    const s = derive(useComplexStore.getState().facts, {});
    expect(s.errors).toEqual({});
    // 1 + 1 open edges + 4 closed polygon edges
    expect(s.segments).toHaveLength(6);
    // z1,z2,z3 implicit-created; O is never a point row
    expect(s.points.map((p) => p.label).sort()).toEqual(['z₁', 'z₂', 'z₃']);
    useComplexStore.getState().clearAll();
  });

  it('arity honesty: משולש with four vertices refuses; O is unclaimable', () => {
    expect(parseLine('משולש oz1z2z3').ok).toBe(false);
    const st = useComplexStore.getState();
    st.clearAll();
    expect(st.addLine('o = 5')).toBe(false);
    expect(useComplexStore.getState().lastError).toEqual({
      key: 'duplicate-name',
      detail: 'O = (0,0)',
    });
    st.clearAll();
  });

  it('the exemplar part ב END-TO-END: the area given pins θ, the perimeter answers 60r', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('arg(z1)-arg(z2)=90');
    st.addLine('|z1| = 9r');
    st.addLine('|z2| = 12r');
    st.addLine('z2 ברביע הראשון');
    st.addLine('arg(z2) < 45');
    st.addLine('|z3| = 20r');
    st.addLine('arg(z3) + arg(z2) = 0');
    st.addLine('מרובע oz1z2z3');
    st.addLine('שטח המרובע oz1z2z3 הוא 150r²');
    st.addLine('היקף oz1z2z3');
    for (const seed of [0, 1]) {
      const s = deriveScene(useComplexStore.getState().facts, {}, seed);
      expect(s.errors).toEqual({});
      expect(Object.values(s.checks).every((c) => c.ok)).toBe(true);
      // the area given DROVE the free angle to θ = arctan ½ ≈ 26.565°
      const z2 = s.points.find((p) => p.label === 'z₂')!.z;
      expect(argDeg(z2)).toBeCloseTo(26.565, 1);
      // and the perimeter reads 60r — part ב's answer, in r as the exam demands
      expect(s.measures.find((m) => m.label.includes('היקף'))!.form).toBe('60r');
    }
    useComplexStore.getState().clearAll();
  });
});

describe('save/load (suffix -complex.json: source lines replayed through the real parse path)', () => {
  it('round-trips the exemplar: same facts, same figure, freePos/seed/view restored', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    const lines = [
      'arg(z1)-arg(z2)=90',
      '|z1| = 9r',
      '|z2| = 12r',
      'z2 ברביע הראשון',
      'מרובע oz1z2z3',
      '|z3| = 20r',
      'היקף oz1z2z3',
    ];
    for (const l of lines) st.addLine(l);
    st.nextConfig();
    st.setFree('z9', { re: 1, im: 2 }); // a stray drag override survives too
    const saved = st.serialize();
    expect(saved.app).toBe('complex-builder');
    const before = derive(useComplexStore.getState().facts, saved.freePos, saved.seed);

    st.clearAll();
    expect(useComplexStore.getState().facts).toHaveLength(0);
    expect(hydrateSession(JSON.parse(JSON.stringify(saved)))).toBe(true);
    const after = useComplexStore.getState();
    expect(after.seed).toBe(saved.seed);
    expect(after.freePos).toEqual(saved.freePos);
    const replayed = derive(after.facts, after.freePos, after.seed);
    expect(replayed.points.map((p) => [p.label, p.z])).toEqual(
      before.points.map((p) => [p.label, p.z]),
    );
    expect(replayed.measures).toEqual(before.measures);
    useComplexStore.getState().clearAll();
  });

  it('a lowered line saves ONCE and re-lowers on load', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z = 2cis(θ)'); // lowers to free + |z|=2
    const saved = st.serialize();
    expect(saved.lines).toEqual(['z = 2cis(θ)']);
    st.clearAll();
    hydrateSession(saved);
    expect(useComplexStore.getState().facts.map((f) => f.kind)).toEqual(['free', 'rel']);
    useComplexStore.getState().clearAll();
  });

  it('refuses foreign or corrupt data without touching the session', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z1 = 3+4i');
    expect(hydrateSession({ app: 'geo-builder', lines: [] })).toBe(false);
    expect(hydrateSession('garbage')).toBe(false);
    expect(useComplexStore.getState().facts).toHaveLength(1);
    useComplexStore.getState().clearAll();
  });
});

describe('sequences — the list form (F9, operator ruling)', () => {
  it('exemplar ג: one unknown listed name is DEFINED by the others (z4 = z2²/z1)', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z1 = 2');
    st.addLine('z2 = 2i');
    st.addLine('z1, z2, z4 סדרה הנדסית');
    const s = derive(useComplexStore.getState().facts, {});
    expect(s.errors).toEqual({});
    const z4 = s.points.find((p) => p.label === 'z₄')!.z;
    expect(z4.re).toBeCloseTo(-2); // (2i)²/2
    expect(z4.im).toBeCloseTo(0);
    expect(Object.values(s.checks)[0]).toEqual({ ok: true, driven: true });
    expect(s.segments).toHaveLength(2); // the progression chain
    useComplexStore.getState().clearAll();
  });

  it('all determined → verify: geometric ✓/✗, arithmetic ✓ (English too)', () => {
    const s = derive(
      [
        fact('z1 = 1'), fact('z2 = 2'), fact('z3 = 4'), fact('z5 = 5'),
        fact('z1, z2, z3 סדרה הנדסית'),
        fact('z1, z2, z5 סדרה הנדסית'),
        fact('z1, z2, z3 is an arithmetic sequence'),
      ],
      {},
    );
    const vals = Object.values(s.checks);
    expect(vals.map((c) => c.ok)).toEqual([true, false, false]);
    const s2 = derive([fact('z1 = 1'), fact('z2 = 1+i'), fact('z3 = 1+2i'), fact('z1, z2, z3 סדרה חשבונית')], {});
    expect(Object.values(s2.checks)[0].ok).toBe(true);
  });

  it('a middle geometric unknown has two branches — cycled by configuration', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z1 = 1');
    st.addLine('z3 = 4');
    st.addLine('z1, z2, z3 סדרה הנדסית');
    const a = derive(useComplexStore.getState().facts, {}, 0);
    const b = derive(useComplexStore.getState().facts, {}, 1);
    const za = a.points.find((p) => p.label === 'z₂')!.z;
    const zb = b.points.find((p) => p.label === 'z₂')!.z;
    expect(za.re).toBeCloseTo(2);
    expect(zb.re).toBeCloseTo(-2); // the other square root
    expect(Object.values(a.checks)[0].ok).toBe(true);
    expect(Object.values(b.checks)[0].ok).toBe(true);
    useComplexStore.getState().clearAll();
  });

  it('a FREE listed term is driven to fit', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z3 מספר מרוכב');
    st.addLine('z1 = 1');
    st.addLine('z2 = 2i');
    st.addLine('z1, z2, z3 סדרה הנדסית');
    const s = derive(useComplexStore.getState().facts, {});
    const z3 = s.points.find((p) => p.label === 'z₃')!.z;
    expect(z3.re).toBeCloseTo(-4); // (2i)²/1
    expect(z3.im).toBeCloseTo(0);
    expect(Object.values(s.checks)[0]).toEqual({ ok: true, driven: true });
    useComplexStore.getState().clearAll();
  });

  it('the full exemplar through ג: z4 rides the r-parameter — |z4| = 16r', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    for (const l of [
      'arg(z1)-arg(z2)=90', '|z1| = 9r', '|z2| = 12r', 'z2 ברביע הראשון', 'arg(z2) < 45',
      '|z3| = 20r', 'arg(z3) + arg(z2) = 0', 'שטח המרובע oz1z2z3 הוא 150r²',
      'z1, z2, z4 סדרה הנדסית', '|z4|',
    ])
      st.addLine(l);
    const s = deriveScene(useComplexStore.getState().facts, {}, 0);
    expect(s.errors).toEqual({});
    expect(Object.values(s.checks).every((c) => c.ok)).toBe(true);
    // |z4| = |z2|²/|z1| = 144r²/9r = 16r — expressed in r, as the exam demands
    expect(s.measures.find((m) => m.label === '|z₄|')!.form).toBe('16r');
    useComplexStore.getState().clearAll();
  });
});

describe('part ד: anonymous solution sets and count claims (F8 collision + F12)', () => {
  it('an equation whose indexed names are taken enumerates ANONYMOUSLY instead of refusing', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z1 = 2');
    st.addLine('z2 = 2i');
    expect(st.addLine('z^4 = z1*z2')).toBe(true); // z1..z4 would collide → anonymous set
    const s = derive(useComplexStore.getState().facts, {});
    expect(s.errors).toEqual({});
    const roots = s.points.filter((p) => p.kind === 'root');
    expect(roots).toHaveLength(4);
    expect(roots.every((p) => p.bare)).toBe(true);
    expect(roots.map((p) => p.label)).toEqual(['①', '②', '③', '④']);
    // the letter itself stays reserved
    expect(st.addLine('z = 5')).toBe(false);
    useComplexStore.getState().clearAll();
  });

  it('THE FULL EXEMPLAR, parts setup+א+ב+ג+ד: the figure answers every part', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    for (const l of [
      'arg(z1)-arg(z2)=90',
      '|z1| = 9r',
      '|z2| = 12r',
      'z2 ברביע הראשון',
      'arg(z2) < 45',
      '|z1 - z2|', // א
      '|z3| = 20r',
      'arg(z3) + arg(z2) = 0',
      'שטח המרובע oz1z2z3 הוא 150r²', // ב given
      'היקף oz1z2z3', // ב ask
      'z1, z2, z4 סדרה הנדסית', // ג
      'מרובע oz2z3z4',
      'z^5 = z1*z2^3*z4', // ד equation (RHS collapses to z2^5)
    ])
      st.addLine(l);
    for (const seed of [0, 1]) {
      const s = deriveScene(useComplexStore.getState().facts, {}, seed);
      expect(s.errors).toEqual({});
      expect(Object.values(s.checks).every((c) => c.ok)).toBe(true);
      expect(s.measures.find((m) => m.label === '|z₁ - z₂|')!.form).toBe('15r'); // א
      expect(s.measures.find((m) => m.label.includes('היקף'))!.form).toBe('60r'); // ב
      // ד is answered VISUALLY (operator ruling): five anonymous solutions on their circle,
      // one of them exactly z2 — the student counts against the drawn quadrilateral
      const roots = s.points.filter((p) => p.kind === 'root');
      expect(roots).toHaveLength(5);
      expect(roots.every((p) => p.bare)).toBe(true);
      const z2 = s.points.find((p) => p.label === 'z₂')!.z;
      expect(roots.some((p) => absC(sub(p.z, z2)) < 1e-6 * absC(z2))).toBe(true);
    }
    useComplexStore.getState().clearAll();
  });
});

describe('sequence word orders (#598: keyword-first)', () => {
  it('the operator phrasing סדרה הנדסית z1,z2,z3 parses like the list-first form', () => {
    for (const line of [
      'סדרה הנדסית z1,z2,z3',
      'סדרה חשבונית: z1, z2, z3',
      'הסדרה ההנדסית z1,z2,z3',
      'geometric sequence z1,z2,z3',
      'z1, z2, z3 סדרה הנדסית',
    ]) {
      const f = fact(line);
      expect(f.kind).toBe('seq');
      if (f.kind === 'seq') expect(f.names).toEqual(['z1', 'z2', 'z3']);
    }
    expect(fact('סדרה הנדסית z1,z2,z3')).toMatchObject({ stype: 'geo' });
    expect(fact('סדרה חשבונית: z1, z2, z3')).toMatchObject({ stype: 'ari' });
  });
});

describe('drive-target fairness (#599: sequence vs a later constraint on one term)', () => {
  it("the operator's exact session: sequence over three frees, then z1 pinned to Q1 — both hold", () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('סדרה הנדסית z1,z2,z3');
    st.addLine('z1 ברביע הראשון'); // the operator's form; keyword-first also parses now:
    expect(parseLine('ברביע הראשון z2').ok).toBe(true);
    for (const seed of [0, 1, 2]) {
      const s = derive(useComplexStore.getState().facts, {}, seed);
      expect(s.errors).toEqual({});
      const vals = Object.values(s.checks);
      expect(vals).toHaveLength(2);
      expect(vals.every((c) => c.ok)).toBe(true); // a valid figure EXISTS — the tool must find it
      const a = argDeg(s.points.find((p) => p.label === 'z₁')!.z);
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(90);
    }
    useComplexStore.getState().clearAll();
  });
});

describe('equation-direction fairness (#600: z1^3=z3 drives z3 when z1 is claimed)', () => {
  it("the operator's session: sequence + z1-in-Q1 + z1^3=z3 — everything holds", () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('סדרה הנדסית z1,z2,z3');
    st.addLine('z1 ברביע הראשון');
    st.addLine('z1^3 = z3');
    for (const seed of [0, 1, 2]) {
      const s = derive(useComplexStore.getState().facts, {}, seed);
      expect(s.errors).toEqual({});
      const vals = Object.values(s.checks);
      expect(vals).toHaveLength(3);
      expect(vals.every((c) => c.ok)).toBe(true);
      const z1 = s.points.find((p) => p.label === 'z₁')!.z;
      const z3 = s.points.find((p) => p.label === 'z₃')!.z;
      expect(argDeg(z1)).toBeGreaterThan(0);
      expect(argDeg(z1)).toBeLessThan(90); // the quadrant kept its claim
      const cube = mul(mul(z1, z1), z1);
      expect(absC(sub(cube, z3))).toBeLessThan(1e-6 * Math.max(1, absC(z3))); // z3 absorbed the equation
      // a forward drive shows NO candidate constellation (#602) — there was no choice to show
      expect(s.points.filter((p) => p.kind === 'root')).toHaveLength(0);
      expect(s.circles).toHaveLength(0);
    }
    useComplexStore.getState().clearAll();
  });
});

describe('drag policy (#603: constraint-adjusted numbers are not draggable)', () => {
  it('driven numbers lose the drag handle; untouched frees keep it', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('q מספר מרוכב'); // explicit declaration, fully unconstrained
    st.addLine('z9 מספר מרוכב'); // fully unconstrained
    st.addLine('|z1| = 2'); // implicit-creates z1, then pins its modulus
    const s = derive(useComplexStore.getState().facts, {});
    const by = (l: string) => s.points.find((p) => p.label === l)!;
    expect(by('q').freeName).toBe('q');
    expect(by('z₉').freeName).toBe('z9');
    expect(by('z₁').freeName).toBeUndefined(); // modulus-driven → button territory
    useComplexStore.getState().clearAll();
  });

  it("the operator's session: every constrained number is undraggable, checks stay green", () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('סדרה הנדסית z1,z2,z3');
    st.addLine('z1 ברביע הראשון');
    st.addLine('z1^3 = z3');
    const s = derive(useComplexStore.getState().facts, {});
    expect(Object.values(s.checks).every((c) => c.ok)).toBe(true);
    for (const l of ['z₂', 'z₃']) expect(s.points.find((p) => p.label === l)!.freeName).toBeUndefined();
    useComplexStore.getState().clearAll();
  });
});

describe('general equations (#605: -2z1 = conj(z3), one-unknown Newton)', () => {
  it("the operator's line alone: both numbers implicit-created, the equation drives and holds", () => {
    const st = useComplexStore.getState();
    st.clearAll();
    expect(st.addLine('-2z1=conj(z3)')).toBe(true);
    for (const seed of [0, 1]) {
      const s = derive(useComplexStore.getState().facts, {}, seed);
      expect(s.errors).toEqual({});
      const check = Object.values(s.checks)[0];
      expect(check).toEqual({ ok: true, driven: true });
      const z1 = s.points.find((p) => p.label === 'z₁')!.z;
      const z3 = s.points.find((p) => p.label === 'z₃')!.z;
      expect(mul(cx(-2), z1).re).toBeCloseTo(z3.re); // conj: re equal
      expect(mul(cx(-2), z1).im).toBeCloseTo(-z3.im); // conj: im negated
    }
    useComplexStore.getState().clearAll();
  });

  it('with a determined side, the unknown solves exactly', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z3 = 4+2i');
    st.addLine('-2z1 = conj(z3)');
    const s = derive(useComplexStore.getState().facts, {});
    const z1 = s.points.find((p) => p.label === 'z₁')!.z;
    expect(z1.re).toBeCloseTo(-2); // conj(4+2i)/(-2) = -2+i
    expect(z1.im).toBeCloseTo(1);
    expect(Object.values(s.checks)[0].ok).toBe(true);
    useComplexStore.getState().clearAll();
  });

  it('fully determined equations verify or refute', () => {
    const s = derive(
      [fact('z1 = 1'), fact('z3 = -2'), fact('-2z1 = conj(z3)'), fact('-2z1 = conj(z3)+1')],
      {},
    );
    const vals = Object.values(s.checks);
    expect(vals[0]).toEqual({ ok: true, driven: false });
    expect(vals[1]).toEqual({ ok: false, driven: false });
  });
});

describe('acceptance gate (#606: a new statement never breaks earlier ones)', () => {
  it("the operator's session: the incompatible-as-solved equation is REFUSED, earlier facts stay green", () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('סדרה הנדסית z1,z2,z3');
    st.addLine('z1 ברביע הראשון');
    st.addLine('z1^3 = z3');
    const factCount = useComplexStore.getState().facts.length;
    expect(st.addLine('-2z1 = conj(z3)')).toBe(false); // blame lands on the NEWEST statement
    const after = useComplexStore.getState();
    expect(after.lastError).toEqual({ key: 'incompatible', detail: 'z1^3 = z3' });
    expect(after.facts).toHaveLength(factCount); // nothing landed, nothing harmed
    const s = derive(after.facts, after.freePos, after.seed);
    expect(Object.values(s.checks).every((c) => c.ok)).toBe(true);
    useComplexStore.getState().clearAll();
  });

  it('a refuted pure CLAIM about determined values still lands (feedback, not damage)', () => {
    const st = useComplexStore.getState();
    st.clearAll();
    st.addLine('z1 = 1+i');
    expect(st.addLine('arg(z1) < 30')).toBe(true); // its own X is the answer to the claim
    const s = derive(useComplexStore.getState().facts, {});
    expect(Object.values(s.checks)[0].ok).toBe(false);
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
