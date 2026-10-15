/**
 * #1996 (ADR-3D-343, the 3-D half of ADR-W-129) — THE GIVENS FORCED A NARROWER KIND, in 3-D's words, which are
 * every builder's words.
 *
 * The thin lock of the shared rows (`shell/__tests__/fixtures/narrowing-note-rows.ts`): each row runs through the
 * REAL 3-D submit decision (`decideDeterministic3` → `decideSubmit3`, then `derive3`) and is rendered by the real
 * text function (`narrowingText3`) through the real i18n (`i18n3d`, Hebrew, bidi isolates stripped). Then the
 * 3-D-only rows: #1915's (a right pyramid's base and a given typed before the circle), and the lifecycle — muting
 * the cause removes the note, a reload says what typing said.
 */
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';
import { narrowingText3 } from '../i18n/narrowingText3';
import { declaredKind3 } from '../engine/baseShapes';
import { rowClass3 } from '../store/narrowing3';
import i18n3d from '../i18n';
import { narrowingFaults, type NarrowGateVerdict } from '../../shell/__tests__/fixtures/narrowing-note-rows';
import type { NarrowTranslate } from '../../shell/narrowing';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const tHe = i18n3d.getFixedT('he') as unknown as NarrowTranslate;

type St = { facts: Fact3[]; seed: number };

function play(lines: readonly string[]): { st: St; recorded: boolean } {
  let n = 0;
  let st: St = { facts: [], seed: 0 };
  for (const line of lines) {
    const v = decideDeterministic3(st, line, () => `f${++n}`);
    if (v.kind !== 'record') return { st, recorded: false };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, recorded: true };
}

/** The narrowing sentences the page shows for a fact list. */
const notesOf = (st: St): string[] =>
  derive3(st.facts, st.seed).notices.flatMap((n) => (n.kind === 'narrowed' ? [plain(narrowingText3(n.note, tHe))] : []));

const gate = (steps: readonly string[]): NarrowGateVerdict => {
  const { st, recorded } = play(steps);
  return { recorded, notes: recorded ? notesOf(st) : [] };
};

const P_RECT_GIVEN = (g: string) => `בגלל הנתון ${g}, ABCD הוגבל ממקבילית למלבן — מלבן הוא סוג של מקבילית.`;

describe('#1996 — the shared narrowing rows, through the real 3-D submit path', () => {
  it('every row of NARROW_ROWS reads as the cross-builder table says (3-D spellings, X8 exceptions)', async () => {
    expect(await narrowingFaults(gate, '3d')).toEqual([]);
  }, 600_000);
});

describe('#1996 — 3-D-only rows (#1915: the declared adjective, the right pyramid, the given typed first)', () => {
  const rows: { steps: string[]; note: string | null }[] = [
    // a right pyramid over a base that is already its cyclic member narrows nothing (#1915, ruling 2026-10-08)
    { steps: ['פירמידה ישרה SABCD שבסיסה טרפז שווה שוקיים ABCD'], note: null },
    // the family sentence, naming the BASE ring — never «(ABCDS)» (follow-up card 8)
    { steps: ['פירמידה ישרה SABCD שבסיסה מקבילית ABCD'], note: 'כדי שהפירמידה תהיה ישרה, ABCD הוגבל ממקבילית למלבן — מלבן הוא סוג של מקבילית.' },
    { steps: ['פירמידה ישרה SABCD שבסיסה טרפז ABCD'], note: 'כדי שהפירמידה תהיה ישרה, ABCD הוגבל מטרפז לטרפז שווה שוקיים — טרפז שווה שוקיים הוא סוג של טרפז.' },
    // the declared adjective, every spelling (#1915)
    { steps: ['טרפז שווה שוקיים ABCD חסום במעגל'], note: null },
    { steps: ['טרפז שווה שוקיים ABCD', 'מעגל חוסם את ABCD'], note: null },
    { steps: ['isosceles trapezoid ABCD', 'ABCD is inscribed in a circle'], note: null },
    // a given typed BEFORE the circle is the cause (#1915 re-attribution, ruling 2026-10-13)
    { steps: ['מקבילית ABCD', 'AB ⊥ BC', 'ABCD חסום במעגל'], note: P_RECT_GIVEN('AB ⊥ BC') },
    { steps: ['מקבילית ABCD', '|AC| = |BD|', 'ABCD חסום במעגל'], note: P_RECT_GIVEN('|AC| = |BD|') },
    { steps: ['מעוין ABCD', 'זווית ABC = 90', 'ABCD חסום במעגל'], note: 'בגלל הנתון זווית ABC = 90, ABCD הוגבל ממעוין לריבוע — ריבוע הוא סוג של מעוין.' },
    { steps: ['טרפז ABCD', '|AD| = |BC|', 'ABCD חסום במעגל'], note: 'בגלל הנתון |AD| = |BC|, ABCD הוגבל מטרפז לטרפז שווה שוקיים — טרפז שווה שוקיים הוא סוג של טרפז.' },
  ];
  for (const r of rows) {
    it(`«${r.steps.join(' · ')}»`, () => {
      const v = gate(r.steps);
      expect(v.recorded).toBe(true);
      expect(v.notes).toEqual(r.note === null ? [] : [r.note]);
    }, 120_000);
  }
});

describe('#1996 — the note is derived: muting the cause removes it, a reload says what typing said', () => {
  const steps = ['מקבילית ABCD', '|AB| = |BC|'];
  const rhombus = 'בגלל הנתון |AB| = |BC|, ABCD הוגבל ממקבילית למעוין — מעוין הוא סוג של מקבילית.';

  it('muting «|AB| = |BC|» removes the note; unmuting brings it back', () => {
    const { st } = play(steps);
    expect(notesOf(st)).toEqual([rhombus]);
    const muted = { ...st, facts: st.facts.map((f, i) => (i === 1 ? { ...f, enabled: false } : f)) };
    expect(notesOf(muted)).toEqual([]);
    const back = { ...st, facts: muted.facts.map((f) => ({ ...f, enabled: true })) };
    expect(notesOf(back)).toEqual([rhombus]);
  }, 120_000);

  it('a saved figure reloads with the same note', () => {
    const { st } = play(steps);
    const loaded = deserializeFigure3(serializeFigure3(st.facts, st.seed));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(notesOf({ facts: loaded.facts, seed: loaded.seed })).toEqual([rhombus]);
  }, 120_000);

  it('«הציגו תצורה אחרת» keeps the note (it is a property of the givens, not of one drawing)', () => {
    const { st } = play(['מקבילית ABCD', 'ABCD חסום במעגל']);
    const circum = 'כדי שהמעגל יעבור דרך כל הקודקודים, ABCD הוגבל ממקבילית למלבן — מלבן הוא סוג של מקבילית.';
    for (const seed of [st.seed, st.seed + 1, st.seed + 2]) expect(notesOf({ ...st, seed })).toEqual([circum]);
  }, 120_000);
});

describe('#1996 — the declared-kind read and the row classes', () => {
  it('declaredKind3 keeps the adjective the phrase consumed', () => {
    expect(declaredKind3({ base: 'trapezoid', adj: 'isosceles' })).toBe('isosceles-trapezoid');
    expect(declaredKind3({ base: 'trapezoid', adj: 'right' })).toBe('right-trapezoid');
    expect(declaredKind3({ base: 'trapezoid' })).toBe('trapezoid');
    expect(declaredKind3({ base: 'quad' })).toBe('quadrilateral');
    expect(declaredKind3({ base: 'square', adj: 'regular' })).toBe('square');
    for (const b of ['square', 'rectangle', 'rhombus', 'parallelogram', 'kite'] as const) expect(declaredKind3({ base: b })).toBe(b);
  });

  it('a noun’s own lowering is not a given; a circle, a right pyramid, a value and a relation are', () => {
    const cmdsOf = (line: string) => play([line]).st.facts[0].cmds;
    expect(rowClass3(cmdsOf('טרפז שווה שוקיים ABCD'))).toBe('definition');
    expect(rowClass3(cmdsOf('משולש שווה צלעות ABC'))).toBe('definition');
    expect(rowClass3(cmdsOf('מקבילית ABCD חסום במעגל'))).toBe('circum');
    expect(rowClass3(cmdsOf('פירמידה ישרה SABCD שבסיסה מקבילית ABCD'))).toBe('rightPyramid');
    expect(rowClass3(cmdsOf('פירמידה SABCD שבסיסה מקבילית ABCD'))).toBe('definition');
    const after = (lines: string[]) => play(lines).st.facts[lines.length - 1].cmds;
    expect(rowClass3(after(['משולש ABC', 'AB = 3']))).toBe('value');
    expect(rowClass3(after(['משולש ABC', 'זווית C = 90']))).toBe('value');
    expect(rowClass3(after(['משולש ABC', '|AB| = |AC|']))).toBe('relation');
    expect(rowClass3(after(['משולש ABC', 'AC ⊥ BC']))).toBe('relation');
  }, 120_000);
});

import { QUAD_IMPLIES, type QuadBase } from '../engine/baseShapes';
import { NARROW_IMPLIES, type NarrowKind } from '../../shell/narrowing';

describe('#1996 — the shared lattice agrees with 3-D’s QUAD_IMPLIES (ADR-3D-158) on every kind both know', () => {
  it('implication, pair by pair', () => {
    const map: Record<QuadBase, NarrowKind> = { square: 'square', rectangle: 'rectangle', rhombus: 'rhombus', parallelogram: 'parallelogram', kite: 'kite', trapezoid: 'trapezoid', quad: 'quadrilateral' };
    for (const a of Object.keys(QUAD_IMPLIES) as QuadBase[]) {
      for (const b of Object.keys(QUAD_IMPLIES) as QuadBase[]) expect(NARROW_IMPLIES[map[a]].includes(map[b]), `${a} ⇒ ${b}`).toBe(QUAD_IMPLIES[a].includes(b));
    }
  });
});
