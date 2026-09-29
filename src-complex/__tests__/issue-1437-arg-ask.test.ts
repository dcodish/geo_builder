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

import { stripFormatControls } from '../../shell/bidi';
import { askRowsOf } from '../app/askLane';
import { deriveLines } from '../app/deriveLines';
import { readAsk, submitLine } from '../app/submit';
import { complexI18n } from '../i18n';
import { whyText } from '../replay/scene2';
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

/**
 * AMENDMENT 1 (pre-play 2026-09-29) — three classes the sheet found.
 */
describe('#1437 A1 — the rulings stay locked: 0°..360°, and a rounded value prints 2 decimals with «=»', () => {
  it('four quadrants answer inside one turn (0°..360°, never negative)', () => {
    const lines = ['z1 = -2+2i', 'z2 = -2i', 'z3 = -3', 'z4 = 1-i'];
    const d = deriveLines(lines, 0, 0, ['arg z1', 'arg z2', 'arg z3', 'arg z4']);
    const rows = askRowsOf(['arg z1', 'arg z2', 'arg z3', 'arg z4'], d.knowledge);
    expect(rows.map((r) => r.row!.value)).toEqual(['135°', '270°', '180°', '315°']);
  });

  it('w = 3+4i → «53.13°», printed with «=» (approx is not set)', () => {
    const r = ask(['w = 3+4i'], 'arg w');
    expect(r.row!.value).toBe('53.13°');
    expect(r.row!.approx).toBeFalsy();
  });
});

describe('#1437 A1 — the argument of a number KNOWN to be 0 has its own reason', () => {
  const fixed = (lng: 'he' | 'en') => {
    const t = complexI18n.getFixedT(lng);
    return (key: string, params?: Record<string, unknown>) => stripFormatControls(t(key, params));
  };

  it('w = 0 → arg-of-zero (not "undetermined": no given can pin it)', () => {
    const r = ask(['w = 0'], 'arg w');
    expect(r.row!.value).toBeNull();
    expect(r.row!.why).toEqual({ code: 'arg-of-zero' });
    // the SAME predicate as the modulus row: |w| prints 0 exactly when arg says "no direction"
    expect(ask(['w = 0'], '|w|').row!.value).toBe('0');
  });

  it('a merely undetermined w keeps the open reasons', () => {
    expect(ask(['|w| = 3'], 'arg w').row!.why).toEqual({ code: 'free-dof-remain' });
    expect(ask(['z1 = 4'], 'arg w').row!.why).toEqual({ code: 'undetermined' });
  });

  it('the sentence, in both languages (one key — the wording awaits the operator)', () => {
    const why = { code: 'arg-of-zero' } as const;
    expect(whyText(why, fixed('he'))).toBe('לארגומנט של 0 אין ערך — ל-0 אין כיוון');
    expect(whyText(why, fixed('en'))).toBe('0 has no argument — 0 has no direction');
  });
});

describe('#1437 A1 — the question FRAME is removed once, for every ask kind', () => {
  const G = ['w = 1+i', 'z1 = 2', 'z2 = 3i'];
  it.each([
    // argument
    ['מהו הארגומנט של w', 'arg', '45°'],
    ['מה הארגומנט של w?', 'arg', '45°'],
    ['arg w?', 'arg', '45°'],
    ['arg w = ?', 'arg', '45°'],
    ['arg w=?', 'arg', '45°'],
    ['חשבו את arg w', 'arg', '45°'],
    ['מצא את arg(w)', 'arg', '45°'],
    ['what is the argument of w', 'arg', '45°'],
    ['find arg w', 'arg', '45°'],
    // modulus — the operator form and the word form
    ['מהו |w|', 'expr', '√2'],
    ['|w|?', 'expr', '√2'],
    ['|w| = ?', 'expr', '√2'],
    ['מה הוא |w|', 'expr', '√2'],
    ['מהו הערך המוחלט של w?', 'expr', '√2'],
    ['what is the absolute value of w?', 'expr', '√2'],
    // projections and operators
    ['מהו Re(w)', 'expr', '1'],
    ['Re(w)?', 'expr', '1'],
    ['מהי Im(w)', 'expr', '1'],
    ['Im(w)?', 'expr', '1'],
    ['מהו החלק המדומה של w?', 'expr', '1'],
    ['מהו הצמוד של w', 'expr', '1-i'],
    ['conj(w)?', 'expr', '1-i'],
    // expressions
    ['מהו z1*z2', 'expr', '6i'],
    ['w^2?', 'expr', '2i'],
    ['חשב את z1+z2', 'expr', '2+3i'],
    ['כמה זה z1+z2?', 'expr', '2+3i'],
    // a framed bare name asks its value
    ['מהו w', 'expr', '1+i'],
    ['w?', 'expr', '1+i'],
    // measures and ratios ride the same frame
    ['מהו אורך z1z2', 'measure', '3.61'],
    ['z1z2?', 'measure', '3.61'],
    ['מהו היחס בין אורך z1w לאורך z2w', 'ratio', '0.63'],
  ])('«%s» reads as a %s question → %s', (q, kind, value) => {
    expect(readAsk(q).kind).toBe(kind);
    const d = deriveLines(G, 0, 0, [q]);
    const r = askRowsOf([q], d.knowledge)[0];
    expect(r.note).toBeNull();
    expect(r.row!.value).toBe(value);
  });

  it('a framed question typed in the givens box routes to the lane — never a fact', () => {
    expect(submitLine('w = 1+i')).toBe(true);
    expect(submitLine('מהו |w|')).toBe(true);
    expect(submitLine('arg w?')).toBe(true);
    expect(store().lines).toEqual(['w = 1+i']);
    expect(store().queries).toEqual(['מהו |w|', 'arg w?']);
  });

  it('REFUSAL: a statement in a question frame is never recorded as a given', () => {
    expect(readAsk('|w| = 3?').kind).toBe('statement');
    expect(readAsk('מהו w = 3').kind).toBe('statement');
    expect(submitLine('w = 1+i')).toBe(true);
    expect(submitLine('|w| = 3?')).toBe(false);
    expect(store().lines).toEqual(['w = 1+i']);
    expect(store().queries).toEqual([]);
  });

  it('a bare frame, or a frame around nonsense, stays unreadable', () => {
    for (const q of ['מהו', '?', 'מהו קוקו']) expect(readAsk(q).kind).toBe('unreadable');
    // and an UNframed bare name is still the F1 statement it always was
    expect(readAsk('w').kind).toBe('statement');
  });
});

describe('#1437 A1 — genitive spellings: «הערך המוחלט של w», «… של המספר w»', () => {
  it.each([
    ['הערך המוחלט של w', '√2'],
    ['הערך המוחלט של המספר w', '√2'],
    ['the modulus of w', '√2'],
    ['abs(w)', '√2'],
    ['הארגומנט של המספר w', '45°'],
    ['הארגומנט של המספר המרוכב w', '45°'],
    ['the argument of w', '45°'],
    ['החלק הממשי של המספר w', '1'],
  ])('«%s» → %s', (q, value) => {
    const r = ask(['w = 1+i'], q);
    expect(r.note).toBeNull();
    expect(r.row!.value).toBe(value);
  });
});
