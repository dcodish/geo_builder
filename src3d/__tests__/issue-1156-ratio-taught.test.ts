/**
 * #1156 — «AA'=3BC» IS ASKED ABOUT, NEVER CALLED FALSE. And «AB:BC = 3:1» DRIVES.
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

describe('#1156 — the bare-label ratio is taught, not refuted', () => {
  /** The operator's own table, every spelling the student actually tried. */
  it.each([
    ["AA'=3BC", 'A', "A'", 'B', 'C', 3],
    ["AA'=2BC", 'A', "A'", 'B', 'C', 2],
    ["AD=0.5AA'", 'A', 'D', 'A', "A'", 0.5],
  ])('«%s» asks which reading was meant', (line, a1, b1, a2, b2, c) => {
    const { err } = build(['תיבה', line]);
    expect(err, `${line} must not be refuted`).toEqual({ code: 'ambiguous-vector-length', a1, b1, a2, b2, c });
  });

  it('…and never says the student is wrong', () => {
    for (const line of ["AA'=3BC", "AA'=2BC", "AD=0.5AA'"]) {
      st().clear();
      build(['תיבה', line]);
      expect((st().lastError as { code: string } | null)?.code, line).not.toBe('claim-refuted');
    }
  });

  /**
   * THE TEACHING HALF (#778 — *non-canonical input is TAUGHT, never silently accepted*). The refusal
   * carries the student's OWN letters so the message can show the two spellings that work; a bare
   * "which did you mean?" would leave them no way forward, which is worse than the bug.
   */
  it('the refusal carries the pairs the message needs', () => {
    const { err } = build(['תיבה', "AA'=3BC"]);
    expect(err).toMatchObject({ a1: 'A', b1: "A'", a2: 'B', b2: 'C', c: 3 });
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

  it('the rider NON-chain still refuses as a claim, not as an ambiguity', () => {
    const { err } = build(['מקבילון', "E על AA'", "AE = 2*A'E"]);
    expect((err as { code: string } | null)?.code).toBe('claim-refuted');
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

  /** A bare `c = 1` pair stays the PARSER's clarification — it never reaches the apply boundary. */
  it('the bare c=1 form keeps the parser’s generic clarification', () => {
    const { err } = build(['פירמידה ABCDS שבסיסה ריבוע', 'AS = AB']);
    expect(err).toEqual({ code: 'ambiguous-vector-length' });
  });

  /** A scalar given on the same bare box is untouched — it was never ambiguous. */
  it('«AB=4» still resizes the box', () => {
    const { err } = build(['תיבה', 'AB=4']);
    expect(err).toBeNull();
    expect(lenOf('A', 'B')).toBeCloseTo(4, 6);
  });
});
