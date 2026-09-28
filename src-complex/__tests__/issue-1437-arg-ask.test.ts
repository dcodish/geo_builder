/**
 * #1437 — «arg w» IS ASKABLE: the argument question, answered from the exact carrier.
 *
 * External review of prod: "an 'arg w' query" is missing — `arg` existed only as the F4 relation
 * sentence, and asks ride the expression grammar, which has no arg head; so the one quantity this
 * product is built around was sayable but not askable.
 *
 * The mechanism: an `ArgQuery` kind through the same lane as every other question (parse rule →
 * askArtifacts → fold input → a knowledge row), answered from the exact argument carrier — the
 * same place the polar reading takes it from — under the #1427 knowledge predicate. A free
 * direction is withheld; an enumerated set reports its spread.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { askRowsOf } from '../app/askLane';
import { deriveLines } from '../app/deriveLines';
import { readAsk, submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().clearAll());

const ask = (lines: string[], q: string) => {
  const d = deriveLines(lines, 0, 0, [q]);
  return askRowsOf([q], d.knowledge)[0];
};

describe('#1437 — the three spellings read as questions', () => {
  it.each(['arg w', 'arg(w)', 'הארגומנט של w'])('«%s» reads as an arg ask', (line) => {
    expect(readAsk(line).kind).toBe('arg');
  });

  it('a question typed in the givens box routes to the lane — never a fact', () => {
    expect(submitLine('w = 1+i')).toBe(true);
    expect(submitLine('arg w')).toBe(true);
    expect(store().lines).toEqual(['w = 1+i']);
    expect(store().queries).toEqual(['arg w']);
  });

  it('the RELATION stays a statement: «arg w = 45» is a given, not a question', () => {
    expect(readAsk('arg w = 45').kind).toBe('statement');
  });
});

describe('#1437 — answers', () => {
  it('w = 1+i → arg w = 45°', () => {
    const r = ask(['w = 1+i'], 'arg w');
    expect(r.note).toBeNull();
    expect(r.row!.value).toBe('45°');
  });

  it('a stated polar direction answers itself: w = 2cis150 → 150°', () => {
    expect(ask(['w = 2cis150'], 'arg w').row!.value).toBe('150°');
  });

  it('a FREE direction is withheld — never a sampled number', () => {
    const r = ask(['|w| = 3'], 'arg w');
    expect(r.row!.value).toBeNull();
    expect(r.row!.why).not.toBeNull();
  });

  it('an unstated name reads open', () => {
    const r = ask(['z1 = 4'], 'arg w');
    expect(r.row!.value).toBeNull();
  });

  it('an enumerated SET letter reports its spread («differs»), naming the first member', () => {
    const r = ask(['z^2 = -4'], 'arg z');
    expect(r.row!.value).toBeNull();
    expect(r.row!.why).toMatchObject({ code: 'multi-solution' });
  });
});
