/**
 * #956 ([ADR-492](../../docs/06-decisions.md#adr-492)) — BLAME THE LAST STATEMENT THAT TURNED THE
 * FIGURE INFEASIBLE.
 *
 * The operator, playing round #949 T2 (2026-09-09): *"when alpha cannot be 70 … the failing line should
 * be the alpha=70 and not that the angle is alpha."* Ruling, verbatim: *"maybe the issue is with the
 * last command that added the issue? before it was added, all was good and now its not"* — formally,
 * the shortest infeasible prefix, blame its last fact.
 *
 * Measured before the fix: «זווית ABC = α» carried the refusal while «α = 70» — the line that supplied
 * the impossible number — sat green, because `set-var` lowers to ZERO commands and blame works on
 * constraints.
 */
import { describe, expect, it } from 'vitest';
import { utteranceForError } from '@/app/errorSubject';
import { factsOf, replayFacts } from './scenario-pipeline';
import type { Fact } from '@/store/geoStore';

type Fig = ReturnType<typeof replayFacts>;

/** The STUDENT's rows that are red — by utterance, which is what the panel shows. */
const redRows = (fig: Fig, facts: Fact[]): string[] => {
  const out: string[] = [];
  for (const f of facts) {
    const s = fig.status[f.id];
    if (s !== 'ok' && s !== 'disabled' && s !== undefined && f.utterance && !out.includes(f.utterance)) out.push(f.utterance);
  }
  return out;
};
const run = (steps: string[]) => {
  const facts = factsOf(steps);
  return { facts, fig: replayFacts(facts) };
};

const ORDER_A = ['משולש ABC', 'זווית BCA = 50', 'זווית CAB = 70', 'זווית ABC = α', 'α = 70'];
const ORDER_B = ['משולש ABC', 'זווית BCA = 50', 'α = 70', 'זווית ABC = α', 'זווית CAB = 70'];

describe('#956 — the value line takes the blame it earned', () => {
  it('ordering A: «α = 70» is red and «זווית ABC = α» is green', () => {
    const { facts, fig } = run(ORDER_A);
    expect(fig.lastError, 'the figure really is over-constrained').toMatch(/cannot hold/);
    expect(redRows(fig, facts)).toEqual(['α = 70']);
  });

  it('…and the banner quotes THAT sentence, through the real #943 lookup', () => {
    const { facts, fig } = run(ORDER_A);
    expect(utteranceForError(facts, fig.status, fig.lastError)).toBe('α = 70');
  });

  it('the redirected row is green because naming an angle is always possible', () => {
    const { facts, fig } = run(ORDER_A);
    const def = facts.filter((f) => f.utterance === 'זווית ABC = α');
    expect(def.length, 'the α-definition really is in the list').toBeGreaterThan(0);
    for (const f of def) expect(fig.status[f.id], 'the statement the student must not change').toBe('ok');
  });

  it('#955 still holds: the refused magnitude reaches no canvas', () => {
    // The interaction that a careless fix breaks. Blame moved, so the α-definition row is now `ok` —
    // but its constraint was never APPLIED, and a fact labels only from its success branch (ADR-491).
    // If this ever regresses, the canvas prints «70°» on a corner drawn at 60° again — the P1.
    const { fig } = run(ORDER_A);
    expect(fig.labels.angles.find((a) => a.vertex === 'B'), 'nothing is written at B').toBeUndefined();
    expect(fig.labels.angles.map((a) => a.text).sort()).toEqual(['50°', '70°']);
  });
});

describe('#956 — what must NOT change', () => {
  it('ordering B: the value typed FIRST leaves the shaping line rightly blamed', () => {
    // The case a careless fix breaks: here «זווית CAB = 70» IS the line that flipped the figure, so
    // naming it is already correct. Measured on the pre-fix build and unchanged by ADR-492.
    const { facts, fig } = run(ORDER_B);
    expect(fig.lastError).toMatch(/cannot hold/);
    expect(redRows(fig, facts)).toEqual(['זווית CAB = 70']);
  });

  it('an unbound value keeps its own #926 status — it is not a blame target', () => {
    const { facts, fig } = run(['משולש ABC', 'α = 70']);
    const v = facts.find((f) => f.utterance === 'α = 70')!;
    expect(fig.status[v.id]).toMatch(/is not defined by any statement/);
  });

  it('a plain numeric given that fails is still blamed itself — no symbol, no redirect', () => {
    const { facts, fig } = run(['משולש ABC', 'זווית BCA = 50', 'זווית CAB = 70', 'זווית ABC = 80']);
    expect(fig.lastError).toMatch(/cannot hold/);
    expect(redRows(fig, facts)).toEqual(['זווית ABC = 80']);
  });

  it('an ordinary figure stays entirely green', () => {
    const { facts, fig } = run(['משולש ABC', 'AB = 3x', 'x = 4']);
    expect(fig.lastError).toBeNull();
    expect(redRows(fig, facts)).toEqual([]);
  });
});

describe('#956 — the CLASS: any lane where the number arrives from another row', () => {
  it('the LENGTH lane has the same defect and the same fix', () => {
    const { facts, fig } = run(['משולש ABC', 'BC = 4', 'AC = 5', 'זווית ABC = 90', 'AB = x', 'x = 8']);
    expect(fig.lastError).toMatch(/cannot hold/);
    expect(redRows(fig, facts), 'the value line, not «AB = x»').toEqual(['x = 8']);
  });

  it('the RESTATED value is the one blamed — the last set-var wins, as the symbol table does', () => {
    const { facts, fig } = run(['משולש ABC', 'BC = 4', 'AC = 5', 'זווית ABC = 90', 'AB = x', 'x = 3', 'x = 8']);
    expect(fig.lastError).toMatch(/cannot hold/);
    expect(redRows(fig, facts), 'the second value is what broke it').toEqual(['x = 8']);
  });

  /**
   * The prefix-sweep oracle the plan asked for: it catches the whole class rather than the reported
   * orderings. For a sequence whose FIRST infeasible prefix is known, the red row must be that
   * prefix's last line — which is the ruling, stated executably.
   */
  it.each([
    { name: 'angle lane, value last', steps: ORDER_A },
    { name: 'angle lane, value first', steps: ORDER_B },
    { name: 'length lane, value last', steps: ['משולש ABC', 'BC = 4', 'AC = 5', 'זווית ABC = 90', 'AB = x', 'x = 8'] },
    { name: 'plain numeric', steps: ['משולש ABC', 'זווית BCA = 50', 'זווית CAB = 70', 'זווית ABC = 80'] },
  ])('prefix sweep — $name: the red row IS the line that first broke the figure', ({ steps }) => {
    let firstBad = -1;
    for (let n = 1; n <= steps.length && firstBad < 0; n++) {
      if (replayFacts(factsOf(steps.slice(0, n))).lastError) firstBad = n - 1;
    }
    expect(firstBad, 'the sequence does become infeasible').toBeGreaterThanOrEqual(0);
    const { facts, fig } = run(steps.slice(0, firstBad + 1));
    expect(redRows(fig, facts)).toEqual([steps[firstBad]]);
  });
});
