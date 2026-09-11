/**
 * #977 (ADR-3D-241) — one copula vocabulary, one angle noun, and a COEFFICIENT on the symbol.
 *
 * Filed on the operator's mid-round direction in round #974, after they asked whether #969's 2-D fix
 * should cover 3-D too. The measured answer was **no, and 3-D does not have that bug**: every symbolic
 * angle escalated honestly, so no student ever got a wrong figure. What 3-D had were three narrower
 * gaps, and the first two are the same *shape* as #969 — a vocabulary spelled inline, per rule:
 *
 * | | before |
 * | --- | --- |
 * | «זווית ABC שווה 40» | ○ not-handled, while «זווית ABC היא 40» built — «שווה» was in no rule |
 * | "angle ABC = α" | ○ not-handled, while «זווית ABC = α» built — the marker required "**the** angle" |
 * | «זווית ABC = 2α» | ○ not-handled behind EVERY copula, `=` included — no coefficient anywhere |
 *
 * Two rules carried their own copies of the angle noun and the copula, and the copies had already
 * drifted: `vertexAngleClaim` took a bare "angle ABC", `angleMarker` did not, and neither knew «שווה».
 * ADR-498's answer applies unchanged — define the vocabulary once — and its code does not, because a
 * 3-D angle is a `claim` over two segments rather than 2-D's vertex-anchored `set-angle`.
 *
 * The coefficient is the capability half. It rides the MARK, and the value that later lands on the
 * letter is multiplied by it, so the existing `symbol-value` → angle path drives it with no new command.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { useGeo3, derive3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const build = (lines: string[]) => {
  reset();
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  return { st, pos: derive3(st.facts, st.seed).resolved.positions };
};
/** The drawn angle at `v`, in degrees — the figure's own answer, not the recorded given. */
const angleAt = (P: Map<string, { x: number; y: number; z: number }>, p: string, v: string, q: string) => {
  const [A, V, Q] = [P.get(p)!, P.get(v)!, P.get(q)!];
  const u = { x: A.x - V.x, y: A.y - V.y, z: A.z - V.z };
  const w = { x: Q.x - V.x, y: Q.y - V.y, z: Q.z - V.z };
  const dot = u.x * w.x + u.y * w.y + u.z * w.z;
  const lu = Math.hypot(u.x, u.y, u.z);
  const lw = Math.hypot(w.x, w.y, w.z);
  return (Math.acos(Math.max(-1, Math.min(1, dot / (lu * lw)))) * 180) / Math.PI;
};

/** Every angle noun, and every copula. A spelling added to either list must pass without touching a rule. */
const NAMINGS = ['זווית ABC', 'הזווית ABC', 'angle ABC', 'the angle ABC', '∠ABC'];
const COPULAS = ['=', 'היא', 'הוא', 'שווה', 'שווה ל-', 'is', 'equals'];

beforeEach(reset);

describe('#977 — the copula and the angle noun are shared, so no cell is missing', () => {
  for (const naming of NAMINGS) {
    it.each(COPULAS)(`${naming} «%s» 40 — a NUMBER still claims`, (copula) => {
      const r = parse3(`${naming} ${copula} 40`);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.commands.find((c) => c.type === 'claim')).toMatchObject({ claim: { type: 'angle-seg-eq', deg: 40 } });
    });

    it.each(COPULAS)(`${naming} «%s» 2α — a COEFFICIENT + symbol marks with its coefficient`, (copula) => {
      const r = parse3(`${naming} ${copula} 2α`);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.commands.find((c) => c.type === 'angle-mark')).toMatchObject({ vertex: 'B', p: 'A', q: 'C', label: 'α', coef: 2 });
    });

    it.each(COPULAS)(`${naming} «%s» α — the BARE symbol keeps working`, (copula) => {
      const r = parse3(`${naming} ${copula} α`);
      expect(r.ok).toBe(true);
      if (r.ok) {
        const mark = r.commands.find((c) => c.type === 'angle-mark') as { label?: string; coef?: number };
        expect(mark.label).toBe('α');
        expect(mark.coef, 'no coefficient means no coefficient — not 1').toBeUndefined();
      }
    });
  }

  it('the LATIN symbol works too, not just Greek', () => {
    expect(parse3('זווית ABC שווה 2x')).toMatchObject({ ok: true });
    const r = parse3('זווית ABC שווה 2x');
    if (r.ok) expect(r.commands.find((c) => c.type === 'angle-mark')).toMatchObject({ label: 'x', coef: 2 });
  });
});

describe('#977 — the coefficient DRIVES the figure', () => {
  it('«זווית ABC = 2α» then «α = 30» draws 60°', () => {
    // The whole point: the coefficient is not decoration. The existing symbol-value → angle path
    // multiplies by it, so no new command was needed.
    const { st, pos } = build(['משולש ABC', 'זווית ABC = 2α', 'α = 30']);
    expect(st.lastError).toBeNull();
    expect(angleAt(pos, 'A', 'B', 'C')).toBeCloseTo(60, 1);
  });

  it('a bare symbol is unchanged — «= α» with «α = 40» draws 40°', () => {
    const { st, pos } = build(['משולש ABC', 'זווית ABC = α', 'α = 40']);
    expect(st.lastError).toBeNull();
    expect(angleAt(pos, 'A', 'B', 'C')).toBeCloseTo(40, 1);
  });

  it('the copula does not change the figure — «שווה 2α» with «α = 25» draws 50°', () => {
    const { st, pos } = build(['משולש ABC', 'זווית ABC שווה 2α', 'α = 25']);
    expect(st.lastError).toBeNull();
    expect(angleAt(pos, 'A', 'B', 'C')).toBeCloseTo(50, 1);
  });
});

describe('#977 — a shared letter with DIFFERENT coefficients is a ratio, not an equality', () => {
  it('«∠ABC = 2α» and «∠BCA = α» with «α = 30» draw 60° and 30°', () => {
    // ADR-3D-052 makes a reused label an EQUALITY. With coefficients that is no longer true: the two
    // angles state a RATIO, and pinning them equal would assert a given the student did not give.
    const { st, pos } = build(['משולש ABC', 'זווית ABC = 2α', 'זווית BCA = α', 'α = 30']);
    expect(st.lastError).toBeNull();
    expect(angleAt(pos, 'A', 'B', 'C'), '∠ABC = 2α').toBeCloseTo(60, 1);
    expect(angleAt(pos, 'B', 'C', 'A'), '∠BCA = α').toBeCloseTo(30, 1);
  });

  it('the SAME coefficient still states an equality (ADR-3D-052 unchanged)', () => {
    const { st, pos } = build(['משולש ABC', 'זווית ABC = α', 'זווית BCA = α', 'α = 50']);
    expect(st.lastError).toBeNull();
    expect(angleAt(pos, 'A', 'B', 'C')).toBeCloseTo(50, 1);
    expect(angleAt(pos, 'B', 'C', 'A')).toBeCloseTo(50, 1);
  });
});

describe('#977 — what must NOT change', () => {
  it('the right-angle WORD form is untouched', () => {
    for (const u of ['זווית ABC ישרה', 'angle ABC is right', 'זוית B ישרה']) {
      expect(parse3(u).ok, u).toBe(true);
    }
  });

  it('a QUERY is still a query, not a marker', () => {
    // scope3 owns «∠ABC=?» and «∠ABC?»; a coefficient regex that swallowed them would turn a question
    // into a silent mark.
    for (const u of ['∠ABC=?', '∠ABC?']) expect(parse3(u).ok, u).toBe(false);
  });

  it('a bare angle reference still marks, with no label', () => {
    const r = parse3('∠ABC');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const m = r.commands.find((c) => c.type === 'angle-mark') as { label?: string; coef?: number };
      expect(m.label).toBeUndefined();
      expect(m.coef).toBeUndefined();
    }
  });

  it('a numeric value never becomes a coefficient without a symbol', () => {
    // «זווית ABC = 40» must reach the CLAIM lane. If the marker's coefficient group ever matched a bare
    // number the statement would become a valueless mark and the student's 40 would vanish.
    const r = parse3('זווית ABC = 40');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.commands.some((c) => c.type === 'angle-mark')).toBe(false);
      expect(r.commands.find((c) => c.type === 'claim')).toMatchObject({ claim: { deg: 40 } });
    }
  });
});
