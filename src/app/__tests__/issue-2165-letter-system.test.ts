/**
 * #2165 + #2135 + #2133 ([ADR-681](../../../docs/06-decisions.md#adr-681)) — A LETTER'S VALUES ARE JUDGED IN LIST ORDER BY
 * THE LETTER SYSTEM: a second value becomes an equation or a contradiction refusal, never «זה כבר קיים» or last-wins.
 *
 * Measured on `main` @ ef78f15c through `decideDeterministic2D` + the store, seed 0, the model mocked:
 *   «משולש ABC» · «AB=2a» · «AB=a+3»                       → noop «כבר קיים», the equation dropped (#2165)
 *   «משולש ABC» · «AB = 5» · «AB = a» (· «a = 6»)           → noop, then a red «variable a is not defined» row
 *   «משולש ABC» · «AB = a» · «AB = 5» · «a = 6»              → all commit; «AB = 5» goes red, drawn at 6
 *   «מעגל O ברדיוס r» · «r = 3» · «r = 4» (#2135)           → green, r = 4 (the last value won)
 *   «משולש ABC» · «AB = x» · «x = 3» · «x = 4» (#2135)       → green, |AB| = 4
 *   «מעגל O ברדיוס 4» · «A, B על מעגל O» · «AB = r» · «r = 3» (#2133) → green, radius 4 and |AB| = 3
 *   «מעגל O ברדיוס 3» · «r = 4»                              → green, r = 3
 *
 * Operator rulings: #2165 2026-10-15 (A: solve it), #2119 2026-10-15 (a second radius is a contradiction, in 2-D's
 * wording), #2105 card 4 (a second, different size for the same thing is a contradiction); ADR-034 Am. 1 (R/r always
 * names the radius).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
const en: Translate = (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

type Outcome = { line: string; kind: string; said: string | null };

/** Submit each line through the real pre-LLM decision, committing what it commits, exactly as the app does. */
async function submit(lines: string[], t: Translate = he): Promise<Outcome[]> {
  useGeoStore.getState().clear();
  const out: Outcome[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
    }
    const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
    out.push({ line, kind: v.kind, said: raw ? stripFormatControls(humanizeError(raw, t, line, otherUtteranceForError(st.facts, raw))) : null });
  }
  return out;
}

const figure = () => {
  const st = useGeoStore.getState();
  return { facts: st.facts, fig: replay(st.facts, st.seed) };
};
const len = (a: string, b: string) => {
  const p = figure().fig.positions;
  return Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
};
const angleAt = (a: string, v: string, c: string) => {
  const p = figure().fig.positions;
  const [A, V, C] = [p.get(a)!, p.get(v)!, p.get(c)!];
  const u = Math.atan2(A.y - V.y, A.x - V.x);
  const w = Math.atan2(C.y - V.y, C.x - V.x);
  const d = Math.abs(((u - w) * 180) / Math.PI) % 360;
  return d > 180 ? 360 - d : d;
};
/** every committed row green and the verifier clean */
const allGreen = () => {
  const { facts, fig } = figure();
  expect(fig.lastError).toBeNull();
  expect(fig.violations).toEqual([]);
  for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
};
const contradicts = (line: string, other: string, what?: string) =>
  `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד.${what ? ` הסיבה: ${what}.` : ''}`;

describe('#2165 — an equation on a letter is solved: «AB=2a» · «AB=a+3» draws a = 3, |AB| = 6', () => {
  it.each([
    [['משולש ABC', 'AB=2a', 'AB=a+3']], // the operator's sequence
    [['משולש ABC', 'AB=a+3', 'AB=2a']], // the other order
    [['משולש ABC', 'AB = 2a', 'AB = a + 3']],
    [['משולש ABC', 'AB=2a', 'BA=a+3']], // the segment in either spelling order
  ])('%j commits green with |AB| = 6', async (lines) => {
    const out = await submit(lines);
    expect(out.map((o) => o.kind)).toEqual(['commit', 'commit', 'commit']);
    expect(len('A', 'B')).toBeCloseTo(6, 4);
    allGreen();
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the labels stay as the student typed them — no number replaces the letters', async () => {
    await submit(['משולש ABC', 'AB=2a', 'AB=a+3']);
    const texts = figure().fig.labels.lengths.map((l) => l.text);
    expect(texts.some((t) => /a/.test(t))).toBe(true);
    expect(texts).not.toContain('6');
  });

  it('the derived value reaches every other use of the letter: «CD = a» is drawn at 3', async () => {
    await submit(['משולש ABC', 'AB=2a', 'AB=a+3', 'BC = a']);
    expect(len('B', 'C')).toBeCloseTo(3, 4);
    allGreen();
  });

  it('the angle twin is unchanged: «∠ABC = 2α» · «∠ABC = α + 40» is 80°', async () => {
    await submit(['משולש ABC', '∠ABC = 2α', '∠ABC = α + 40']);
    expect(angleAt('A', 'B', 'C')).toBeCloseTo(80, 4);
    allGreen();
  });
});

describe('#2165 — a letter given to a measured target binds it: «AB = a» after «AB = 5» commits', () => {
  it('«AB = a» after «AB = 5» commits with the letter as the label', async () => {
    const out = await submit(['משולש ABC', 'AB = 5', 'AB = a']);
    expect(out[2].kind).toBe('commit');
    expect(len('A', 'B')).toBeCloseTo(5, 4);
    expect(figure().fig.labels.lengths.find((l) => [l.a, l.b].sort().join('') === 'AB')?.text).toBe('a');
    allGreen();
  });

  it('«∠ABC = α» after «∠ABC = 40» commits with the letter as the label', async () => {
    const out = await submit(['משולש ABC', '∠ABC = 40', '∠ABC = α']);
    expect(out[2].kind).toBe('commit');
    expect(angleAt('A', 'B', 'C')).toBeCloseTo(40, 4);
    expect(figure().fig.labels.angles.find((l) => l.vertex === 'B')?.text).toBe('α');
    allGreen();
  });

  it('the same letter on the same target twice is still the honest «כבר קיים»', async () => {
    const out = await submit(['משולש ABC', 'AB = 5', 'AB = a', 'BA = a']);
    expect(out[3].kind).toBe('noop');
  });
});

describe('#2165 — a value that contradicts the letter\'s value is refused, naming the statement that gave it', () => {
  it.each([
    [['משולש ABC', 'AB = a', 'AB = 5'], 'a = 6', contradicts('a = 6', 'AB = 5', '|AB| = 6')],
    [['משולש ABC', 'AB = 5', 'AB = a'], 'a = 6', contradicts('a = 6', 'AB = 5', '|AB| = 6')], // was a red «not defined» row
    [['משולש ABC', '∠ABC = α', '∠ABC = 40'], 'α = 50', contradicts('α = 50', '∠ABC = 40', '∠ABC = 50°')],
    [['משולש ABC', '∠ABC = 40', '∠ABC = α'], 'α = 50', contradicts('α = 50', '∠ABC = 40', '∠ABC = 50°')],
    [['משולש ABC', 'AB=2a', 'AB=a+3'], 'a = 4', contradicts('a = 4', 'AB=a+3', '|AB| = 8')],
  ])('%j then «%s» → refused', async (prefix, line, sentence) => {
    const out = await submit([...prefix, line]);
    expect(out.slice(0, -1).map((o) => o.kind)).not.toContain('refuse');
    expect(out[out.length - 1].kind).toBe('refuse');
    expect(out[out.length - 1].said).toBe(sentence);
    allGreen(); // nothing turned red: the earlier rows still hold
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the other order is unchanged: «AB = 5» after «AB = a» · «a = 6» is refused naming «AB = a»', async () => {
    const out = await submit(['משולש ABC', 'AB = a', 'a = 6', 'AB = 5']);
    expect(out[3].said).toBe(contradicts('AB = 5', 'AB = a', '|AB| = 5'));
  });
});

describe('#2135 — a letter given two values: the second is refused, the first stands', () => {
  it('«x = 4» after «AB = x» · «x = 3» (the reported length sequence)', async () => {
    const out = await submit(['משולש ABC', 'AB = x', 'x = 3', 'x = 4']);
    expect(out[3].said).toBe(contradicts('x = 4', 'x = 3', '|AB| = 4'));
    expect(len('A', 'B')).toBeCloseTo(3, 4);
    allGreen();
  });

  it('«r = 4» after «מעגל O ברדיוס r» · «r = 3» (the reported radius sequence) — the ruled sentence, no reason clause', async () => {
    const out = await submit(['מעגל O ברדיוס r', 'r = 3', 'r = 4']);
    expect(out[2].said).toBe(contradicts('r = 4', 'r = 3'));
    expect(figure().fig.circles.get('circle-O')!.r).toBeCloseTo(3, 9);
    allGreen();
  });

  it('English renders the same frame', async () => {
    const out = await submit(['משולש ABC', 'AB = x', 'x = 3', 'x = 4'], en);
    expect(out[3].said).toBe("Can't do that: «x = 4» contradicts «x = 3» — they can't both hold. The reason: |AB| = 4.");
    const r = await submit(['מעגל O ברדיוס r', 'r = 3', 'r = 4'], en);
    expect(r[2].said).toBe("Can't do that: «r = 4» contradicts «r = 3» — they can't both hold.");
  });

  it('the same value again is no contradiction', async () => {
    const out = await submit(['משולש ABC', 'AB = x', 'x = 3', 'x = 3']);
    expect(out[3].kind).not.toBe('refuse');
    expect(len('A', 'B')).toBeCloseTo(3, 4);
  });
});

describe('#2133 — R/r always names the radius (ADR-034 Am. 1), also when it is given a value', () => {
  it('the reported four lines: «r = 3» is refused against «מעגל O ברדיוס 4»', async () => {
    const out = await submit(['מעגל O ברדיוס 4', 'A, B על מעגל O', 'AB = r', 'r = 3']);
    expect(out[3].said).toBe(contradicts('r = 3', 'מעגל O ברדיוס 4'));
    expect(figure().fig.circles.get('circle-O')!.r).toBeCloseTo(4, 9);
    expect(len('A', 'B')).toBeCloseTo(4, 4);
    allGreen();
  });

  it.each([
    [['מעגל O ברדיוס 3'], 'r = 4', contradicts('r = 4', 'מעגל O ברדיוס 3')],
    [['מעגל O', 'רדיוס המעגל O הוא 3'], 'r = 4', contradicts('r = 4', 'רדיוס המעגל O הוא 3')],
    [['מעגל O ברדיוס r', 'A על מעגל O', 'r = 3'], 'מעגל O ברדיוס 4', contradicts('מעגל O ברדיוס 4', 'r = 3')],
  ])('%j then «%s» → refused', async (prefix, line, sentence) => {
    const out = await submit([...prefix, line]);
    expect(out[out.length - 1].said).toBe(sentence);
    allGreen();
  });

  it('the value the radius already has is no contradiction', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'r = 3']);
    expect(out[1].kind).not.toBe('refuse');
  });
});

describe('a saved list holding both lines opens with the LATER row ✗, in the same sentence (no door)', () => {
  it.each([
    [['משולש ABC', 'AB = x', 'x = 3', 'x = 4'], contradicts('x = 4', 'x = 3', '|AB| = 4')],
    [['מעגל O ברדיוס r', 'r = 3', 'r = 4'], contradicts('r = 4', 'r = 3')],
    [['מעגל O ברדיוס 4', 'A, B על מעגל O', 'AB = r', 'r = 3'], contradicts('r = 3', 'מעגל O ברדיוס 4')],
    [['מעגל O ברדיוס 3', 'r = 4'], contradicts('r = 4', 'מעגל O ברדיוס 3')],
    [['משולש ABC', 'AB = a', 'AB = 5', 'a = 6'], contradicts('a = 6', 'AB = 5', '|AB| = 6')],
  ])('%j', (lines, sentence) => {
    const facts = factsOf(lines);
    const fig = replay(facts, 0);
    const last = facts[facts.length - 1];
    const raw = fig.status[last.id];
    expect(raw).not.toBe('ok');
    expect(stripFormatControls(humanizeError(raw, he, last.utterance, otherUtteranceForError(facts, raw)))).toBe(sentence);
    for (const f of facts.slice(0, -1)) expect(fig.status[f.id], f.utterance).toBe('ok');
  });

  it('an equation in a saved list builds green', () => {
    const facts = factsOf(['משולש ABC', 'AB=2a', 'AB=a+3']);
    const fig = replay(facts, 0);
    for (const f of facts) expect(fig.status[f.id]).toBe('ok');
  });
});

describe('controls — unchanged', () => {
  it('«AB=2a» · «AB=3a» is refused (ADR-661)', async () => {
    const out = await submit(['משולש ABC', 'AB=2a', 'AB=3a']);
    expect(out[2].said).toBe(contradicts('AB=3a', 'AB=2a', '|AB| = 3a'));
  });
  it('«AB = 4» · «AB = 5» is refused (the residual)', async () => {
    const out = await submit(['משולש ABC', 'AB = 4', 'AB = 5']);
    expect(out[2].said).toBe(contradicts('AB = 5', 'AB = 4', '|AB| = 5'));
  });
  it('«AB = 5» twice is «כבר קיים»', async () => {
    const out = await submit(['משולש ABC', 'AB = 5', 'AB = 5']);
    expect(out[2].kind).toBe('noop');
  });
  it('«AB=2a» · «AB=6» commits at 6', async () => {
    const out = await submit(['משולש ABC', 'AB=2a', 'AB=6']);
    expect(out[2].kind).toBe('commit');
    expect(len('A', 'B')).toBeCloseTo(6, 4);
    allGreen();
  });
  it('«∠ABC = α» · «∠ABC = α + 40» is refused (ADR-662)', async () => {
    const out = await submit(['משולש ABC', '∠ABC = α', '∠ABC = α + 40']);
    expect(out[2].kind).toBe('refuse');
  });
});
