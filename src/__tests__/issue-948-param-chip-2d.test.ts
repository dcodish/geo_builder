/**
 * #948 ([ADR-W-047](../../docs/06w-decisions-workspace.md#adr-w-047) — the 2-D adoption) — A PARAMETER
 * THE STUDENT LATER VALUES GETS A DISPLAY CHIP ON THE VALUING LINE.
 *
 * The operator, validating fix-round #946: *"I notice that the chip works for 3d but not 2d yet."*
 *
 * The rule was ruled once and is cited, not re-decided here: a parameter the student VALUES («x = 4»,
 * «α = 70») gets a chip on the row that valued it, toggling the figure between their letter and its
 * value; a parameter they never valued is never replaced (clause 3 — locked separately in
 * `issue-937-clause3-2d.test.ts`, and those locks must keep passing).
 *
 * What this file pins is the half that was missing in 2-D: the two REPLACED rows #948 measured, the
 * competing predicate, chip ownership, and persistence.
 */
import { describe, expect, it } from 'vitest';
import { factsOf, replayFacts } from './scenario-pipeline';
import { replay } from '@/store/geoStore';
import { applyDisplayMode, competingSymbols, paramChipsByFact } from '@/store/paramChips';
import { deserializeFigure, serializeFigure } from '@/store/figureFile';
import { displayModeFromIndexed, displayModeToIndexed } from '../../shell/displayMode';

/** The figure, its competing parameters, and the chip each row owns — the real derivation chain. */
function build(steps: string[]) {
  const facts = factsOf(steps);
  const fig = replayFacts(facts);
  expect(fig.lastError, steps.join(' · ')).toBeNull();
  const competing = competingSymbols(fig.labels);
  const chips = paramChipsByFact(facts, competing);
  const shown = (letters: string[] = []) => {
    const set = new Set(letters);
    const l = applyDisplayMode(fig.labels, (sym) => set.has(sym));
    return { lengths: l.lengths.map((x) => x.text), angles: l.angles.map((x) => x.text) };
  };
  return { facts, fig, competing, chips, shown };
}

describe('#948 — the valuing row owns the chip, and the chip switches the figure', () => {
  it('«AB = 3x» · «AC = x» · «x = 4»: values are shown, and the chip sends them back to the letters', () => {
    const b = build(['משולש ABC', 'AB = 3x', 'AC = x', 'x = 4']);

    // The default is the VALUE — today's behaviour, and the operator's default once they stated it.
    expect(b.shown().lengths, 'default: the values the student gave').toEqual(expect.arrayContaining(['12', '4']));

    // …and the letter form is RECOVERABLE, which is the whole point of the issue.
    expect(b.shown(['x']).lengths, 'flipped: back to the student’s own form').toEqual(expect.arrayContaining(['3x', 'x']));
  });

  it('«זווית ABC = α» · «α = 70»: the arc flips between «70°» and «α»', () => {
    const b = build(['משולש ABC', 'זווית ABC = α', 'α = 70']);
    expect(b.shown().angles, 'default: the value').toContain('70°');
    expect(b.shown(['α']).angles, 'flipped: the letter').toContain('α');
  });

  it('the chip sits on the VALUING row — never on a row that merely USED the letter', () => {
    const steps = ['משולש ABC', 'AB = 3x', 'AC = x', 'x = 4'];
    const b = build(steps);
    const owner = [...b.chips.keys()];
    expect(owner, 'exactly one row owns the chip').toHaveLength(1);
    const ownerFact = b.facts.find((f) => f.id === owner[0])!;
    expect(ownerFact.utterance, 'and it is the line that VALUED x').toBe('x = 4');
    expect(b.chips.get(owner[0])).toEqual({ sym: 'x', value: 4 });
  });

  it('NO competing display, NO chip — a valued letter nothing draws as a letter offers nothing', () => {
    // «x = 4» with no measure using x: the figure never shows an «x», so there is nothing to switch
    // between and the chrome must not offer an affordance that would change nothing.
    const b = build(['משולש ABC', 'x = 4']);
    expect(b.competing.has('x'), 'x competes nowhere').toBe(false);
    expect([...b.chips.keys()], 'so no row owns a chip').toEqual([]);
  });

  it('clause 3 stays true: a letter the student NEVER valued gets no chip and is never replaced', () => {
    const b = build(['משולש ABC', 'AB = 3x', 'AC = x', 'BC = 10', 'זווית BAC = 120']);
    expect([...b.chips.keys()], 'nothing valued x, so nothing owns a chip').toEqual([]);
    expect(b.shown().lengths, 'and the letters stand').toEqual(expect.arrayContaining(['3x', 'x']));
  });

  it('per-parameter independence: flipping x leaves α alone', () => {
    const b = build(['משולש ABC', 'AB = 3x', 'x = 4', 'זווית ABC = α', 'α = 70']);
    expect(b.chips.size, 'two valued parameters, two chips').toBe(2);
    const onlyX = b.shown(['x']);
    expect(onlyX.lengths, 'x flipped to its letter').toEqual(expect.arrayContaining(['3x']));
    expect(onlyX.angles, 'α untouched — still its value').toContain('70°');
  });

  it('a MUTED valuing row owns no chip — its choice would change nothing', () => {
    const facts = factsOf(['משולש ABC', 'AB = 3x', 'AC = x', 'x = 4']);
    const valuing = facts.find((f) => f.utterance === 'x = 4')!;
    const muted = facts.map((f) => (f.id === valuing.id ? { ...f, enabled: false } : f));
    const fig = replayFacts(muted);
    const chips = paramChipsByFact(muted, competingSymbols(fig.labels));
    expect([...chips.keys()], 'a row not in effect offers no affordance').toEqual([]);
  });
});

describe('#948 — the choice persists', () => {
  it('a save/load round trip keeps the choice, and the FILE keys it by POSITION', () => {
    const facts = factsOf(['משולש ABC', 'AB = 3x', 'AC = x', 'x = 4']);
    const valuingIndex = facts.findIndex((f) => f.utterance === 'x = 4');
    const displayMode = { [facts[valuingIndex].id]: 'letter' as const };

    const json = serializeFigure({
      facts,
      seed: 0,
      display: { displayMode: displayModeToIndexed(displayMode, facts.map((f) => f.id)) },
    });

    // The file must not carry a fact id — a hand-written or id-less file would then attach the choice
    // to the wrong row.
    const onDisk = JSON.parse(json).display.displayMode;
    expect(onDisk, 'keyed by position, not by id').toEqual({ [String(valuingIndex)]: 'letter' });
    expect(JSON.stringify(onDisk), 'no fact id leaks into the file').not.toContain(facts[valuingIndex].id);

    const r = deserializeFigure(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const restored = displayModeFromIndexed(r.file.display?.displayMode, r.file.facts.map((f) => f.id));
    expect(restored[r.file.facts[valuingIndex].id], 'the choice comes back on the same row').toBe('letter');

    const fig = replayFacts(r.file.facts);
    const chips = paramChipsByFact(r.file.facts, competingSymbols(fig.labels));
    const letters = new Set([...chips].filter(([id]) => restored[id] === 'letter').map(([, c]) => c.sym));
    const shown = applyDisplayMode(fig.labels, (s) => letters.has(s)).lengths.map((x) => x.text);
    expect(shown, 'and the loaded figure draws the letters').toEqual(expect.arrayContaining(['3x', 'x']));
  });

  it('a pre-#948 save carries no map and loads showing VALUES, unchanged', () => {
    const facts = factsOf(['משולש ABC', 'AB = 3x', 'AC = x', 'x = 4']);
    const json = serializeFigure({ facts, seed: 0, display: {} });
    const r = deserializeFigure(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(displayModeFromIndexed(r.file.display?.displayMode, r.file.facts.map((f) => f.id))).toEqual({});
    const fig = replayFacts(r.file.facts);
    expect(fig.labels.lengths.map((x) => x.text), 'values, exactly as before this shipped').toEqual(
      expect.arrayContaining(['12', '4']),
    );
  });

  it('the choice is keyed by the fact, so a RESEED cannot disturb it', () => {
    // The figure is derived from (facts, seed); the fact id is not rebuilt by a reseed, which is what
    // makes «הצג תצורה אחרת» keep the choice without it living in anything the reseed touches.
    const facts = factsOf(['משולש ABC', 'AB = 3x', 'AC = x', 'x = 4']);
    const valuing = facts.find((f) => f.utterance === 'x = 4')!;
    for (const seed of [0, 1, 5]) {
      const fig = replay(facts, seed);
      const chips = paramChipsByFact(facts, competingSymbols(fig.labels));
      expect([...chips.keys()], `seed ${seed}: the same row owns the chip`).toEqual([valuing.id]);
    }
  });
});
