/**
 * #2173 ([ADR-726](../../../docs/06-decisions.md#adr-726)) — an angle named with a LATIN letter builds, and the
 * step suggests a Greek letter (ADR-428's teach on acceptance).
 *
 * Measured on `main` 688dfb96 through `decideDeterministic2D`: after «משולש ABC», «זוית B=b», «∠ABC = x»,
 * «זווית ABC היא k», «∠ABC = x + 40», «∠ABC = 2x» and "angle B = b" each committed their `measure-angle` with
 * `note: null` — accepted, labelled with the student's letter, no word. Operator, 2026-10-15: *"it should
 * suggest the user to greek letters for angles"*; the sentence ruled the same day: «נקלט. לזוויות נהוג להשתמש
 * באותיות יווניות — למשל «זוית B=β».»
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { appendNote, decideDeterministic2D, type DecideNote, type Verdict2D } from '../decideDeterministic';
import { commitVerdict, runSubmit, type SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { latinAngleLetters } from '@/parser';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

const GREEK_TIP: DecideNote = { key: 'input.greekAngleLetter' };

/** Every line through the student's own lane — `decideDeterministic2D` then the pipeline's `commitVerdict`. */
async function run(lines: string[], locale: 'he' | 'en' = 'he'): Promise<Verdict2D[]> {
  const st = () => useGeoStore.getState();
  st().clear();
  const out: Verdict2D[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
    out.push(v);
    if (v.kind === 'commit') commitVerdict(v, line);
  }
  return out;
}

/** The notes a step carries, first to last (its `also` chain). */
const chain = (n: DecideNote | null | undefined): string[] => (!n ? [] : 'explain' in n ? ['explain'] : [n.key, ...chain(n.also)]);

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2173 — a Latin letter naming an angle builds, with the Greek-letter suggestion', () => {
  it.each([
    ['זוית B=b', 'b', 1, undefined],
    ['זווית B = b', 'b', 1, undefined],
    ['∠ABC = x', 'x', 1, undefined],
    ['זווית ABC היא k', 'k', 1, undefined],
    ['∠ABC = x + 40', 'x', 1, 40],
    ['∠ABC = 2x', 'x', 2, undefined],
  ])('«%s» after «משולש ABC» commits with the letter %s and carries the suggestion', async (line, letter, coef, constant) => {
    const [, v] = await run(['משולש ABC', line]);
    expect(v.kind, line).toBe('commit');
    if (v.kind !== 'commit') return;
    const m = v.commands.find((c) => c.type === 'measure-angle');
    expect(m && m.type === 'measure-angle' && m.expr, 'the student’s letter is kept').toMatchObject({ coef, var: letter, ...(constant ? { const: constant } : {}) });
    expect(chain(v.note)).toEqual(['input.greekAngleLetter']);
    expect(llmParseMock).not.toHaveBeenCalled();
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    expect(fig.lastError, 'builds').toBeNull();
    expect(fig.violations, 'the verifier is clean').toEqual([]);
  });

  it('the English locale reads it the same', async () => {
    const [, v] = await run(['triangle ABC', 'angle B = b'], 'en');
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && chain(v.note)).toEqual(['input.greekAngleLetter']);
  });

  it.each([
    ['∠ABC = β', 'a Greek letter'],
    ['∠ABC = 2α', 'a Greek letter with a coefficient'],
    ['∠ABC = 40', 'a number'],
    ['AB = b', 'a length (Latin letters are the convention there)'],
    ['AB = 3x', 'a length with a coefficient'],
  ])('«%s» carries no suggestion — %s', async (line) => {
    const [, v] = await run(['משולש ABC', line]);
    expect(v.kind, line).toBe('commit');
    expect(v.kind === 'commit' && chain(v.note)).not.toContain('input.greekAngleLetter');
  });

  it('fires once per letter: a later line reusing the letter is not told again; a new letter is', async () => {
    const [, first, again, fresh] = await run(['משולש ABC', 'זוית B=b', 'זוית C=b', '∠BAC = y']);
    expect(first.kind === 'commit' && chain(first.note)).toEqual(['input.greekAngleLetter']);
    expect(again.kind).toBe('commit');
    expect(again.kind === 'commit' && chain(again.note)).toEqual([]);
    expect(fresh.kind === 'commit' && chain(fresh.note)).toEqual(['input.greekAngleLetter']);
  });

  it('a letter already used as a LENGTH still gets the suggestion when it first names an angle', async () => {
    const [, len, ang] = await run(['משולש ABC', 'AB = x', '∠ABC = x']);
    expect(len.kind === 'commit' && chain(len.note)).toEqual([]);
    expect(ang.kind === 'commit' && chain(ang.note)).toEqual(['input.greekAngleLetter']);
  });

  it('rides BESIDE a note the step already has, never in place of it', async () => {
    // a lone vertex read as the triangle's interior angle is said aloud (#1445) — both notes show
    const vs = await run(['משולש ABC', 'D על AC', 'קטע BD', 'זוית B=b']);
    const v = vs[vs.length - 1];
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && chain(v.note)).toEqual(['input.vertexAngleReadAs', 'input.greekAngleLetter']);
  });

  it('the submit pipeline shows both notes on the one line, the suggestion last', async () => {
    await run(['משולש ABC', 'D על AC', 'קטע BD']);
    const notes: string[] = [];
    const deps: SubmitDeps = {
      t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
      locale: 'he',
      ui: { setInputNote: (m) => notes.push(m), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const d = replay(st.facts, st.seed);
        return { construction: d.construction, positions: d.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {},
      llmAbortRef: { current: null },
      explainError: (raw) => raw ?? '',
    };
    await runSubmit('זוית B=b', deps);
    const shown = notes.filter(Boolean);
    expect(shown).toEqual(['input.vertexAngleReadAs:{"angles":"∠ABC"} input.greekAngleLetter']);
  });

  it('the sentence is the one the operator ruled, in both locales', () => {
    expect(he.input.greekAngleLetter).toBe('נקלט. לזוויות נהוג להשתמש באותיות יווניות — למשל «זוית B=β».');
    expect(en.input.greekAngleLetter).toBe('Got it. Angles are usually named with Greek letters — for example «angle B = β».');
  });

  it('the example the sentence teaches builds', async () => {
    const [, v] = await run(['משולש ABC', 'זוית B=β']);
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && chain(v.note)).not.toContain('input.greekAngleLetter');
  });
});

describe('#2173 — the predicate and the note chain', () => {
  const ang = (v: string) => ({ type: 'measure-angle' as const, vertex: 'B', ray1: 'A', ray2: 'C', expr: { coef: 1, var: v } });
  it('reads only an angle’s Latin letter, once, and not one an earlier command already gave an angle', () => {
    expect(latinAngleLetters([ang('b')])).toEqual(['b']);
    expect(latinAngleLetters([ang('K')])).toEqual(['K']);
    expect(latinAngleLetters([ang('α')])).toEqual([]);
    expect(latinAngleLetters([{ type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'b' } }])).toEqual([]);
    expect(latinAngleLetters([ang('b')], [ang('b')])).toEqual([]);
    expect(latinAngleLetters([ang('b')], [{ type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'b' } }])).toEqual(['b']);
    expect(latinAngleLetters([{ type: 'measure-angle', vertex: 'B', ray1: 'A', ray2: 'C', expr: { value: 40 } }])).toEqual([]);
  });
  it('appendNote puts the tip at the end of the chain', () => {
    expect(appendNote(null, GREEK_TIP)).toEqual(GREEK_TIP);
    expect(appendNote({ key: 'a' }, GREEK_TIP)).toEqual({ key: 'a', also: GREEK_TIP });
    expect(appendNote({ key: 'a', also: { key: 'b' } }, GREEK_TIP)).toEqual({ key: 'a', also: { key: 'b', also: GREEK_TIP } });
  });
});
