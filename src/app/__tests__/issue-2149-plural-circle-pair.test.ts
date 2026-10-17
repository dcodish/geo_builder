/**
 * #2149 + #2123 ([ADR-671](../../../docs/06-decisions.md#adr-671)) — A SENTENCE THAT NAMES ITS CIRCLES IS NEVER ASKED
 * «WHICH CIRCLE?», AND THE THREE NAMED-PAIR RELATIONS ARE READ (operator rulings 2026-10-16, cards 6, 7 and 3; #2123's
 * ruling 2026-10-15).
 *
 * Measured at `062d059b` through `decideDeterministic2D` → `commitVerdict` → `replay`: «קטע המרכזים של המעגלים O ו-P»,
 * «רדיוסי המעגלים O ו-P שווים», «X נקודת ההשקה של המעגלים O ו-P» and every other plural sentence naming both circles
 * were ASKED «…ולא ברור לאיזה מהם הכוונה»; «רדיוס מעגל O שווה לרדיוס מעגל P» went to the AI. Root cause: the
 * last-resort `ambiguousCircleAsk` checked only the singular «מעגל X» for a named centre, and three relations had no
 * reader for a named pair.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, groupKey } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();

async function play(pre: string[], last: string, lang: 'he' | 'en' = 'he') {
  st().clear();
  const submit = async (line: string, l: 'he' | 'en') => {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, l);
    commitVerdict(v, line);
    return v;
  };
  for (const line of pre) expect((await submit(line, /[a-z]{3}/.test(line) ? 'en' : 'he')).kind, `«${line}» commits`).toBe('commit');
  const before = new Map(replay(st().facts, st().seed).positions);
  const n0 = st().facts.length;
  const v = await submit(last, lang);
  const logs = JSON.stringify((v as { logs?: unknown }).logs ?? []);
  return { kind: v.kind, logs, before, added: st().facts.slice(n0).map((f) => f.cmd as AnyCommand), note: (v as { note?: { key?: string; explain?: string } }).note };
}

const asked = (r: { logs: string; note?: { key?: string } }) => r.note?.key === 'input.ambiguousCircleRef' || r.logs.includes('ambiguous-circle-ref');
const green = () => {
  const f = replay(st().facts, st().seed);
  expect(f.violations).toEqual([]);
  expect(f.lastError).toBeNull();
  expect(llmParseMock).not.toHaveBeenCalled();
  return f;
};

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];
const PAIR_EN = ['circle O', 'circle P'];

describe('#2149 card 6 — the segment of the named centres', () => {
  for (const [line, lang] of [
    ['קטע המרכזים של המעגלים O ו-P', 'he'],
    ['קטע מרכזי המעגלים O ו-P', 'he'],
    ['מרכזי המעגלים O ו-P', 'he'],
    ['קטע המרכזים של מעגל O ומעגל P', 'he'],
    ['the segment of the centres of circles O and P', 'en'],
  ] as const)
    it(`«${line}» → segment OP, O and P unmoved`, async () => {
      const r = await play(lang === 'en' ? PAIR_EN : PAIR, line, lang);
      expect(r.kind).toBe('commit');
      expect(r.added).toEqual([{ type: 'segment', a: 'O', b: 'P' }]);
      const f = green();
      for (const id of ['O', 'P']) expect(Math.hypot(r.before.get(id)!.x - f.positions.get(id)!.x, r.before.get(id)!.y - f.positions.get(id)!.y)).toBeLessThan(1e-9);
    });
  it('three circles drawn: the NAMED pair is joined', async () => {
    const r = await play([...PAIR, 'מעגל Q'], 'קטע המרכזים של המעגלים O ו-P');
    expect(r.added).toEqual([{ type: 'segment', a: 'O', b: 'P' }]);
  });
  it('the bare «קטע המרכזים» is unchanged', async () => {
    expect((await play(PAIR, 'קטע המרכזים')).added).toEqual([{ type: 'segment', a: 'O', b: 'P' }]);
  });
});

describe('#2149 card 6 — equal radii, plural and singular', () => {
  const EQUAL: [string, 'he' | 'en'][] = [
    ['רדיוסי המעגלים O ו-P שווים', 'he'],
    ['קוטרי המעגלים O ו-P שווים', 'he'],
    ['שטחי המעגלים O ו-P שווים', 'he'],
    ['היקפי המעגלים O ו-P שווים', 'he'],
    ['למעגלים O ו-P רדיוסים שווים', 'he'],
    ['המעגלים O ו-P בעלי רדיוסים שווים', 'he'],
    ['רדיוס מעגל O שווה לרדיוס מעגל P', 'he'],
    ['רדיוס המעגל O שווה לרדיוס המעגל P', 'he'],
    ['רדיוס מעגל O = רדיוס מעגל P', 'he'],
    ['רדיוס מעגל O ורדיוס מעגל P שווים', 'he'],
    ['the radii of circles O and P are equal', 'en'],
    ['the circles O and P have equal radii', 'en'],
    ['the radius of circle O equals the radius of circle P', 'en'],
    ['the radius of circle O is equal to the radius of circle P', 'en'],
  ];
  for (const [line, lang] of EQUAL)
    it(`«${line}» → r_O = r_P at seeds 0–3`, async () => {
      const r = await play(lang === 'en' ? PAIR_EN : PAIR, line, lang);
      expect(r.kind).toBe('commit');
      expect(r.added.filter((c) => c.type === 'set-radius-ratio')).toEqual([{ type: 'set-radius-ratio', c1: 'circle-O', c2: 'circle-P', k: 1 }]);
      green();
      for (const seed of [0, 1, 2, 3]) {
        const f = replay(st().facts, seed);
        expect(f.circles.get('circle-O')!.r, `seed ${seed}`).toBeCloseTo(f.circles.get('circle-P')!.r, 5);
      }
    });
  it('REFUSAL: equal radii over two different stated radii (3 and 5) is refused, naming the statement', async () => {
    const r = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5'], 'רדיוסי המעגלים O ו-P שווים');
    expect(r.kind).toBe('refuse');
    expect(r.added).toEqual([]);
  });
  it('REFUSAL: the singular form over stated radii 3 and 5 is refused too', async () => {
    const r = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5'], 'רדיוס מעגל O שווה לרדיוס מעגל P');
    expect(r.kind).toBe('refuse');
  });
  it('the ×2 ratio (ADR-649) is unchanged', async () => {
    const r = await play(PAIR, 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P');
    expect(r.added).toEqual([{ type: 'set-radius-ratio', c1: 'circle-O', c2: 'circle-P', k: 2 }]);
  });
});

describe('#2149 card 7 + #2123 — the named touch point states the tangency at X', () => {
  const FORMS: [string, 'he' | 'en'][] = [
    ['X נקודת ההשקה של המעגלים O ו-P', 'he'],
    ['X היא נקודת ההשקה של המעגלים O ו-P', 'he'],
    ['נקודת ההשקה של המעגלים O ו-P היא X', 'he'],
    ['X נקודת המגע של המעגלים O ו-P', 'he'],
    ['X נקודת השקה של המעגלים O ו-P', 'he'],
    ['X נקודת ההשקה בין המעגלים O ו-P', 'he'],
    ['X נקודת ההשקה של מעגל O ומעגל P', 'he'],
    ['X is the point of tangency of circles O and P', 'en'],
    ['X is the touch point of circles O and P', 'en'],
  ];
  for (const [line, lang] of FORMS)
    it(`no tangency stated: «${line}» → tangent at X (EXT), as «…משיקים בנקודה X»`, async () => {
      const r = await play(lang === 'en' ? PAIR_EN : PAIR, line, lang);
      expect(r.kind).toBe('commit');
      // #2210 (ADR-704): no kind stated for the pair, so external is the default and says so
      expect(r.added).toEqual([{ type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'X', external: true, kindStated: false }]);
      green();
    });
  for (const [line, lang] of FORMS)
    it(`after «…משיקים»: «${line}» → X alone, no M, no notice`, async () => {
      const r = await play([...(lang === 'en' ? PAIR_EN : PAIR), lang === 'en' ? 'circles O and P are tangent' : 'המעגלים O ו-P משיקים'], line, lang);
      expect(r.kind).toBe('commit');
      const f = green();
      expect(f.positions.has('M'), 'M yielded to X').toBe(false);
      expect(f.coincidences).toEqual([]);
      for (const id of ['O', 'P']) expect(Math.hypot(r.before.get(id)!.x - f.positions.get(id)!.x, r.before.get(id)!.y - f.positions.get(id)!.y)).toBeLessThan(1e-9);
    });
  it('deleting the touch-point line brings M back', async () => {
    await play([...PAIR, 'המעגלים O ו-P משיקים'], 'X נקודת ההשקה של המעגלים O ו-P');
    const last = st().facts[st().facts.length - 1];
    st().removeGroup(groupKey(last));
    const f = replay(st().facts, st().seed);
    expect(f.positions.has('M')).toBe(true);
    expect(f.positions.has('X')).toBe(false);
  });
  it('after «…משיקים מבפנים»: the kind stated earlier is kept (INT), M → X', async () => {
    const r = await play([...PAIR, 'המעגלים O ו-P משיקים מבפנים'], 'X נקודת ההשקה של המעגלים O ו-P');
    expect(r.kind).toBe('commit');
    const f = green();
    const O = f.positions.get('O')!, P = f.positions.get('P')!;
    expect(Math.hypot(O.x - P.x, O.y - P.y)).toBeCloseTo(Math.abs(f.circles.get('circle-O')!.r - f.circles.get('circle-P')!.r), 6);
    expect(f.positions.has('M')).toBe(false);
  });
  it('after «…משיקים בנקודה T»: builds, with the «T ו-X» notice', async () => {
    const r = await play([...PAIR, 'המעגלים O ו-P משיקים בנקודה T'], 'X נקודת ההשקה של המעגלים O ו-P');
    expect(r.kind).toBe('commit');
    const f = replay(st().facts, st().seed);
    expect(f.coincidences.map((p) => [...p].sort().join(''))).toContain('TX');
  });
  it('REFUSAL: after «…נחתכים» the touch-point line is refused', async () => {
    const r = await play([...PAIR, 'המעגלים O ו-P נחתכים'], 'X נקודת ההשקה של המעגלים O ו-P');
    expect(r.kind).toBe('refuse');
    expect(r.added).toEqual([]);
  });
  it('three circles drawn: the NAMED pair is made tangent', async () => {
    const r = await play([...PAIR, 'מעגל Q'], 'X נקודת ההשקה של המעגלים O ו-P');
    // #2210 (ADR-704): no kind stated for the pair, so external is the default and says so
    expect(r.added).toEqual([{ type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'X', external: true, kindStated: false }]);
  });
  it('a named circle not drawn: not committed', async () => {
    const r = await play(['מעגל O'], 'X נקודת ההשקה של המעגלים O ו-P');
    expect(r.kind).not.toBe('commit');
  });
});

describe('#2149 card 3 — every other sentence naming both circles is never asked «which circle?»', () => {
  const OTHERS = [
    'המעגלים O ו-P קונצנטריים',
    'המיתר המשותף של המעגלים O ו-P',
    'A נמצאת על המעגלים O ו-P',
    'הנקודה A על המעגלים O ו-P',
    'שטחי המעגלים O ו-P',
    'המרחק בין מרכזי המעגלים O ו-P הוא 10',
    'המעגלים O ו-P שווים',
    'המעגלים O ו-P',
  ];
  for (const line of OTHERS)
    it(`«${line}» → not asked`, async () => {
      const r = await play(PAIR, line);
      expect(asked(r), `«${line}» asked «which circle?»`).toBe(false);
    });
  it('"the centres of circles O and P" → not asked', async () => {
    expect(asked(await play(PAIR_EN, 'the centres of circles O and P', 'en'))).toBe(false);
  });
  it('the anonymous «רדיוס המעגל הוא 5» beside two circles still asks', async () => {
    expect(asked(await play(PAIR, 'רדיוס המעגל הוא 5'))).toBe(true);
  });
  it('the readers need exactly two names: with three circle names the pair readers decline', async () => {
    const r = await play([...PAIR, 'מעגל Q'], 'רדיוס מעגל O שווה לרדיוס מעגל P ולרדיוס מעגל Q');
    expect(r.added.some((c) => c.type === 'set-radius-ratio' && c.k === 1 && !(c.c1 === 'circle-Q' || c.c2 === 'circle-Q')) && r.added.length === 1).toBe(false);
  });
});
