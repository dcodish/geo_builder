/**
 * #2080 ([ADR-645](../../../docs/06-decisions.md#adr-645)) — TWO CIRCLES STATED TANGENT HAVE ONE COMMON POINT: a
 * two-point crossing of them is refused with the contradiction message, in every spelling and in both orders.
 *
 * Measured on `main` @ 939b160a through `decideDeterministic2D` → `commitVerdict` → `replay`: after «מעגל O» · «מעגל P»
 * · «המעגלים O ו-P משיקים», «המעגלים O ו-P נחתכים בנקודות X ו-Y» committed with X = Y on the touch point (two roots
 * ~10⁻³ apart, the tangency held only to its residual tolerance), 0 violations; the other order the same. Operator
 * ruling 2026-10-14 on #2073 (option A): refuse with the existing «…סותר את «המעגלים O ו-P משיקים»…» sentence.
 *
 * Root cause: the circle∩circle evaluation asked only whether two roots differ by more than `LEN_EPS`, and nothing
 * in the construction recorded that the pair was stated tangent. Fix: the `circles-tangent` statement leaves a
 * `circle-position: tangent` record (`circlesStatedTangent`), stage 0j refuses a second crossing of a stated-tangent
 * pair (and a tangency over a pair with two named crossings), and the evaluation refuses it as a backstop.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** Play `pre` (each must commit), then `last`; the verdict kind, the sentence a refusal reads, positions before/after. */
async function play(pre: string[], last: string, lang: 'he' | 'en' = 'he') {
  st().clear();
  const submit = async (line: string) => {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, lang);
    commitVerdict(v, line);
    return v;
  };
  for (const line of pre) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  const before = new Map(replay(st().facts, st().seed).positions);
  const nBefore = st().facts.length;
  const v = await submit(last);
  const explain = (v as { note?: { explain?: string } }).note?.explain;
  const t = i18n.getFixedT(lang) as (k: string, o?: Record<string, unknown>) => string;
  const said = explain ? plain(humanizeError(explain, t, last, otherUtteranceForError(st().facts, explain))) : '';
  const after = replay(st().facts, st().seed);
  return { kind: v.kind, said, before, after, added: st().facts.length - nBefore };
}

const sentence = (said: string, other: string) => `לא ניתן: «${said}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד. הסיבה: X מתלכדת עם Y.`;
const unmoved = (a: Map<string, Vec>, b: Map<string, Vec>) => {
  for (const [id, p] of a) {
    const q = b.get(id);
    expect(q, id).toBeDefined();
    expect(Math.hypot(p.x - q!.x, p.y - q!.y), `${id} unmoved`).toBeLessThan(1e-9);
  }
};

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];
const TANGENT = ['המעגלים O ו-P משיקים', 'המעגלים O ו-P משיקים מבחוץ', 'המעגלים O ו-P משיקים מבפנים', 'המעגלים O ו-P משיקים בנקודה T'];
const CROSS = ['המעגלים O ו-P נחתכים בנקודות X ו-Y', 'X ו-Y נקודות החיתוך של המעגלים O ו-P'];

describe('#2080 — tangent first: the crossing is refused, naming the tangency', () => {
  for (const tan of TANGENT)
    for (const cross of CROSS)
      it(`«${tan}» · «${cross}»`, async () => {
        const r = await play([...PAIR, tan], cross);
        expect(r.kind).toBe('refuse');
        expect(r.said).toBe(sentence(cross, tan));
        expect(r.added, 'nothing committed').toBe(0);
        unmoved(r.before, r.after.positions);
        expect(llmParseMock).not.toHaveBeenCalled();
      });

  it('English: "circles O and P are tangent" · "circles O and P intersect at X and Y"', async () => {
    const r = await play([...PAIR, 'circles O and P are tangent'], 'circles O and P intersect at X and Y', 'en');
    expect(r.kind).toBe('refuse');
    expect(r.said).toBe("Can't do that: «circles O and P intersect at X and Y» contradicts «circles O and P are tangent» — they can't both hold. The reason: X coincides with Y.");
  });

  it('stated radii: «מעגל O ברדיוס 3» · «מעגל P ברדיוס 2» · «משיקים» · the crossing → refused', async () => {
    const r = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'המעגלים O ו-P משיקים'], CROSS[0]);
    expect(r.kind).toBe('refuse');
    expect(r.said).toBe(sentence(CROSS[0], 'המעגלים O ו-P משיקים'));
  });
});

describe('#2080 — the other order: the tangency is refused, naming the crossing', () => {
  for (const tan of TANGENT)
    it(`«${CROSS[0]}» · «${tan}»`, async () => {
      const r = await play([...PAIR, CROSS[0]], tan);
      expect(r.kind).toBe('refuse');
      expect(r.said).toBe(sentence(tan, CROSS[0]));
      expect(r.added).toBe(0);
      unmoved(r.before, r.after.positions);
    });
});

describe('#2080 — unchanged (measured at 939b160a)', () => {
  it('two circles not stated tangent still cross at two separate points', async () => {
    const r = await play(PAIR, CROSS[0]);
    expect(r.kind).toBe('commit');
    const X = r.after.positions.get('X')!, Y = r.after.positions.get('Y')!;
    expect(Math.hypot(X.x - Y.x, X.y - Y.y)).toBeGreaterThan(0.5);
    expect(r.after.violations).toHaveLength(0);
  });

});
