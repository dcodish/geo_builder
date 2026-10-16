/**
 * #2119 ([ADR-683](../../../docs/06-decisions.md#adr-683)) — A SECOND, DIFFERENT STATED SIZE FOR A CIRCLE IS REFUSED AS A
 * CONTRADICTION NAMING THE FIRST, in every spelling (radius, circumference, area, English), with or without a point on
 * the circle.
 *
 * Measured on the item-1 tip (ADR-681, on ef78f15c) through `decideDeterministic2D` + the store, seed 0, model mocked:
 *   «מעגל O ברדיוס 3» · «מעגל O ברדיוס 4» (and "circle O with radius 4", «מעגל שמרכזו O ורדיוסו 4», «radius of circle O
 *   is 4», «היקף המעגל O הוא 10π»)                                → noop «כבר קיים», r = 3, the 4 dropped
 *   «מעגל O ברדיוס 5» · «רדיוס המעגל O הוא 3» / «רדיוס מעגל O הוא 3» → noop «כבר קיים»
 *   the same with «A על מעגל O» between                              → commit GREEN, r = 4 (5), the first row still ✓
 *
 * Operator ruling 2026-10-15 (decisions ballot card 4, A): refused «לא ניתן: «מעגל O ברדיוס 4» סותר את «מעגל O ברדיוס 3»
 * — אי אפשר לקיים את שניהם יחד.»; to change a radius the student edits or mutes the old row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
const en: Translate = (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function submit(lines: string[], t: Translate = he) {
  useGeoStore.getState().clear();
  const out: { kind: string; said: string | null }[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
    }
    const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
    out.push({ kind: v.kind, said: raw ? stripFormatControls(humanizeError(raw, t, line, otherUtteranceForError(st.facts, raw))) : null });
  }
  return out;
}
const radius = (id = 'circle-O') => {
  const st = useGeoStore.getState();
  return replay(st.facts, st.seed).circles.get(id)!.r;
};
const allGreen = () => {
  const st = useGeoStore.getState();
  const fig = replay(st.facts, st.seed);
  expect(fig.lastError).toBeNull();
  for (const f of st.facts) expect(fig.status[f.id], f.utterance).toBe('ok');
};
const contradicts = (line: string, other: string) => `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד.`;

describe('#2119 — a second, different stated size for a circle is refused naming the first', () => {
  it.each([
    // [first line, between, refused line, the radius that stands]
    ['מעגל O ברדיוס 3', [], 'מעגל O ברדיוס 4', 3], // the operator's card, verbatim
    ['מעגל O ברדיוס 3', [], 'circle O with radius 4', 3],
    ['מעגל O ברדיוס 3', [], 'מעגל שמרכזו O ורדיוסו 4', 3],
    ['מעגל O ברדיוס 3', [], 'radius of circle O is 4', 3],
    ['מעגל O ברדיוס 5', [], 'רדיוס המעגל O הוא 3', 5], // the ruling's measured correction
    ['מעגל O ברדיוס 5', [], 'רדיוס מעגל O הוא 3', 5], // the #2206 spelling
    ['מעגל O ברדיוס 3', [], 'היקף המעגל O הוא 10π', 3],
    ['מעגל O ברדיוס 3', [], 'שטח המעגל O הוא 16π', 3],
    // with a point on the circle: these resized silently and committed GREEN
    ['מעגל O ברדיוס 3', ['A על מעגל O'], 'מעגל O ברדיוס 4', 3],
    ['מעגל O ברדיוס 3', ['A על מעגל O'], 'רדיוס המעגל O הוא 4', 3],
    ['מעגל O ברדיוס 3', ['A על מעגל O'], 'radius of circle O is 4', 3],
    ['מעגל O ברדיוס 3', ['A על מעגל O'], 'היקף המעגל O הוא 10π', 3],
    ['מעגל O ברדיוס 3', ['A על מעגל O'], 'שטח המעגל O הוא 16π', 3],
  ] as [string, string[], string, number][])('«%s» · %j · «%s» → refused', async (first, between, line, r) => {
    const out = await submit([first, ...between, line]);
    expect(out[out.length - 1].kind).toBe('refuse');
    expect(out[out.length - 1].said).toBe(contradicts(line, first));
    expect(radius()).toBeCloseTo(r, 9);
    allGreen();
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('a size given by a radius sentence is the statement named', async () => {
    const out = await submit(['מעגל O', 'רדיוס המעגל O הוא 3', 'רדיוס המעגל O הוא 4']);
    expect(out[2].said).toBe(contradicts('רדיוס המעגל O הוא 4', 'רדיוס המעגל O הוא 3'));
    expect(radius()).toBeCloseTo(3, 9);
  });

  it('a radius letter\'s value is the statement named (ADR-682)', async () => {
    const out = await submit(['מעגל O ברדיוס r', 'A על מעגל O', 'r = 3', 'מעגל O ברדיוס 4']);
    expect(out[3].said).toBe(contradicts('מעגל O ברדיוס 4', 'r = 3'));
    expect(radius()).toBeCloseTo(3, 9);
  });

  it('the #2206 report: a stated radius after an inner tangency', async () => {
    const out = await submit(['מעגל O ברדיוס 5', 'מעגל P ברדיוס 2', 'המעגלים O ו-P משיקים מבפנים', 'רדיוס מעגל P הוא 3']);
    expect(out[3].said).toBe(contradicts('רדיוס מעגל P הוא 3', 'מעגל P ברדיוס 2'));
    expect(radius('circle-P')).toBeCloseTo(2, 9);
  });

  it('English renders the same frame', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'circle O with radius 4'], en);
    expect(out[1].said).toBe("Can't do that: «circle O with radius 4» contradicts «מעגל O ברדיוס 3» — they can't both hold.");
  });
});

describe('a saved list holding both lines opens with the later row ✗ in the same sentence', () => {
  const loaded = (facts: Fact[]) => {
    const fig = replay(facts, 0);
    const last = facts[facts.length - 1];
    const raw = fig.status[last.id];
    return { fig, raw, said: raw === 'ok' ? null : stripFormatControls(humanizeError(raw, he, last.utterance, otherUtteranceForError(facts, raw))) };
  };

  it.each([
    [['מעגל O ברדיוס 3', 'מעגל O ברדיוס 4']],
    [['מעגל O ברדיוס 3', 'A על מעגל O', 'מעגל O ברדיוס 4']],
    [['מעגל O ברדיוס 5', 'רדיוס המעגל O הוא 3']],
  ])('%j', (lines) => {
    const facts = factsOf(lines);
    const { fig, said } = loaded(facts);
    expect(said).toBe(contradicts(lines[lines.length - 1], lines[0]));
    expect(fig.circles.get('circle-O')!.r).toBeCloseTo(Number(lines[0].match(/\d+/)![0]), 9);
  });

  it('a second `circle` command (the AI\'s or an older saved file\'s) is appended and refused, never an overwrite', () => {
    const facts: Fact[] = [
      { id: 'a', group: 'g0', utterance: 'מעגל O ברדיוס 3', enabled: true, cmd: { type: 'circle', id: 'circle-O', center: 'O', radius: 3 } },
      { id: 'b', group: 'g1', utterance: 'A על מעגל O', enabled: true, cmd: { type: 'point-on-circle', id: 'A', circle: 'circle-O' } },
    ];
    useGeoStore.getState().clear();
    for (const f of facts) useGeoStore.getState().execute(f.cmd, f.utterance!, f.group!);
    useGeoStore.getState().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 4 }, 'the circle has radius 4', 'g2');
    const st = useGeoStore.getState();
    expect(st.facts).toHaveLength(3);
    const fig = replay(st.facts, st.seed);
    expect(fig.circles.get('circle-O')!.r).toBeCloseTo(3, 9);
    expect(fig.status[st.facts[2].id]).toMatch(/^over-constrained: radius of circle-O = 4 cannot hold \[vs #0\]$/);
  });
});

describe('unchanged', () => {
  it('the same radius twice is «כבר קיים»', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'מעגל O ברדיוס 3']);
    expect(out[1].kind).toBe('noop');
  });
  it('a circumference equal to the radius is «כבר קיים»', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'היקף המעגל O הוא 6π']);
    expect(out[1].kind).toBe('noop');
  });
  it('a size given to a sizeless circle sizes it', async () => {
    const out = await submit(['מעגל O', 'רדיוס המעגל O הוא 3']);
    expect(out[1].kind).toBe('commit');
    expect(radius()).toBeCloseTo(3, 9);
  });
  it('«OA=4» on a radius-3 circle is refused naming the membership', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'A על מעגל O', 'OA=4']);
    expect(out[2].said).toBe('לא ניתן: «OA=4» סותר את «A על מעגל O» — אי אפשר לקיים את שניהם יחד. הסיבה: |OA| = 4.');
  });
});
