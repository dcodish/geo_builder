/**
 * #1864 ([ADR-AG-267](../../docs/06c-decisions-analytic.md#adr-ag-267)) — a choice the tool made for an UNSTATED
 * given is SAID, for as long as it is unstated (docs/10 P4; B10; the operator's W3 ruling of 2026-10-08).
 *
 * Measured before (at 403efe66): «משולש ABC שווה שוקיים», «טרפז ABCD», «טרפז שווה שוקיים ABCD», «טרפז ישר זווית
 * ABCD», «משולש קהה זווית ABC», «קודקודי המשולש מונחים על הצירים» and «אורך השוק AB הוא 5» each recorded with no
 * word about the choice; «זווית A קהה» was `not-handled`; «AC=AB» left the isosceles choice open beside it; and
 * «זווית BAC קהה» / «A על ציר ה-x» never closed their choice.
 *
 * Every case runs the real path: `derive` (what `App.tsx` folds) → `unstatedChoices` → `unstatedChoiceText` over the
 * product's own i18n, and every taught line is typed back through `decideSubmit` — a remedy must DRIVE.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { activeOf } from '../app/active';
import { unstatedChoiceText } from '../app/unstatedChoice';
import { derive } from '../engine/derive';
import { unstatedChoices, UNSTATED_CHOICE_KINDS, type UnstatedChoice } from '../engine/unstatedChoices';
import { analyticI18n } from '../i18n';

/** Bidi isolates are a rendering concern — the words are what is locked. */
const plain = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');
const he = analyticI18n.getFixedT('he');
const en = analyticI18n.getFixedT('en');
const textOf = (c: UnstatedChoice, t = he) => plain(unstatedChoiceText(c, (k, o) => t(k, o)));
const notes = (lines: string[], seed = 0) => unstatedChoices(derive(lines, seed));
const texts = (lines: string[], seed = 0, t = he) => notes(lines, seed).map((c) => textOf(c, t));
/** The line a note teaches — «…כתבו למשל «X»…» / «…type e.g. «X»…». */
const taught = (text: string) => /(?:למשל|e\.g\.) «([^»]+)»/.exec(text)![1];

const at = (lines: string[], seed: number, id: string) => derive(lines, seed).figure.points.find((p) => p.id === id)!;
const dist = (lines: string[], seed: number, p: string, q: string) => {
  const [a, b] = [at(lines, seed, p), at(lines, seed, q)];
  return Math.hypot(a.x - b.x, a.y - b.y);
};
const angleAt = (lines: string[], seed: number, v: string, p: string, q: string) => {
  const [V, P, Q] = [at(lines, seed, v), at(lines, seed, p), at(lines, seed, q)];
  const u = [P.x - V.x, P.y - V.y];
  const w = [Q.x - V.x, Q.y - V.y];
  return (Math.acos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1])) ) * 180) / Math.PI;
};

describe('#1864 — 2-D\'s notes, word for word (B10)', () => {
  it('«משולש ABC שווה שוקיים» names the pair drawn, in 2-D\'s sentence', () => {
    expect(texts(['משולש ABC שווה שוקיים'])).toEqual([
      'הכלי לא יודע אילו צלעות שוות — כרגע מצוירות AB = AC. כדי לקבוע כתבו למשל «AB=AC», או לחצו «הציגו תצורה אחרת».',
    ]);
  });

  it('«טרפז ABCD» and «טרפז ישר זווית ABCD» say the assumed pair, plain — nothing about the right-angle seat (ADR-556)', () => {
    const plainNote = 'הכלי הניח ש-AB ∥ DC. כדי לקבוע אילו צלעות מקבילות כתבו למשל «AB מקביל ל-DC».';
    expect(texts(['טרפז ABCD'])).toEqual([plainNote]);
    expect(texts(['טרפז ישר זווית ABCD'])).toEqual([plainNote]);
  });

  it('«טרפז שווה שוקיים ABCD» names the legs too', () => {
    expect(texts(['טרפז שווה שוקיים ABCD'])).toEqual([
      'הכלי הניח ש-AB ∥ DC (השוקיים AD, BC). כדי לקבוע אילו צלעות מקבילות כתבו למשל «AB מקביל ל-DC».',
    ]);
  });

  it('a plain trapezoid whose legs the student stated equal names them, as 2-D does (measured at 403efe66)', () => {
    expect(texts(['טרפז ABCD', 'AD=BC'])).toEqual([
      'הכלי הניח ש-AB ∥ DC (השוקיים AD, BC). כדי לקבוע אילו צלעות מקבילות כתבו למשל «AB מקביל ל-DC».',
    ]);
  });

  it('the note sits on the row that opened the choice', () => {
    expect(notes(['נקודה P', 'טרפז ABCD']).map((c) => c.line)).toEqual([1]);
  });
});

describe('#1864 W3 — the choices only analytic reads, in 2-D\'s frame', () => {
  it('«משולש קהה זווית ABC»: the approved sentence, naming the angle actually drawn obtuse', () => {
    const lines = ['משולש קהה זווית ABC'];
    for (let seed = 0; seed < 6; seed += 1) {
      const [c] = notes(lines, seed);
      expect(c.kind).toBe('obtuse-vertex');
      if (c.kind !== 'obtuse-vertex') return;
      expect(textOf(c)).toBe(
        `הכלי לא יודע איזו זווית קהה — כרגע מצוירת ∠${c.vertex}. כדי לקבוע כתבו למשל «זווית ${c.vertex} קהה», או לחצו «הציגו תצורה אחרת».`,
      );
      const [p, q] = ['A', 'B', 'C'].filter((x) => x !== c.vertex);
      expect(angleAt(lines, seed, c.vertex, p, q), `seed ${seed}`).toBeGreaterThan(90);
    }
  });

  it('«קודקודי המשולש מונחים על הצירים»: every vertex the note places on an axis IS on it', () => {
    const lines = ['משולש ABC', 'קודקודי המשולש מונחים על הצירים'];
    for (let seed = 0; seed < 6; seed += 1) {
      const [c] = notes(lines, seed);
      expect(c.kind).toBe('axes');
      if (c.kind !== 'axes') return;
      expect([...c.onX, ...c.onY].sort()).toEqual(['A', 'B', 'C']);
      for (const id of c.onX) expect(Math.abs(at(lines, seed, id).y), `${id} on x, seed ${seed}`).toBeLessThan(1e-6);
      for (const id of c.onY) expect(Math.abs(at(lines, seed, id).x), `${id} on y, seed ${seed}`).toBeLessThan(1e-6);
      expect(textOf(c)).toMatch(/^הכלי לא יודע איזה קודקוד נמצא על איזה ציר — כרגע .+ על ציר ה-[xy]\. כדי לקבוע כתבו למשל «[ABC] על ציר ה-[xy]», או לחצו «הציגו תצורה אחרת»\.$/);
    }
  });

  it('«אורך השוק AB הוא 5» on a plain triangle reuses 2-D\'s equal-pair note, naming a pair the figure holds', () => {
    const lines = ['משולש ABC', 'אורך השוק AB הוא 5'];
    for (let seed = 0; seed < 4; seed += 1) {
      const [c] = notes(lines, seed);
      expect(c.kind).toBe('equal-pair');
      if (c.kind !== 'equal-pair') return;
      expect(c.line).toBe(1);
      const [[p, q]] = c.pairs;
      expect(dist(lines, seed, p[0], p[1])).toBeCloseTo(dist(lines, seed, q[0], q[1]), 6);
      expect(textOf(c)).toMatch(/^הכלי לא יודע אילו צלעות שוות — כרגע מצוירות AB = (AC|BC)\. כדי לקבוע כתבו למשל «AB=(AC|BC)», או לחצו «הציגו תצורה אחרת»\.$/);
    }
  });
});

describe('#1864 — «הציגו תצורה אחרת» cycles the choice, and the note follows the drawing', () => {
  it('the isosceles note names the pair the figure draws, at every seed, and more than one across seeds', () => {
    const lines = ['משולש שווה שוקיים ABC'];
    const seen = new Set<string>();
    for (let seed = 0; seed < 6; seed += 1) {
      const [c] = notes(lines, seed);
      if (c.kind !== 'equal-pair') throw new Error('expected an equal-pair note');
      const [[p, q]] = c.pairs;
      expect(dist(lines, seed, p[0], p[1]), `seed ${seed}`).toBeCloseTo(dist(lines, seed, q[0], q[1]), 6);
      seen.add(`${p.join('')}=${q.join('')}`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('the obtuse vertex cycles too', () => {
    const vs = new Set<string>();
    for (let seed = 0; seed < 6; seed += 1) {
      const [c] = notes(['משולש קהה זווית ABC'], seed);
      if (c.kind === 'obtuse-vertex') vs.add(c.vertex);
    }
    expect(vs.size).toBeGreaterThan(1);
  });
});

describe('#1864 — the taught line DRIVES: typed next, it records and the note goes', () => {
  const opened: string[][] = [
    ['משולש ABC שווה שוקיים'],
    ['טרפז ABCD'],
    ['טרפז שווה שוקיים ABCD'],
    ['טרפז ישר זווית ABCD'],
    ['משולש קהה זווית ABC'],
    ['משולש ABC', 'אורך השוק AB הוא 5'],
  ];
  for (const t of [he, en]) {
    for (const lines of opened) {
      it(`${lines.join(' · ')} (${t === he ? 'he' : 'en'})`, () => {
        const [note] = texts(lines, 0, t);
        const line = taught(note);
        expect(decideSubmit(line, lines, 0).kind, line).toBe('record');
        expect(notes([...lines, line])).toEqual([]);
      });
    }
    it(`the axes note converges: each taught line records and the note goes once every vertex is placed (${t === he ? 'he' : 'en'})`, () => {
      const lines = ['משולש ABC', 'קודקודי המשולש מונחים על הצירים'];
      for (let step = 0; step < 3 && notes(lines).length > 0; step += 1) {
        const line = taught(texts(lines, 0, t)[0]);
        expect(decideSubmit(line, lines, 0).kind, line).toBe('record');
        lines.push(line);
      }
      expect(notes(lines)).toEqual([]);
      expect(derive(lines, 0).faults).toEqual([]);
    });
  }

  it('the other spelling of the pair pins it too — «AC=AB», «BA=BC», «CB=CA» (the class, not the reported spelling)', () => {
    for (const pin of ['AC=AB', 'BA=BC', 'CB=CA']) {
      const lines = ['משולש שווה שוקיים ABC', pin];
      expect(decideSubmit(pin, lines.slice(0, 1), 0).kind, pin).toBe('record');
      expect(notes(lines), pin).toEqual([]);
      expect(derive(lines, 0).construction.constraints.filter((k) => k.t === 'choice'), pin).toEqual([]);
    }
    expect(notes(['משולש ABC', 'אורך השוק AB הוא 5', 'BA=BC'])).toEqual([]);
  });

  it('a stated pair holds at every configuration — the choice no longer draws an equilateral beside it', () => {
    const lines = ['משולש שווה שוקיים ABC', 'AC=BC'];
    for (let seed = 0; seed < 6; seed += 1) {
      expect(dist(lines, seed, 'A', 'C')).toBeCloseTo(dist(lines, seed, 'B', 'C'), 6);
      expect(Math.abs(dist(lines, seed, 'A', 'B') - dist(lines, seed, 'A', 'C')), `seed ${seed}`).toBeGreaterThan(1e-3);
    }
  });

  it('«זווית BAC קהה» and «זווית A קהה» close the obtuse choice, and A is obtuse at every configuration', () => {
    for (const pin of ['זווית BAC קהה', 'זווית CAB קהה', 'זווית A קהה', 'angle A is obtuse']) {
      const lines = ['משולש קהה זווית ABC', pin];
      expect(decideSubmit(pin, lines.slice(0, 1), 0).kind, pin).toBe('record');
      expect(derive(lines, 0).construction.selectors.filter((s) => s.kind === 'choice'), pin).toEqual([]);
      for (let seed = 0; seed < 4; seed += 1) expect(angleAt(lines, seed, 'A', 'B', 'C'), `${pin} seed ${seed}`).toBeGreaterThan(90);
    }
  });

  it('«A על ציר ה-x» narrows the axes choice to the assignments that put A there — the rest stays the tool\'s, and said', () => {
    const lines = ['משולש ABC', 'קודקודי המשולש מונחים על הצירים', 'A על ציר ה-x'];
    const choice = derive(lines, 0).construction.constraints.find((k) => k.t === 'choice');
    expect(choice && choice.t === 'choice' ? choice.options.length : 0).toBe(4);
    const [c] = notes(lines);
    expect(c.kind).toBe('axes');
    expect(c.line).toBe(1); // still the sentence that opened it
    if (c.kind === 'axes') expect(c.onX).toContain('A');
  });

  it('«זווית A חדה» reads too, on the one ring through A (2-D\'s single-vertex form)', () => {
    expect(decideSubmit('זווית A חדה', ['משולש ABC'], 0).kind).toBe('record');
  });
});

describe('#1864 — muting the pin brings the note back (the note follows the ACTIVE lines)', () => {
  it('«AB=AC» muted → the isosceles note returns', () => {
    const lines = ['משולש שווה שוקיים ABC', 'AB=AC'];
    expect(unstatedChoices(derive(activeOf(lines, []), 0))).toEqual([]);
    expect(unstatedChoices(derive(activeOf(lines, [1]), 0)).map((c) => c.kind)).toEqual(['equal-pair']);
  });
  it('«BC מקביל ל-AD» muted → the trapezoid note returns', () => {
    const lines = ['טרפז ABCD', 'BC מקביל ל-AD'];
    expect(unstatedChoices(derive(activeOf(lines, []), 0))).toEqual([]);
    expect(unstatedChoices(derive(activeOf(lines, [1]), 0)).map((c) => c.kind)).toEqual(['parallel-pair']);
  });
});

describe('#1864 — the choices that are NOT said', () => {
  it.each([
    [['משולש ישר זווית ABC']], // the right-angle seat stays withdrawn (ADR-556, B10)
    [['נתון מעגל O', 'נתון מעגל M', 'מעגל O ומעגל M משיקים']],
    [['משולש ABC', 'sin∢ACB = 1/2']],
    [['משולש ABC', 'מלבן DEFG חסום במשולש ABC']],
    [['דלתון ABCD']], // the kite's pair is fixed by its letters until #2006
    [['מקבילית ABCD']],
  ])('%j shows no note', (lines) => {
    expect(notes(lines)).toEqual([]);
  });

  it('the kind list is complete', () => {
    expect([...UNSTATED_CHOICE_KINDS].sort()).toEqual(['axes', 'equal-pair', 'obtuse-vertex', 'parallel-pair']);
  });
});
