/**
 * #937 clause 3 (ADR-W-047) — A PARAMETER THE STUDENT NEVER VALUED IS NEVER REPLACED ON THE CANVAS.
 *
 * The operator, stating the rule for every builder (2026-09-08):
 *
 * > *"if the value of the parameter is computable, but user did not enter it, the canvas always shows
 * > the parameter and data panel can show the computed values."*
 *
 * Asked whether this needed building, he answered *"what works today is good. i just wrote it so there
 * is no confusion"* — so in 2-D this clause costs no implementation. It costs THIS: a regression lock,
 * per product, so that a later change cannot quietly start substituting a value the student never
 * stated. That substitution is the honesty failure the clause exists to forbid, and it is exactly what
 * the tool already does — correctly — once they DO state the value, which is why the boundary needs a
 * test rather than a comment.
 *
 * The chip half of #937 lands in 3-D first (its angle lane, #925). 2-D's own chip is a later adoption;
 * this file is the half of the rule that binds here today.
 */
import { describe, expect, it } from 'vitest';
import { factsOf, replayFacts } from './scenario-pipeline';

const labels = (steps: string[]) => {
  const fig = replayFacts(factsOf(steps));
  expect(fig.lastError, steps.join(' · ')).toBeNull();
  return {
    lengths: fig.labels.lengths.map((l) => l.text),
    angles: fig.labels.angles.map((a) => a.text),
  };
};

describe('#937 clause 3 (2-D) — an unvalued letter keeps its letter, even when the figure determines it', () => {
  it('a free scale: «AB = 3x» · «AC = x» label the segments with the LETTERS', () => {
    const l = labels(['משולש ABC', 'AB = 3x', 'AC = x']);
    expect(l.lengths, 'the student’s own form').toEqual(expect.arrayContaining(['3x', 'x']));
    expect(l.lengths.join(' '), 'no number invented for a letter they never valued').not.toMatch(/\d+(\.\d+)?(?![x])/);
  });

  it('a DETERMINED scale still shows the letters — the value goes to the panel, not the canvas', () => {
    // With |BC| = 10 and ∠BAC = 120 the figure forces x, so the tool COULD print a number here.
    // Printing it would assert a magnitude the student never wrote. It must not.
    const l = labels(['משולש ABC', 'AB = 3x', 'AC = x', 'BC = 10', 'זווית BAC = 120']);
    expect(l.lengths, 'the letters survive being determined').toEqual(expect.arrayContaining(['3x', 'x']));
    expect(l.lengths, 'and the value the student DID state is still shown').toContain('10');
  });

  it('a DETERMINED named angle still shows «α»', () => {
    // ∠BCA = 50 and ∠CAB = 60 force ∠ABC = 70, and α names it. The student never wrote «α = 70».
    const l = labels(['משולש ABC', 'זווית ABC = α', 'זווית BCA = 50', 'זווית CAB = 60']);
    expect(l.angles, 'the letter is kept').toContain('α');
    expect(l.angles, 'the computed 70 is NOT put on the arc').not.toContain('70°');
  });

  it('the boundary: once the student VALUES it themselves, the value is theirs to show', () => {
    // The contrast that makes the clause meaningful — this is not a bug, it is the default the chip
    // will let them flip. Locked so the two halves cannot be confused by a later change.
    const l = labels(['משולש ABC', 'זווית ABC = α', 'α = 70']);
    expect(l.angles, 'a value the student stated').toContain('70°');
    expect(l.angles).not.toContain('α');
  });
});
