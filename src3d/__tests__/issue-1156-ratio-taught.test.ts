/**
 * #1156 — «AA'=3BC» IS NEVER CALLED FALSE (since ADR-3D-391 Am. 1 it builds as lengths). And «AB:BC = 3:1» DRIVES.
 *
 * **Live in production.** From the prod log (session `i8gw52ej`): one student, 7 submits, 4 spellings,
 * every one answered `claim-refuted` — the tool telling them their true statement was false — after
 * which they cleared the canvas and rebuilt the figure without the relation.
 *
 * Nothing in the figure refuted anything. A bare `תיבה` has free edge lengths, and `AB=4` on the same
 * box resizes it happily. The tool was refuting a given against proportions **it had sampled itself**,
 * which is [ADR-052](../../docs/06-decisions.md#adr-052)'s cardinal sin.
 *
 * ## Two halves, two different answers, and only one of them needed a ruling
 *
 * - **`XY = k·ZW`** has two readings. Between two non-collinear edges the vector reading is genuinely
 *   impossible; the length reading cannot simply be assumed either, because #748 ruled that where the
 *   readings disagree the tool **refuses rather than picks**, and ADR-3D-010 ruled that a coefficient
 *   commits to the vector lane at parse time. **Operator ruling, 2026-09-17: refuse and TEACH the bar
 *   form.** Both prior rulings stand.
 * - **`A:B = p:q`** has no vector reading at all, so there is nothing to ask. It simply drives.
 *
 * Shipping the first without the second would leave the student one keystroke from the same false
 * accusation they had just escaped, which is why they are one item.
 *
 * ## What must NOT move — the escalation tripwire from round #1169's attempt
 *
 * That round tried to *route* the sentence to the length lane and took four locks red. The cases those
 * locks defend are asserted here too, so a future change that drifts back into that option fails on
 * this file rather than on theirs.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { mintFree, segmentEquationKind3, vectorReadingDefines3 } from '../engine/apply';
import { parse3 } from '../parser/parse3';

const st = () => useGeo3.getState();
const submit = (u: string) => st().submit(u);

beforeEach(() => {
  st().clear();
});

const build = (lines: string[]) => {
  lines.forEach(submit);
  return { err: st().lastError, facts: st().facts.length };
};
const lenOf = (a: string, b: string) => {
  const pos = derive3(st().facts, st().seed).positions;
  const P = pos.get(a)!;
  const Q = pos.get(b)!;
  return Math.hypot(Q.x - P.x, Q.y - P.y, Q.z - P.z);
};

describe('#1156 — the bare-label ratio is never refuted; since ADR-3D-391 Am. 1 it builds as lengths', () => {
  /**
   * The operator's own table, every spelling the student actually tried. Between two non-collinear edges the vector
   * reading is impossible, so by the operator's rule of 2026-10-30 (PR #2605: *"if only one can be true, we will
   * assume this is the case"*) the length reading is taken and built — the 2026-09-17 "ask and teach" answer is
   * kept only where both readings can hold and differ.
   */
  it.each([
    ["AA'=3BC", 'A', "A'", 'B', 'C', 3],
    ["AA'=2BC", 'A', "A'", 'B', 'C', 2],
    ["AD=0.5AA'", 'A', 'D', 'A', "A'", 0.5],
  ])('«%s» builds as lengths', (line, a1, b1, a2, b2, c) => {
    const { err } = build(['תיבה', line]);
    expect(err, `${line} must not be refuted`).toBeNull();
    expect(lenOf(a1, b1) / lenOf(a2, b2)).toBeCloseTo(c, 6);
  });

  it('…and never says the student is wrong', () => {
    for (const line of ["AA'=3BC", "AA'=2BC", "AD=0.5AA'"]) {
      st().clear();
      build(['תיבה', line]);
      expect((st().lastError as { code: string } | null)?.code, line).not.toBe('claim-refuted');
    }
  });

  /** The spelling it teaches must actually work — otherwise the advice is a dead end. */
  it('the taught bar spelling builds and solves to the stated ratio', () => {
    const { err } = build(['תיבה', "|AA'|=3|BC|"]);
    expect(err).toBeNull();
    expect(lenOf('A', "A'") / lenOf('B', 'C')).toBeCloseTo(3, 6);
  });
});

describe('#1156 — a ratio between two lengths DRIVES', () => {
  it('«AB:BC = 3:1» on a bare box builds and solves', () => {
    const { err } = build(['תיבה', 'AB:BC = 3:1']);
    expect(err).toBeNull();
    expect(lenOf('A', 'B') / lenOf('B', 'C')).toBeCloseTo(3, 6);
  });

  it('it reaches the same figure as the bar spelling', () => {
    build(['תיבה', 'AB:BC = 3:1']);
    const viaRatio = lenOf('A', 'B') / lenOf('B', 'C');
    st().clear();
    build(['תיבה', '|AB|=3|BC|']);
    expect(viaRatio).toBeCloseTo(lenOf('A', 'B') / lenOf('B', 'C'), 6);
  });

  /**
   * THE COUNTER-DIRECTION — the claim stays the final arbiter. Making a ratio drive must not make a
   * FALSE ratio acceptable; a figure already pinned to 3:1 must still refuse 5:1.
   */
  it('a contradictory ratio still refuses', () => {
    const { err } = build(['תיבה', 'AB=6', 'BC=2', 'AB:BC = 5:1']);
    expect((err as { code: string } | null)?.code).toBe('claim-refuted');
  });
});

describe('#1156 — what must NOT move (round #1169’s escalation tripwire)', () => {
  /**
   * #748: the rider family. The chain form builds, and the NON-chain form's refusal is a DECIDED
   * answer — *"the vector reading and the length reading disagree; believing either would be a
   * guess"* — not this ambiguity. Both are left exactly as they were.
   */
  it('the rider chain still builds', () => {
    const { err } = build(['מקבילון', "E על AA'", "AE = 2EA'"]);
    expect(err).toBeNull();
  });

  /**
   * #1783 (ADR-3D-391 Am. 1), the operator's rule of 2026-10-30: *"if only one can be true, we will assume this is the
   * case"*. «AE = 2·A'E» puts E at t = 2 as vectors (off AA') and at ⅔ as lengths: only the length reading can hold,
   * so it builds as lengths — never refuted as arithmetic, and no question.
   */
  it('the rider NON-chain builds as lengths, never refuted as arithmetic', () => {
    const { err } = build(['מקבילון', "E על AA'", "AE = 2*A'E"]);
    expect(err).toBeNull();
  });

  /**
   * ADR-3D-010's affine lane: with an unknown point the identical sentence DEFINES it. Asking the
   * ambiguity there would refuse the 2018 gate outright, which is what made the parser-level fix
   * impossible.
   */
  it('a relation that DEFINES a point is never asked about', () => {
    const { err } = build(['קובייה ABCD', "A'K = 4/5 DN"]);
    expect((err as { code: string } | null)?.code).not.toBe('ambiguous-vector-length');
  });

  /**
   * The engine lowers OTHER commands to this same shape — `point-on-segment3` on an existing id is
   * ADR-3D-047's "vec-rel dual". Those are not sentences anyone wrote, so the question is asked only
   * at the outermost call. This is the case that caught it.
   */
  it('an internal lowering to the same shape is not mistaken for a student’s sentence', () => {
    const { err } = build(['קובייה ABCD', 'M אמצע BC']);
    expect((err as { code: string } | null)?.code).not.toBe('ambiguous-vector-length');
  });

  /** #1680 (ADR-3D-391 Am. 1): «AS = AB» as vectors would put S on B, so only the length reading can hold — it builds. */
  it('the bare c=1 form builds as lengths where its vector reading cannot hold', () => {
    const { err } = build(['פירמידה ABCDS שבסיסה ריבוע', 'AS = AB']);
    expect(err).toBeNull();
  });

  /** A scalar given on the same bare box is untouched — it was never ambiguous. */
  it('«AB=4» still resizes the box', () => {
    const { err } = build(['תיבה', 'AB=4']);
    expect(err).toBeNull();
    expect(lenOf('A', 'B')).toBeCloseTo(4, 6);
  });
});

/**
 * #2804 (ADR-3D-460, amending ADR-3D-391): «משולש ABC» · «TA = TB» with T not yet drawn was refused «no position of T».
 * The new-point gate read every segment equation naming a new letter as a vector DEFINITION of it; as vectors
 * A − T = B − T, T cancels and the "definition" says only A = B. A new point is a definition only when the vector
 * reading solves for it (a nonzero net coefficient); a cancelled one goes to the two-reading trial, whose vector reading
 * cannot hold, so the line is read as lengths and T is created free on the bisector plane of AB.
 */
describe('#2804 — a new point the vector reading cannot place is read as lengths', () => {
  const triangle = () => {
    st().clear();
    submit('משולש ABC');
    return derive3(st().facts, st().seed).construction;
  };
  const cmdOf = (line: string) => {
    const r = parse3(line);
    if (!r.ok) throw new Error(line);
    return r.commands[0];
  };

  it.each([
    ['TA = TB', 'two-readings', false],
    ['AT = BT', 'two-readings', false],
    ['TA = 1TB', 'two-readings', false],
    ['TA = TC', 'two-readings', false],
    ['AT = TB', 'vector', true],
    ['TA = 2TB', 'vector', true],
    ['TA = AB', 'vector', true],
    ['AT = -TB', 'vector', false],
  ])('«%s» over a triangle: %s', (line, kind, defines) => {
    const c = triangle();
    expect(segmentEquationKind3(c, cmdOf(line))).toBe(kind);
    expect(vectorReadingDefines3(c, cmdOf(line))).toBe(defines);
  });

  it('a letter the line itself created stays new to its reading (the mint pass cannot turn it into a definition)', () => {
    const minted = mintFree(triangle(), ['T']);
    // T on the figure, but created FOR this line: still new to it, still cancelled
    expect(segmentEquationKind3(minted, cmdOf('AT = BT'), new Set(['T']))).toBe('two-readings');
    expect(vectorReadingDefines3(minted, cmdOf('AT = BT'), new Set(['T']))).toBe(false);
    // …while a created letter the vector reading DOES solve for keeps the line a definition
    expect(segmentEquationKind3(minted, cmdOf('AT = TB'), new Set(['T']))).toBe('vector');
  });

  /** The issue's own line, at every seed: T free and equidistant, the notice, the length reading, the triangle unmoved. */
  it.each([0, 1, 2, 3])('«משולש ABC» · «TA = TB» builds at seed %i', (seed) => {
    st().clear();
    submit('משולש ABC');
    const base = derive3(st().facts, seed).positions;
    submit('TA = TB');
    expect(st().lastError).toBeNull();
    const facts = st().facts;
    const d = derive3(facts, seed);
    const line = facts[facts.length - 1];
    expect(d.status[line.id]).toBe('ok');
    expect(d.construction.points.get('T')?.kind).toBe('free3');
    expect(d.readings[line.id]).toBe('length');
    expect(d.created[line.id]).toEqual(['T']);
    const P = d.positions;
    const len = (a: string, b: string) => Math.hypot(P.get(a)!.x - P.get(b)!.x, P.get(a)!.y - P.get(b)!.y, P.get(a)!.z - P.get(b)!.z);
    expect(Math.abs(len('T', 'A') - len('T', 'B'))).toBeLessThan(1e-6);
    for (const id of ['A', 'B', 'C']) {
      const p = base.get(id)!;
      const q = P.get(id)!;
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), id).toBeLessThan(1e-9);
    }
  });

  /** The plan's table: every host and mirror spelling builds; a new point never lands on another letter. */
  it.each([
    [['משולש ABC', 'AT = BT']],
    [['משולש ABC', 'TA = TC']],
    [['מרובע ABCD', 'TA = TB']],
    [["קובייה ABCDA'B'C'D'", 'TA = TB']],
    [['פירמידה ABCS', 'TA = TB']],
    [['TA = TB']],
    [['AT = BT']],
  ])('%j builds with T equidistant and no two letters on one dot', (lines) => {
    st().clear();
    lines.forEach(submit);
    expect(st().lastError).toBeNull();
    const line = lines[lines.length - 1];
    const [p, q] = line.replace(/\s/g, '').split('=').map((s) => s.replace('T', ''));
    const d = derive3(st().facts, st().seed);
    expect(d.coincidences).toEqual([]);
    expect(Math.abs(lenOf('T', p) - lenOf('T', q))).toBeLessThan(1e-6);
  });

  /** What must NOT move: a vector reading that DOES place the new point is still a definition (ADR-3D-010). */
  it('«AT = TB» still defines T as the midpoint', () => {
    st().clear();
    build(['משולש ABC', 'AT = TB']);
    expect(st().lastError).toBeNull();
    expect(lenOf('A', 'T')).toBeCloseTo(lenOf('T', 'B'), 9);
    expect(lenOf('A', 'B')).toBeCloseTo(2 * lenOf('A', 'T'), 9);
  });
});
