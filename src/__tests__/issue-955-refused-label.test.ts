/**
 * #955 ([ADR-491](../../docs/06-decisions.md#adr-491)) — A REFUSED MEASURE WRITES NOTHING ON THE FIGURE.
 *
 * The operator, playing round #949 T2 (2026-09-09): *"despite getting an honest error message that it is
 * impossible, the diagram still put 70 instead of alpha."*
 *
 * Measured before the fix: «משולש ABC» · «זווית BCA = 50» · «זווית CAB = 70» · «זווית ABC = α» · «α = 70»
 * refused the α line and still labelled B with **70°**, on an angle the engine had drawn at **60.00°**,
 * with `violations = []` — because a label is not a constraint. The three labels summed to 190°.
 *
 * The ruling (issue #955, 2026-09-09): a refused measure writes NOTHING — not its number, and not its
 * letter either («α = 70» still reads green in the fact list, so «α» on the corner would still say 70 to
 * a student reading both). The corner shows no value, or whatever a SURVIVING constraint gives it.
 */
import { describe, expect, it } from 'vitest';
import { competingSymbols } from '@/store/paramChips';
import { factsOf, replayFacts } from './scenario-pipeline';
import { allStepsOk, angle, at } from './scenarios-harness';

const REPORTED = ['משולש ABC', 'זווית BCA = 50', 'זווית CAB = 70', 'זווית ABC = α', 'α = 70'];

type Fig = ReturnType<typeof replayFacts>;
const angleLabelAt = (fig: Fig, v: string) => fig.labels.angles.find((x) => x.vertex === v);
const lengthLabel = (fig: Fig, a: string, b: string) => fig.labels.lengths.find((l) => [l.a, l.b].sort().join('') === [a, b].sort().join(''));
/** The status of the fact a given utterance produced — the anti-vacuity handle: "no label" proves nothing
 *  unless the statement really was the refused one. */
const statusOf = (fig: Fig, facts: ReturnType<typeof factsOf>, utterance: string) => {
  const f = facts.find((x) => x.utterance === utterance);
  expect(f, `fact for «${utterance}»`).toBeDefined();
  return fig.status[f!.id];
};

describe('#955 — the reported figure stops claiming a magnitude it does not have', () => {
  const facts = factsOf(REPORTED);
  const fig = replayFacts(facts);

  it('the α line is the refused one, and the corner it names carries NO label', () => {
    expect(fig.lastError, 'the figure is genuinely over-constrained').toMatch(/cannot hold/);
    // #956 ([ADR-492](../../docs/06-decisions.md#adr-492)) moved the BLAME to the value line — «α = 70»
    // is the statement that turned a feasible figure infeasible. The α-definition is green again, and
    // that is exactly why this file matters: green does NOT mean labelled. Its constraint was still
    // refused, so it never reached the success branch that writes a label.
    expect(statusOf(fig, facts, 'α = 70'), 'the value line carries the refusal').not.toBe('ok');
    expect(statusOf(fig, facts, 'זווית ABC = α'), 'and naming an angle stays green').toBe('ok');
    expect(angle(at(fig, 'A'), at(fig, 'B'), at(fig, 'C')), 'the figure draws 60° at B').toBeCloseTo(60, 2);
    expect(angleLabelAt(fig, 'B'), 'nothing is written at B — not 70°, and not α').toBeUndefined();
  });

  it('the two angles that DID hold keep their values — the fix removes a lie, not information', () => {
    expect(angleLabelAt(fig, 'A')?.text, 'A really is 70°, so its label is true').toBe('70°');
    expect(angleLabelAt(fig, 'C')?.text).toBe('50°');
    expect(angle(at(fig, 'B'), at(fig, 'A'), at(fig, 'C'))).toBeCloseTo(70, 2);
    expect(angle(at(fig, 'A'), at(fig, 'C'), at(fig, 'B'))).toBeCloseTo(50, 2);
    // the three printed labels summed to 190° before; the two that remain are the triangle's own truth
    const printed = fig.labels.angles.map((a) => Number(a.text.replace('°', ''))).reduce((s, v) => s + v, 0);
    expect(printed).toBe(120);
  });

  it('the verifier agrees the drawing is honest — and would have said so about a lying label', () => {
    // The pre-fix figure returned `violations = []` WITH the false 70°: the verifier checked constraints
    // only. ADR-491 makes it check labels too (locked directly in engine/__tests__/label-honesty.test.ts);
    // on the fixed figure there is nothing for it to flag.
    expect(fig.violations).toEqual([]);
  });

  it('no chip offers α — with no label on the corner, nothing on the figure competes for it', () => {
    // The ruling's corollary for #948: when a valued parameter's value is refused, the chip shows no value.
    // The chip exists only where a label carries both forms (ADR-488's competing predicate); the refused
    // corner carries no label, so α competes nowhere and the «α = 70» row gets no chip.
    expect(competingSymbols(fig.labels).has('α')).toBe(false);
    for (const l of fig.labels.angles) expect(l.sym, `label at ${l.vertex} does not offer α`).not.toBe('α');
  });
});

describe('#955 — the four lanes of the ruling’s table (angle/length × symbol/numeric)', () => {
  it('length, symbol: «AB = 3» · «AB = x» · «x = 8» — the refused x-line no longer prints 8 on a 3-long segment', () => {
    const facts = factsOf(['משולש ABC', 'AB = 3', 'AB = x', 'x = 8']);
    const fig = replayFacts(facts);
    expect(fig.lastError).toMatch(/cannot hold/);
    // as above: after ADR-492 the VALUE line is the blamed one, and «AB = x» is green but unapplied.
    expect(statusOf(fig, facts, 'x = 8'), 'the value line carries the refusal').not.toBe('ok');
    expect(statusOf(fig, facts, 'AB = x'), 'and the symbolic length stays green').toBe('ok');
    const drawn = Math.hypot(at(fig, 'A').x - at(fig, 'B').x, at(fig, 'A').y - at(fig, 'B').y);
    expect(drawn, '|AB| is the 3 that held').toBeCloseTo(3, 3);
    expect(lengthLabel(fig, 'A', 'B')?.text, 'the surviving given labels the segment').toBe('3');
    expect(fig.violations).toEqual([]);
  });

  it('angle, numeric: a refused concrete «∠ABC = 80» shows nothing — the lane that was already honest, locked with the other', () => {
    const facts = factsOf(['משולש ABC', 'זווית BCA = 50', 'זווית CAB = 70', 'זווית ABC = 80']);
    const fig = replayFacts(facts);
    expect(fig.lastError).toMatch(/cannot hold/);
    expect(statusOf(fig, facts, 'זווית ABC = 80')).not.toBe('ok');
    expect(angleLabelAt(fig, 'B')).toBeUndefined();
  });

  it('length, numeric: «AB = 3» then a refused «AB = 8» keeps the 3', () => {
    const facts = factsOf(['משולש ABC', 'AB = 3', 'AB = 8']);
    const fig = replayFacts(facts);
    expect(fig.lastError).toMatch(/cannot hold/);
    expect(statusOf(fig, facts, 'AB = 8')).not.toBe('ok');
    expect(lengthLabel(fig, 'A', 'B')?.text).toBe('3');
  });
});

describe('#955 — what must NOT change', () => {
  it('a measure that HOLDS still prints its value, and keeps its #948 chip', () => {
    const fig = replayFacts(factsOf(['משולש ABC', 'זווית BCA = 50', 'זווית CAB = 60', 'זווית ABC = α', 'α = 70']));
    expect(fig.lastError, 'this one is satisfiable').toBeNull();
    const B = angleLabelAt(fig, 'B')!;
    expect(B.text, 'the value the student gave').toBe('70°');
    expect(B.letter, 'and the switchable form survives — the chip still works').toBe('α');
    expect(B.sym).toBe('α');
    expect(competingSymbols(fig.labels).has('α')).toBe(true);
  });

  it('a symbolic measure whose letter is never valued is untouched — it held, constraining nothing', () => {
    const fig = replayFacts(factsOf(['משולש ABC', 'זווית BCA = 50', 'זווית CAB = 70', 'זווית ABC = α']));
    expect(fig.lastError, 'α is free, so this builds').toBeNull();
    expect(angleLabelAt(fig, 'B')?.text).toBe('α');
  });

  it('the #474 flagship — «זווית GBA = 37» that DRIVES the figure is still printed on it', () => {
    // The regression this fix is most likely to break: the label comes from the FACT, not from a surviving
    // constraint (the drive consumes it). It still comes from the fact — a fact that HELD.
    const fig = replayFacts(factsOf(['ריבוע ABCD', 'נקודה G על AD', 'זווית GBA = 37']));
    allStepsOk(fig);
    const lab = fig.labels.angles.find((a) => a.vertex === 'B' && [a.ray1, a.ray2].sort().join('') === 'AG');
    expect(lab?.text).toBe('37°');
    expect(angle(at(fig, 'A'), at(fig, 'B'), at(fig, 'G'))).toBeCloseTo(37, 3);
  });

  it('a measure honoured on the ADR-104 deferral RETRY labels exactly like an in-order one', () => {
    // «DE = x» is typed before D and E exist; it fails in order and lands on the retry once «משולש DEF»
    // has introduced them. The label seam now runs on SUCCESS, so it has to run there too — a fix that
    // gated only the in-order pass would silently drop every label the deferral ever rescued.
    const facts = factsOf(['משולש ABC', 'AB = 3x', 'DE = x', 'משולש DEF']);
    const fig = replayFacts(facts);
    allStepsOk(fig);
    expect(lengthLabel(fig, 'A', 'B')?.text).toBe('3x');
    expect(lengthLabel(fig, 'D', 'E')?.text, 'the retried measure labels its segment').toBe('x');
    const len = (p: string, q: string) => Math.hypot(at(fig, p).x - at(fig, q).x, at(fig, p).y - at(fig, q).y);
    expect(len('A', 'B'), 'and the proportion it states holds').toBeCloseTo(3 * len('D', 'E'), 3);
  });

  it('a MUTED measure is not treated as refused — it simply does not label', () => {
    const facts = factsOf(['משולש ABC', 'זווית ABC = α', 'α = 70']);
    const muted = facts.map((f) => (f.utterance === 'זווית ABC = α' ? { ...f, enabled: false } : f));
    const fig = replayFacts(muted);
    expect(angleLabelAt(fig, 'B'), 'a disabled fact annotates nothing').toBeUndefined();
  });

  it('an ordinary figure labels exactly as before', () => {
    const fig = replayFacts(factsOf(['משולש ABC', 'AB = 5', 'זווית ABC = 40']));
    expect(fig.lastError).toBeNull();
    expect(fig.labels.lengths.map((l) => l.text)).toContain('5');
    expect(fig.labels.angles.map((a) => a.text)).toContain('40°');
    expect(fig.violations).toEqual([]);
  });
});
