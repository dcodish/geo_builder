/**
 * #2112 ([ADR-698](../../../docs/06-decisions.md#adr-698)) — A RADIUS RELATION'S REFUSAL NAMES THE RADII AND THE
 * STATEMENT THAT SIZED THE CIRCLE, never the hidden helper distance it is lowered to.
 *
 * Measured at pickup on 4b0b4592 through `decideDeterministic2D` + the store, seed 0, model mocked:
 *   «מעגל O ברדיוס 4» · «מעגל P ברדיוס 3» · «רדיוס מעגל O גדול פי 2 מרדיוס מעגל P»
 *     → «… סותר נתון קודם — אי אפשר לקיים את שניהם יחד. הסיבה: |O⟨…⟩| = 2·|P⟨…⟩|.»
 *   the same with «A על מעגל O» / «B על מעגל P» → «… הסיבה: |OA| = 2·|PB|.»
 *   «מעגל O ברדיוס R» · «מעגל P ברדיוס r» · «R = 2r» · «R = 4» · «r = 3» → the ratio row ✗ «|O⟨…⟩| = 2·|P⟨…⟩|»
 *   the reversed order («מעגל O ברדיוס 4» last) → «… הסיבה: |O⟨…⟩| = 2·|P⟨…⟩|.»
 *
 * Operator ruling 2026-10-15 (decisions ballot card 3, A), the sentence approved as written:
 *   «לא ניתן: «רדיוס מעגל O גדול פי 2 מרדיוס מעגל P» סותר את «מעגל O ברדיוס 4» — אי אפשר לקיים את שניהם יחד.
 *    הסיבה: רדיוס מעגל O = 2 · רדיוס מעגל P.»  (the circle names and numbers are the student's own)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { explainError, humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError, utteranceForError } from '@/app/errorSubject';
import { describeConstraint } from '@/engine/solve';
import { replay, useGeoStore } from '@/store/geoStore';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
const en: Translate = (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** Every line through the real door; returns the LAST line's humanised refusal (null when it committed). */
async function submit(lines: string[], t: Translate = he): Promise<string | null> {
  useGeoStore.getState().clear();
  let said: string | null = null;
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
    }
    const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
    said = raw ? stripFormatControls(humanizeError(raw, t, line, otherUtteranceForError(st.facts, raw))) : null;
  }
  return said;
}

const RULED =
  'לא ניתן: «רדיוס מעגל O גדול פי 2 מרדיוס מעגל P» סותר את «מעגל O ברדיוס 4» — אי אפשר לקיים את שניהם יחד. הסיבה: רדיוס מעגל O = 2 · רדיוס מעגל P.';

describe('#2112 — a contradicted radius ratio is refused naming the radii and the sizing statement', () => {
  it('the operator’s filing reads the ruled sentence, verbatim', async () => {
    expect(await submit(['מעגל O ברדיוס 4', 'מעגל P ברדיוס 3', 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P'])).toBe(RULED);
  });

  it('with a real point on each circle the reason still names the radii, not |OA| = 2·|PB|', async () => {
    expect(await submit(['מעגל O ברדיוס 4', 'A על מעגל O', 'מעגל P ברדיוס 3', 'B על מעגל P', 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P'])).toBe(RULED);
  });

  it('the reversed order: the size typed last is refused naming the ratio, the reason the radii', async () => {
    expect(await submit(['מעגל O', 'מעגל P ברדיוס 3', 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P', 'מעגל O ברדיוס 4'])).toBe(
      'לא ניתן: «מעגל O ברדיוס 4» סותר את «רדיוס מעגל O גדול פי 2 מרדיוס מעגל P» — אי אפשר לקיים את שניהם יחד. הסיבה: רדיוס מעגל O = 2 · רדיוס מעגל P.',
    );
  });

  it('«R = 2r» completed by later values: the row and the banner name the radii; the newest statement keeps the blame (ADR-554)', async () => {
    expect(await submit(['מעגל O ברדיוס R', 'מעגל P ברדיוס r', 'R = 2r', 'R = 4', 'r = 3'])).toBeNull(); // «r = 3» commits
    const st = useGeoStore.getState();
    const fig = replay(st.facts, st.seed);
    expect(fig.lastError).toMatch(/^over-constrained: radius\(circle-O\) = 2 · radius\(circle-P\) cannot hold \[vs #\d+\]$/);
    const banner = stripFormatControls(explainError(fig.lastError, he, utteranceForError(st.facts, fig.status, fig.lastError), otherUtteranceForError(st.facts, fig.lastError)));
    expect(banner).toContain('«R = 2r» סותר את «r = 3»');
    expect(banner).toContain('הסיבה: רדיוס מעגל O = 2 · רדיוס מעגל P.');
    expect(banner).not.toContain('⟨…⟩');
  });

  it('English: the same refusal reads «radius of circle O = 2 · radius of circle P»', async () => {
    const said = await submit(['circle O with radius 4', 'circle P with radius 3', 'the radius of circle O is 2 times the radius of circle P'], en);
    expect(said).toContain('radius of circle O = 2 · radius of circle P');
    expect(said).toContain('circle O with radius 4');
    expect(said).not.toContain('⟨…⟩');
  });

  it('unchanged: a ratio the circles satisfy still builds green', async () => {
    expect(await submit(['מעגל O ברדיוס 6', 'מעגל P ברדיוס 3', 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P'])).toBeNull();
  });
});

describe('#2112 — describeConstraint names a radius relation by its radii', () => {
  it('a ratio carrying radii', () => {
    expect(describeConstraint({ type: 'ratio', a: 'O', b: '~radw-circle-O', c: 'P', d: '~radw-circle-P', k: 2, radii: { c1: 'circle-O', c2: 'circle-P' } })).toBe(
      'radius(circle-O) = 2 · radius(circle-P)',
    );
  });
  it('unchanged: a plain length ratio', () => {
    expect(describeConstraint({ type: 'ratio', a: 'O', b: 'A', c: 'P', d: 'B', k: 2 })).toBe('|OA| = 2·|PB|');
  });
});
