import { describe, expect, it } from 'vitest';
import { absC, argDeg, cisDeg, cx, formatCart, formatPolar, mul } from '../engine/complex';
import { defaultFree, derive, factNames, type Fact } from '../engine/model';
import { parseLine } from '../parser/parse';
import { useComplexStore } from '../store/useComplexStore';

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
