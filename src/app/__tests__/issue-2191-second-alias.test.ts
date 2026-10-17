/**
 * #2191 ([ADR-720](../../../docs/06-decisions.md#adr-720)) — A SECOND ALIAS ON AN ANGLE THAT AN EARLIER ALIAS ALREADY
 * NAMED IS REFUSED WITH ADR-661'S ONE-NAME SENTENCE, NAMING THE LINE THAT GAVE THE FIRST NAME.
 *
 * Measured on `main` @ de7c221f through `decideDeterministic2D` + the real gate, model mocked:
 *   «משולש ABC» · «נסמן זוית ABC כ-A1» · «נסמן זוית ABC כ-B2» (and CBA, «נסמן ∠ABC=B2», «כ 2», English)
 *     → committed; the angle's one label slot took the last name («2») and A1 vanished without a word.
 *
 * Operator ruling 2026-10-16 (ballot round 5, card 5 `second-alias`, option A): "Refuse it with the one-name
 * sentence". One predicate, `measureRestatement` (engine/lower.ts), judged in the fold so the typed door and a
 * loaded list agree.
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
const angleLabels = (lines: string[]) => {
  const { facts } = driveThroughGate(lines);
  return replay(facts.slice(), useGeoStore.getState().seed).labels.angles.map((a) => a.text);
};

describe('#2191 — a second alias for one angle is refused with the one-name sentence', () => {
  const A1 = 'נסמן זוית ABC כ-A1';
  it.each([
    // [prefix, refused line, expected sentence]
    [['משולש ABC', A1], 'נסמן זוית ABC כ-B2', angleTaken('ABC', 'A1', A1)], // the report
    [['משולש ABC', A1], 'נסמן זוית CBA כ-B2', angleTaken('CBA', 'A1', A1)], // rays reversed: the line's own spelling
    [['משולש ABC', A1], 'נסמן ∠ABC=B2', angleTaken('ABC', 'A1', A1)], // the =-binder
    [['משולש ABC', A1], 'נסמן זוית ABC כ 2', angleTaken('ABC', 'A1', A1)], // the bare digit (B2)
    [['משולש ABC', A1], 'label angle ABC as B2', angleTaken('ABC', 'A1', A1)], // English input
    [['משולש ABC', 'נסמן זוית ABC כ-B2'], A1, angleTaken('ABC', 'B2', 'נסמן זוית ABC כ-B2')], // the reverse order
    [['משולש ABC', A1, 'AB=4'], 'נסמן זוית ABC כ-B2', angleTaken('ABC', 'A1', A1)], // a line between
  ])('%j then «%s» → refused', async (prefix, line, sentence) => {
    const { v, said } = await decide(prefix as string[], line as string);
    expect(v.kind, 'refused before it becomes a fact').toBe('refuse');
    expect(said).toBe(sentence);
    expect(llmParseMock, 'never escalated').not.toHaveBeenCalled();
  });

  it('English renders the same sentence shape', async () => {
    const { said } = await decide(['משולש ABC', A1], 'label angle ABC as B2', en);
    expect(said).toBe('Angle ABC already has a name: A1 (in the line «נסמן זוית ABC כ-A1»). An angle has one name — keep using A1.');
  });

  it('the label stays A1', () => {
    expect(angleLabels(['משולש ABC', A1, 'נסמן זוית ABC כ-B2'])).toEqual(['A1']);
    expect(angleLabels(['משולש ABC', 'נסמן זוית ABC כ-B2', A1])).toEqual(['2']); // B2 at B draws its digit (#263)
  });

  it('a loaded list holding both lines shows the second refused, in the same sentence', () => {
    const facts = factsOf(['משולש ABC', A1, 'נסמן זוית ABC כ-B2']);
    const d = replay(facts, 0);
    const last = facts[facts.length - 1];
    expect(last.cmd.type).toBe('angle-alias');
    expect(facts.filter((f) => f.group !== last.group).every((f) => d.status[f.id] === 'ok'), 'the earlier lines stay green').toBe(true);
    const raw = d.status[last.id] as string;
    expect(raw).toMatch(/^name-taken: angle ABC is already named A1 \[vs #\d+\]$/);
    expect(stripFormatControls(humanizeError(raw, he, last.utterance, otherUtteranceForError(facts, raw)))).toBe(angleTaken('ABC', 'A1', A1));
    expect(d.labels.angles.map((a) => a.text)).toEqual(['A1']);
  });
});

describe('unchanged — another angle, the same name elsewhere, the identical alias, a measure letter beside it', () => {
  it('aliases on two different angles both show', async () => {
    const { v } = await decide(['משולש ABC', 'נסמן זוית ABC כ-A1'], 'נסמן זוית BAC כ-B2');
    expect(v.kind).toBe('commit');
    expect(angleLabels(['משולש ABC', 'נסמן זוית ABC כ-A1', 'נסמן זוית BAC כ-B2']).sort()).toEqual(['A1', 'B2']);
  });

  it('the same name on another angle is still the parser\'s alias-taken clarification', async () => {
    const { v } = await decide(['משולש ABC', 'נסמן זוית ABC כ-A1'], 'נסמן זוית BAC כ-A1');
    expect(v.kind).toBe('refuse');
    expect(v.kind === 'refuse' ? v.logs : null).toEqual([{ source: 'parser', result: 'alias-taken:A1' }]);
  });

  it('the identical alias again is not refused here', async () => {
    const { v } = await decide(['משולש ABC', 'נסמן זוית ABC כ-A1'], 'נסמן זוית ABC כ-A1');
    expect(v.kind).not.toBe('refuse');
  });

  it.each([
    [['משולש ABC', 'נסמן זוית ABC כ-A1'], 'זוית ABC=β'],
    [['משולש ABC', 'זוית ABC=β'], 'נסמן זוית ABC כ-A1'],
  ])('a measure letter beside an alias is not a second name: %j then «%s» commits', async (prefix, line) => {
    const { v } = await decide(prefix as string[], line as string);
    expect(v.kind).toBe('commit');
  });
});

describe('measureRestatement — the alias arm, read off the statements alone', () => {
  const tri: AnyCommand = { type: 'polygon', ids: ['A', 'B', 'C'] } as AnyCommand;
  const alias = (name: string, ray1: string, vertex: string, ray2: string): AnyCommand => ({ type: 'angle-alias', name, vertex, ray1, ray2 });
  const verdict = (prior: AnyCommand[], cmd: AnyCommand) => measureRestatement(cmd, prior, buildSymTab([...prior, cmd]))?.kind ?? null;
  it('another name on the same angle, either ray order → name-taken at the first alias', () => {
    expect(verdict([tri, alias('A1', 'A', 'B', 'C')], alias('B2', 'A', 'B', 'C'))).toBe('name-taken');
    expect(verdict([tri, alias('A1', 'A', 'B', 'C')], alias('B2', 'C', 'B', 'A'))).toBe('name-taken');
    expect(measureRestatement(alias('B2', 'A', 'B', 'C'), [tri, alias('A1', 'A', 'B', 'C')], buildSymTab([]))?.at).toBe(1);
  });
  it('the same name → same; another angle, or a measure letter on it → null', () => {
    expect(verdict([tri, alias('A1', 'A', 'B', 'C')], alias('A1', 'C', 'B', 'A'))).toBe('same');
    expect(verdict([tri, alias('A1', 'A', 'B', 'C')], alias('B2', 'B', 'A', 'C'))).toBe(null);
    const beta: AnyCommand = { type: 'measure-angle', vertex: 'B', ray1: 'A', ray2: 'C', expr: { var: 'β', coef: 1 } } as AnyCommand;
    expect(verdict([tri, beta], alias('A1', 'A', 'B', 'C'))).toBe(null);
    expect(verdict([tri, alias('A1', 'A', 'B', 'C')], beta)).toBe(null);
  });
});
