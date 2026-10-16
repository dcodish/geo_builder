/**
 * #2083 ([ADR-646](../../../docs/06-decisions.md#adr-646)) — A SENTENCE THAT ONLY NAMES AN EXISTING CIRCLE NEVER
 * CHANGES ITS SIZE OR ITS DEFINITION.
 *
 * Measured on `main` @ 939b160a through `decideDeterministic2D` → `commitVerdict` → `replay`: after «מעגל O ברדיוס 3»
 * · «מעגל P ברדיוס 2», «המעגלים O ו-P נחתכים בנקודות X ו-Y» replaced both radius facts with `circle … freeRadius`
 * (drawn r = 5 and 3.6), green; an incircle, a circle through A and an inscribed triangle's circle were replaced the
 * same way. Root cause: the fold rule resized a re-stated circle whatever the command said about size, and apply's
 * `circle` case overwrote the radius spec when the circle sat inside a bigger step. Operator ruling 2026-10-14:
 * *"the stated radii are kept (the honesty invariant)"*.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { otherUtteranceForError } from '@/app/errorSubject';
import { humanizeError } from '@/i18n/humanizeError';
import i18n from '@/i18n';

const st = () => useGeoStore.getState();
type V = { kind: string; note?: { key?: string } };

async function play(lines: string[], lang: 'he' | 'en' = 'he') {
  st().clear();
  const verdicts: V[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, lang)) as never as V;
    verdicts.push(v);
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  const r = replay(st().facts, st().seed);
  const radius = (c: string) => r.construction.objects.find((o) => o.kind === 'circle' && o.id === `circle-${c}`) as never as { radius: { via: string; value?: number; point?: string }; center: string } | undefined;
  const dist = (a: string, b: string) => {
    const p = r.positions.get(a)!, q = r.positions.get(b)!;
    return Math.hypot(p.x - q.x, p.y - q.y);
  };
  return { verdicts, last: verdicts.at(-1)!, r, radius, dist, facts: st().facts };
}

beforeEach(() => llmParseMock.mockReset());

const CROSSINGS: [string, 'he' | 'en'][] = [
  ['המעגלים O ו-P נחתכים בנקודות X ו-Y', 'he'],
  ['X ו-Y נקודות החיתוך של המעגלים O ו-P', 'he'],
  ['circles O and P intersect at X and Y', 'en'],
  ['circles O and P meet at X and Y', 'en'],
];

describe('#2083 — the stated radii are kept, in every spelling of the crossing', () => {
  it.each(CROSSINGS)('«%s»', async (line, lang) => {
    const g = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', line], lang);
    expect(g.verdicts.map((v) => v.kind)).toEqual(['commit', 'commit', 'commit']);
    expect(g.radius('O')!.radius).toEqual({ via: 'length', value: 3 });
    expect(g.radius('P')!.radius).toEqual({ via: 'length', value: 2 });
    for (const X of ['X', 'Y']) {
      expect(g.dist('O', X), `|O${X}|`).toBeCloseTo(3, 6);
      expect(g.dist('P', X), `|P${X}|`).toBeCloseTo(2, 6);
    }
    expect(g.dist('X', 'Y')).toBeGreaterThan(0.1);
    // the two radius rows keep their own lines
    expect(g.facts[0].utterance).toBe('מעגל O ברדיוס 3');
    expect(g.facts[1].utterance).toBe('מעגל P ברדיוס 2');
    expect(g.r.violations ?? []).toHaveLength(0);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('«מעגל O שרדיוסו 3» · «מעגל P» · the crossing keeps r = 3', async () => {
    const g = await play(['מעגל O שרדיוסו 3', 'מעגל P', 'המעגלים O ו-P נחתכים בנקודות X ו-Y']);
    expect(g.last.kind).toBe('commit');
    expect(g.radius('O')!.radius).toEqual({ via: 'length', value: 3 });
    expect(g.dist('O', 'X')).toBeCloseTo(3, 6);
    expect(g.dist('O', 'Y')).toBeCloseTo(3, 6);
  });
});

describe('#2083 — the class: every way a circle was defined survives the reference', () => {
  it('an inscribed triangle’s circle «משולש ABC חסום במעגל O שרדיוסו 3»', async () => {
    const g = await play(['משולש ABC חסום במעגל O שרדיוסו 3', 'מעגל P ברדיוס 2', 'המעגלים O ו-P נחתכים בנקודות X ו-Y']);
    expect(g.last.kind).toBe('commit');
    expect(g.radius('O')!.radius).toEqual({ via: 'length', value: 3 });
    for (const p of ['A', 'B', 'C', 'X', 'Y']) expect(g.dist('O', p), p).toBeCloseTo(3, 6);
  });

  it('an incircle «מעגל O חסום במשולש ABC» stays the incircle', async () => {
    const g = await play(['משולש ABC', 'מעגל O חסום במשולש ABC', 'מעגל P', 'המעגלים O ו-P נחתכים בנקודות X ו-Y']);
    expect(g.last.kind).toBe('commit');
    expect(g.radius('O')!.radius.via).toBe('through');
    const foot = g.radius('O')!.radius.point!;
    expect(g.dist('O', 'X')).toBeCloseTo(g.dist('O', foot), 6);
  });

  it('a circle through A «מעגל O שעובר דרך A» keeps A on it', async () => {
    const g = await play(['נקודה A', 'מעגל O שעובר דרך A', 'מעגל P', 'המעגלים O ו-P נחתכים בנקודות X ו-Y']);
    expect(g.last.kind).toBe('commit');
    expect(g.radius('O')!.radius).toEqual({ via: 'through', point: 'A' });
    expect(g.dist('O', 'X')).toBeCloseTo(g.dist('O', 'A'), 6);
  });
});

describe('#2083 — unchanged (measured at 939b160a)', () => {
  it('«מעגל O ברדיוס 4» after «ברדיוס 3» is refused and the circle keeps r = 3 (#2119, ADR-683 — was «כבר קיים»)', async () => {
    const g = await play(['מעגל O ברדיוס 3', 'מעגל O ברדיוס 4']);
    expect(g.last.kind).toBe('refuse');
    expect(g.radius('O')!.radius).toEqual({ via: 'length', value: 3 });
    expect(g.facts).toHaveLength(1);
  });

  it('a bare «מעגל O» after «ברדיוס 3» still answers «כבר קיים»', async () => {
    const g = await play(['מעגל O ברדיוס 3', 'מעגל O']);
    expect(g.last.kind).toBe('noop');
    expect(g.last.note?.key).toBe('input.alreadyDrawn');
    expect(g.radius('O')!.radius).toEqual({ via: 'length', value: 3 });
  });

  it('a fresh named pair is still created with free radii', async () => {
    const g = await play(['המעגלים O ו-P נחתכים בנקודות X ו-Y']);
    expect(g.last.kind).toBe('commit');
    expect(g.radius('O')!.radius.via).toBe('free');
    expect(g.radius('P')!.radius.via).toBe('free');
    expect(g.dist('X', 'Y')).toBeGreaterThan(0.1);
  });
});

/**
 * #2083 part B ([ADR-645](../../../docs/06-decisions.md#adr-645)) — with the radii kept, «OP = 5» makes circles of
 * radius 3 and 2 tangent BY THEIR LENGTHS. Measured with the definite spelling at 939b160a: X(3.00, 0.10),
 * Y(3.00, 0.09), green — three stated lengths leaned inside their tolerances until two roots 0.01 apart existed.
 * Operator ruling 2026-10-14: refused under #2080's ruling, with the existing contradiction message, both orders.
 */
describe('#2083 B — a crossing of circles the lengths make tangent is refused, both orders', () => {
  const sentenceFor = async (lines: string[]) => {
    const g = await play(lines);
    const ex = (g.last as { note?: { explain?: string } }).note?.explain ?? '';
    return { g, said: humanizeError(ex, i18n.getFixedT('he') as never, lines.at(-1), otherUtteranceForError(g.facts, ex)).replace(/[\u2066-\u2069]/g, '') };
  };
  const RADII = ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2'];
  const CROSS = 'המעגלים O ו-P נחתכים בנקודות X ו-Y';
  const S = (said: string, other: string) => `לא ניתן: «${said}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד. הסיבה: X מתלכדת עם Y.`;

  it.each([['OP = 5'], ['OP = 1']])('«%s» then the crossing → refused, naming the length', async (op) => {
    const { g, said } = await sentenceFor([...RADII, op, CROSS]);
    expect(g.last.kind).toBe('refuse');
    expect(said).toBe(S(CROSS, op));
    expect(g.facts.some((f) => f.utterance === CROSS), 'nothing committed').toBe(false);
  });

  it.each([['OP = 5'], ['OP = 1']])('the crossing then «%s» → refused, naming the crossing', async (op) => {
    const { g, said } = await sentenceFor([...RADII, CROSS, op]);
    expect(g.last.kind).toBe('refuse');
    expect(said).toBe(S(op, CROSS));
    expect(g.dist('X', 'Y'), 'the crossing stays as it was').toBeGreaterThan(0.5);
  });

  it('the definite unnamed spelling with «OP = 5» first is refused too', async () => {
    const { g } = await sentenceFor([...RADII, 'OP = 5', 'המעגלים נחתכים בנקודות X ו-Y']);
    expect(g.last.kind).toBe('refuse');
  });

  it('control: «OP = 4» crosses at two points on circles 3 and 2', async () => {
    const g = await play([...RADII, 'OP = 4', CROSS]);
    expect(g.last.kind).toBe('commit');
    expect(g.dist('X', 'Y')).toBeGreaterThan(0.5);
    for (const X of ['X', 'Y']) {
      expect(g.dist('O', X)).toBeCloseTo(3, 6);
      expect(g.dist('P', X)).toBeCloseTo(2, 6);
    }
  });

  it('control: «OP = 6» keeps its refusal «הסיבה: |OP| = 6»', async () => {
    const { g, said } = await sentenceFor([...RADII, 'OP = 6', CROSS]);
    expect(g.last.kind).toBe('refuse');
    expect(said).toBe(`לא ניתן: «${CROSS}» סותר את «OP = 6» — אי אפשר לקיים את שניהם יחד. הסיבה: |OP| = 6.`);
  });
});
