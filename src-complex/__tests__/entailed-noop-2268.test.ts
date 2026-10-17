/**
 * #2268 (ADR-CX-084) — A STATEMENT THE EXACT SOLVE ALREADY ENTAILS ADDS NOTHING, AND SAYS SO.
 *
 * The operator, playing round #2245's T85/T86: *"should accept and say that this is already known."*
 * «z1 = 15cis(π/7)» · «|z1| = 15» and «z1 = 5cis(π/7)» · «z2 = 15cis(π/7)» · «z2 = 3z1» were accepted and
 * recorded as a new row, silently. 2-D answers a true restatement as a noop with «זה כבר קיים באיור — אין
 * מה להוסיף.»; complex now does the same, decided by the fold's own exact solve (`entailedBy`), never by
 * a sample: a value that merely holds in the drawing is a real new given and is recorded as before.
 * Everything runs through the real `submitLine` + `deriveLines`.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines, lineEntailed } from '../app/deriveLines';
import { activeLines, hydrateSession, submitLine } from '../app/submit';
import { complexI18n } from '../i18n';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const play = (...lines: string[]): boolean[] => lines.map((l) => submitLine(l));

/** The noop: accepted, no row added, the note names nothing but the sentence, no error. */
const expectAlreadyKnown = (givens: string[], restated: string) => {
  expect(play(...givens).every(Boolean), givens.join(' · ')).toBe(true);
  const before = [...store().lines];
  expect(submitLine(restated), restated).toBe(true);
  expect(store().lines, restated).toEqual(before);
  expect(store().lastError, restated).toBeNull();
  expect(store().lastNote, restated).toEqual({ key: 'already-known', detail: restated });
};

/** Recorded as a new given, exactly as before the fix. */
const expectRecorded = (givens: string[], line: string) => {
  expect(play(...givens).every(Boolean), givens.join(' · ')).toBe(true);
  expect(submitLine(line), line).toBe(true);
  expect(store().lines, line).toEqual([...givens, line]);
  expect(store().lastNote, line).toBeNull();
};

describe('#2268 — the operator\'s cases (T85, T86): already known, nothing recorded', () => {
  it('T85 · «z1 = 15cis(π/7)» → «|z1| = 15»', () => expectAlreadyKnown(['z1 = 15cis(π/7)'], '|z1| = 15'));
  it('T86 · «z1 = 5cis(π/7)» · «z2 = 15cis(π/7)» → «z2 = 3z1»', () =>
    expectAlreadyKnown(['z1 = 5cis(π/7)', 'z2 = 15cis(π/7)'], 'z2 = 3z1'));

  it('the sentence is 2-D\'s noop sentence (`input.alreadyDrawn`), in both languages', () => {
    expect(complexI18n.t('noteAlreadyKnown', { lng: 'he' })).toBe('זה כבר קיים באיור — אין מה להוסיף.');
    expect(complexI18n.t('noteAlreadyKnown', { lng: 'en' })).toBe("That's already on the figure — nothing to add.");
  });

  it('the figure is unchanged by the noop, and the next line clears the note', () => {
    play('z1 = 15cis(π/7)');
    const drawn = deriveLines(activeLines(), 0, 0).points.map((p) => [p.name, p.z]);
    submitLine('|z1| = 15');
    expect(deriveLines(activeLines(), 0, 0).points.map((p) => [p.name, p.z])).toEqual(drawn);
    expect(submitLine('z2 = 2z1')).toBe(true);
    expect(store().lastNote).toBeNull();
    expect(store().lines).toEqual(['z1 = 15cis(π/7)', 'z2 = 2z1']);
  });
});

describe('#2268 — the class: every relation tier 1 decides exactly', () => {
  it.each([
    [['z1 = 3+4i'], '|z1| = 5'], // a modulus
    [['z1 = 2cis30'], 'arg(z1) = 30'], // an argument
    [['z1 = 2cis30'], 'arg z1 = 30°'],
    [['|z1| = 5'], '|z1| = 5'], // the same given twice, over a free direction
    [['|z1| = 5', 'z2 = 2z1'], '|z2| = 10'], // through a relation, the direction still free
    [['z1 = 1+i', 'z2 = 2+2i'], 'z2 = 2z1'], // z = k·w over cartesian literals
    [['z1 = 3+4i', 'z2 = conj(z1)'], 'z2 = 3-4i'], // a conjugate, both ways round
    [['z1 = 3+4i', 'z2 = 3-4i'], 'z2 = conj(z1)'],
    [['|z1| = 5', 'arg z1 = 30'], 'z1 = 5cis30'], // a definition the givens already make
    [['z1 = 3+4i'], 'z1 = 3+4i'],
    [['a = 2'], 'a = 2'], // a parameter
  ])('%j → «%s» is already known', (givens, line) => expectAlreadyKnown(givens, line));
});

describe('#2268 — controls: what adds information is recorded, what is false is refused', () => {
  it('«|z1| = 15» over a FREE z1 is a new given', () => {
    expect(submitLine('|z1| = 15')).toBe(true);
    expect(store().lines).toEqual(['|z1| = 15']);
    expect(store().lastNote).toBeNull();
  });
  it('«|z2| = 10» beside «|z1| = 5» (no relation) is a new given', () => expectRecorded(['|z1| = 5'], '|z2| = 10'));
  it('a new name is a definition, never a restatement', () => expectRecorded(['z1 = 1+i'], 'z2 = 2z1'));
  it('a claim is the student\'s answer: recorded and marked, never "already known"', () =>
    expectRecorded(['z1 = 1+i'], 'z1 ממשי'));
  it('Re/Im rows are the numeric tier\'s: recorded as today (a float is never identity)', () => {
    expectRecorded(['z1 = 3+4i'], 'Re(z1) = 3');
    store().resetSession();
    expectRecorded(['z1 = 3+4i'], 'Im(z1) = 4');
  });
  it('«|z1| = 14» after «z1 = 15cis(π/7)» is still refused', () => {
    expect(submitLine('z1 = 15cis(π/7)')).toBe(true);
    expect(submitLine('|z1| = 14')).toBe(false);
    expect(store().lastError?.key).toBe('incompatible');
    expect(store().lastNote).toBeNull();
    expect(store().lines).toEqual(['z1 = 15cis(π/7)']);
  });
  it('an argument that cuts an enumerated set is a new given, not a restatement', () => {
    expect(lineEntailed(['|z1| = 2', 'z1^2 = -4'], 'arg z1 = 90')).toBe(false);
    expect(lineEntailed(['|z1| = 2', 'z1^2 = -4'], '|z1| = 2')).toBe(true);
  });
});

describe('#2268 — a LOAD keeps the student\'s saved rows', () => {
  it('the #2134 fixture replays all three lines (a saved restatement stays a row)', () => {
    const text = readFileSync(new URL('./fixtures/cis-modulus-exact-2134.complex.json', import.meta.url), 'utf8');
    expect(hydrateSession(JSON.parse(text))).toBe(true);
    expect(store().lines).toEqual(['z1 = 5cis(π/7)', 'z2 = 15cis(π/7)', 'z2 = 3z1']);
    expect(store().lastNote).toBeNull();
    expect(store().loadAudit).toBeNull();
  });
});
