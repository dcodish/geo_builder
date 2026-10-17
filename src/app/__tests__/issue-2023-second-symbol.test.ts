/**
 * #2023 + #2061 (2-D arm) ([ADR-661](../../../docs/06-decisions.md#adr-661)) — A SECOND LETTER FOR AN ANGLE OR A
 * SEGMENT THAT ALREADY HAS ONE, OR THE SAME LETTER WITH ANOTHER COEFFICIENT, IS REFUSED NAMING THE EARLIER LINE.
 *
 * Measured on `main` @ b0ef3240 through `decideDeterministic2D` + the real gate, seed 0:
 *   «משולש ABC» · «זוית B=α» · «זוית ABC=β» (and «זוית B=β», «זוית CBA=β», «AB=a» · «AB=c» / «BA=c»,
 *   «∠ABC=2α» · «∠ABC=3α», «AB = 2a» · «AB = 3a»)            → noop «זה כבר קיים באיור», the new value dropped
 *   «∠ABC=2α» · «∠CBA=3α»                                     → refused as a flat triangle (∠CBA = 1.5·∠ABC)
 *
 * Operator rulings: 2026-10-13 (#2023, cards d4-2023 and d5-2023-length — verbatim sentences) and 2026-10-14 (#2061,
 * card d14b-2061-crosstool — the over-constrained frame). One predicate, `measureRestatement` (engine/lower.ts),
 * judged in the fold so the typed door and a loaded list agree.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '@/__tests__/submit-gate';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { buildSymTab, measureRestatement } from '@/engine';
import type { AnyCommand } from '@/engine';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
const en: Translate = (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function decide(prefix: string[], line: string, t: Translate = he) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
  const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
  const said = raw ? stripFormatControls(humanizeError(raw, t, line, otherUtteranceForError(st.facts, raw))) : null;
  return { v, raw, said };
}

const angleTaken = (name: string, sym: string, line: string) => `לזווית ${name} כבר יש שם: ${sym} (בשורה «${line}»). לכל זווית שם אחד — המשיכו עם ${sym}.`;
const lengthTaken = (name: string, sym: string, line: string) => `לקטע ${name} כבר יש שם: ${sym} (בשורה «${line}»). לכל קטע שם אחד — המשיכו עם ${sym}.`;
const contradicts = (line: string, other: string, what: string) => `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד. הסיבה: ${what}.`;

describe('#2023 — a second letter for one angle or one segment is refused with the ruled sentence', () => {
  it.each([
    // [prefix, refused line, expected sentence]
    [['משולש ABC', 'זוית B=α'], 'זוית ABC=β', angleTaken('ABC', 'α', 'זוית B=α')], // the operator's card, verbatim
    [['משולש ABC', 'זוית B=α'], 'זוית B=β', angleTaken('ABC', 'α', 'זוית B=α')],
    [['משולש ABC', 'זוית B=α'], '∠B=β', angleTaken('ABC', 'α', 'זוית B=α')],
    [['משולש ABC', 'זוית ABC=α'], 'זוית B=β', angleTaken('ABC', 'α', 'זוית ABC=α')],
    [['משולש ABC', 'זוית ABC=α'], 'זוית CBA=β', angleTaken('CBA', 'α', 'זוית ABC=α')], // rays reversed: the line's own spelling
    [['משולש ABC', '∠ABC=α'], 'angle ABC = β', angleTaken('ABC', 'α', '∠ABC=α')],
    [['משולש ABC', 'זווית ABC=2α'], 'זווית ABC=β', angleTaken('ABC', '2α', 'זווית ABC=2α')], // a coefficient on the first name
    [['משולש ABC', 'AB=a'], 'AB=c', lengthTaken('AB', 'a', 'AB=a')], // the operator's length card, verbatim
    [['משולש ABC', 'AB=a'], 'AB=t', lengthTaken('AB', 'a', 'AB=a')],
    [['משולש ABC', 'AB=a'], 'BA=c', lengthTaken('BA', 'a', 'AB=a')],
    [['משולש ABC', 'AB=2a'], 'AB=c', lengthTaken('AB', '2a', 'AB=2a')],
    [['משולש ABC', 'זוית B=α', 'AB=4'], 'זוית ABC=β', angleTaken('ABC', 'α', 'זוית B=α')], // a line between
  ])('%j then «%s» → refused', async (prefix, line, sentence) => {
    const { v, said } = await decide(prefix as string[], line as string);
    expect(v.kind, 'refused before it becomes a fact').toBe('refuse');
    expect(said).toBe(sentence);
    expect(llmParseMock, 'never escalated').not.toHaveBeenCalled();
  });

  // The logged session (8mv4jow7) also typed «זוית C» third, which the grammar does not read (it went to the AI, not
  // modelled here); every line the deterministic path reads is kept, in order.
  it('the student\'s logged session: «זוית ABC=β» after «זוית B=α» and a cyclic trapezoid', async () => {
    const { v, said } = await decide(['משולש ABC', 'זוית B=α', 'טרפז ABCD חסום במעגל'], 'זוית ABC=β');
    expect(v.kind).toBe('refuse');
    expect(said).toBe(angleTaken('ABC', 'α', 'זוית B=α'));
  });

  it('English renders the same sentence shape', async () => {
    const { said } = await decide(['משולש ABC', 'AB=a'], 'AB=c', en);
    expect(said).toBe('Segment AB already has a name: a (in the line «AB=a»). A segment has one name — keep using a.');
  });
});

describe('#2061 (2-D arm) — the same letter with another coefficient contradicts the earlier line', () => {
  it.each([
    [['משולש ABC', '∠ABC=2α'], '∠ABC=3α', contradicts('∠ABC=3α', '∠ABC=2α', '∠ABC = 3α')], // the ruled case
    [['משולש ABC', 'זווית ABC = 2α'], 'זווית ABC = 3α', contradicts('זווית ABC = 3α', 'זווית ABC = 2α', '∠ABC = 3α')],
    [['משולש ABC', 'angle ABC = 2α'], 'angle ABC = 3α', contradicts('angle ABC = 3α', 'angle ABC = 2α', '∠ABC = 3α')],
    [['משולש ABC', '∠ABC=α'], '∠ABC=2α', contradicts('∠ABC=2α', '∠ABC=α', '∠ABC = 2α')], // coefficient 1 vs 2
    [['משולש ABC', '∠ABC=2α'], '∠CBA=3α', contradicts('∠CBA=3α', '∠ABC=2α', '∠CBA = 3α')], // was a flat-triangle refusal
    [['משולש ABC', '∠ABC=2α', '∠ACB=2α'], '∠ABC=3α', contradicts('∠ABC=3α', '∠ABC=2α', '∠ABC = 3α')], // a line between
    [['משולש ABC', 'AB = 2a'], 'AB = 3a', contradicts('AB = 3a', 'AB = 2a', '|AB| = 3a')], // the length twin
    [['משולש ABC', 'AB = 2a'], 'BA = 3a', contradicts('BA = 3a', 'AB = 2a', '|BA| = 3a')],
    [['משולש ABC', 'AB=2a'], 'AB=3a', contradicts('AB=3a', 'AB=2a', '|AB| = 3a')], // #2105: the operator's exact sequence (ADR-AG-295)
    [['משולש ABC', 'AB=2a'], 'BA=3a', contradicts('BA=3a', 'AB=2a', '|BA| = 3a')], // #2105: was a self-ratio refusal naming «נתון קודם»
  ])('%j then «%s» → refused, naming the first line', async (prefix, line, sentence) => {
    const { v, said } = await decide(prefix as string[], line as string);
    expect(v.kind).toBe('refuse');
    expect(said).toBe(sentence);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the label stays «2α» and nothing moves', () => {
    const { facts, refused } = driveThroughGate(['משולש ABC', '∠ABC=2α', '∠ABC=3α']);
    expect(refused.map((r) => r.index)).toEqual([2]);
    const before = replay(facts.slice(), useGeoStore.getState().seed);
    expect(before.labels.angles.map((a) => a.text)).toEqual(['2α']);
  });
});

describe('unchanged — the honest no-op, a number, a relation, a ratio', () => {
  it.each([
    [['משולש ABC', 'זוית B=α'], 'זוית ABC=α'], // the same letter: a true restatement
    [['משולש ABC', '∠ABC=2α'], '∠ABC=2α'],
    [['משולש ABC', '∠ABC=2α'], '∠CBA=2α'], // either ray order is the same angle
    [['משולש ABC', 'AB=a'], 'BA=a'],
  ])('%j then «%s» → «כבר קיים»', async (prefix, line) => {
    const { v } = await decide(prefix as string[], line as string);
    expect(v.kind).toBe('noop');
  });

  it.each([
    [['משולש ABC', '∠ABC=2α'], '∠ABC=50'], // a letter then a number pins α = 25
    [['משולש ABC', 'AB=a'], 'AB=5'],
    [['משולש ABC', 'CB=c', 'AB=a'], 'AB=c'], // c names CB: the relation AB = CB, never a second name
    [['משולש ABC', 'משולש DEF', '∠ABC=2α'], '∠DEF=3α'], // a ratio between two angles
  ])('%j then «%s» → commits', async (prefix, line) => {
    const { v } = await decide(prefix as string[], line as string);
    expect(v.kind).toBe('commit');
  });

  it.each([
    [['משולש ABC', 'זוית B=40'], 'זוית ABC=50', contradicts('זוית ABC=50', 'זוית B=40', '∠ABC = 50°')], // the numeric twin
    [['משולש ABC', '∠ABC=2α', 'α=20'], '∠ABC=3α', contradicts('∠ABC=3α', '∠ABC=2α', '∠ABC = 60°')], // a valued letter: the residual speaks
  ])('%j then «%s» → refused as before', async (prefix, line, sentence) => {
    const { said } = await decide(prefix as string[], line as string);
    expect(said).toBe(sentence);
  });
});

describe('a loaded list holding both lines opens with the second line refused, in the same sentence', () => {
  it.each([
    [['משולש ABC', 'זוית B=α', 'זוית ABC=β'], angleTaken('ABC', 'α', 'זוית B=α')],
    [['משולש ABC', 'AB=a', 'AB=c'], lengthTaken('AB', 'a', 'AB=a')],
    [['משולש ABC', '∠ABC=2α', '∠ABC=3α'], contradicts('∠ABC=3α', '∠ABC=2α', '∠ABC = 3α')],
  ])('%j', (lines, sentence) => {
    const facts = factsOf(lines as string[]);
    const d = replay(facts, 0);
    const raw = d.status[facts[2].id];
    expect(typeof raw).toBe('string');
    expect(stripFormatControls(humanizeError(raw as string, he, facts[2].utterance, otherUtteranceForError(facts, raw as string)))).toBe(sentence);
    expect(d.status[facts[1].id], 'the first line stays green').toBe('ok');
  });
});

describe('measureRestatement — the predicate, read off the statements alone', () => {
  const ang = (v: string, a: string, b: string, coef: number, sym: string): AnyCommand => ({ type: 'measure-angle', vertex: v, ray1: a, ray2: b, expr: { coef, var: sym } });
  const len = (a: string, b: string, coef: number, sym: string, k?: number): AnyCommand => ({ type: 'measure-length', a, b, expr: { coef, var: sym, ...(k ? { const: k } : {}) } });
  const verdict = (prior: AnyCommand[], cmd: AnyCommand) => measureRestatement(cmd, prior, buildSymTab([...prior, cmd]))?.kind ?? null;
  it('names, coefficients, orders', () => {
    expect(verdict([ang('B', 'A', 'C', 1, 'α')], ang('B', 'C', 'A', 1, 'β'))).toBe('name-taken');
    expect(verdict([ang('B', 'A', 'C', 2, 'α')], ang('B', 'C', 'A', 3, 'α'))).toBe('coef-conflict');
    expect(verdict([ang('B', 'A', 'C', 2, 'α')], ang('B', 'C', 'A', 2, 'α'))).toBe('same');
    expect(verdict([len('A', 'B', 1, 'a')], len('B', 'A', 1, 'c'))).toBe('name-taken');
    expect(verdict([len('A', 'B', 2, 'a')], len('A', 'B', 3, 'a'))).toBe('coef-conflict');
  });
  it('leaves equations, relations, radius letters and other targets to the lowering', () => {
    expect(verdict([len('A', 'B', 2, 'a')], len('A', 'B', 1, 'a', 3))).toBeNull(); // an equation in a
    expect(verdict([len('C', 'D', 1, 'c'), len('A', 'B', 1, 'a')], len('A', 'B', 1, 'c'))).toBeNull(); // AB = CD
    expect(verdict([len('A', 'B', 1, 'a')], len('A', 'B', 1, 'R'))).toBeNull(); // the radius
    expect(verdict([ang('B', 'A', 'C', 1, 'α')], ang('E', 'D', 'F', 1, 'β'))).toBeNull(); // another angle
    expect(verdict([ang('B', 'A', 'C', 1, 'α'), { type: 'set-var', name: 'β', value: 40 }], ang('B', 'A', 'C', 1, 'β'))).toBeNull(); // a number
  });
});
