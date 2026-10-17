/**
 * #2263 ([ADR-702](../../../docs/06-decisions.md#adr-702)) — one radius stated for a NESTED circle pair is refused,
 * one given per line, and never handed to the AI.
 *
 * Measured at b0e9dbea through `decideDeterministic2D`, model mocked: «שני מעגלים בעלי מרכז משותף O ברדיוס 5» and
 * «שני מעגלים מוכלים ברדיוס 5» escalated (`weak:dropped:5`), «שני מעגלים משיקים מבפנים ברדיוס 5» escalated
 * (`not-handled`); on the operator's live server the model gave 5 to the OUTER circle and committed green. ADR-677
 * kept the nested pairs out of the pair-radius reading (two nested circles cannot both have it) and left them to the
 * AI. Operator 2026-10-16: *"reject asking to enter one line at a time"*; and *"yes"* — contained and internally
 * tangent get the same refusal. The frame is FR-IN-4g's (`input.scope.split-statements`), the parts the student's own.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { stripFormatControls } from '../../../shell/bidi';
import { decideDeterministic2D } from '../decideDeterministic';
import { runEditCommit, type EditDeps } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { parse } from '@/parser/parse';
import { driveThroughGate } from '../../__tests__/submit-gate';

const lang = (line: string): 'he' | 'en' => (/[א-ת]/.test(line) ? 'he' : 'en');

async function decide(prefix: string[], line: string) {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, lang(line));
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** [prefix, line with N, the pair part, the radius part with N] — every nested rule, every spelling it reads. */
const ROWS: [string[], string, string, string][] = [
  [[], 'שני מעגלים בעלי מרכז משותף O ברדיוס N', 'שני מעגלים בעלי מרכז משותף O', 'ברדיוס N'], // the report
  [[], 'שני מעגלים בעלי אותו מרכז O ברדיוס N', 'שני מעגלים בעלי אותו מרכז O', 'ברדיוס N'],
  [[], 'שני מעגלים קונצנטריים ברדיוס N', 'שני מעגלים קונצנטריים', 'ברדיוס N'],
  [[], 'שני מעגלים בעלי מרכז משותף O, רדיוס כל אחד N', 'שני מעגלים בעלי מרכז משותף O', 'רדיוס כל אחד N'],
  [[], 'two concentric circles with radius N', 'two concentric circles', 'with radius N'],
  [[], 'two circles with a common center O, each with radius N', 'two circles with a common center O', 'each with radius N'],
  [[], 'שני מעגלים מוכלים ברדיוס N', 'שני מעגלים מוכלים', 'ברדיוס N'], // ruling: contained
  [[], 'two contained circles with radius N', 'two contained circles', 'with radius N'],
  [[], 'שני מעגלים משיקים מבפנים ברדיוס N', 'שני מעגלים משיקים מבפנים', 'ברדיוס N'], // ruling: internally tangent
  [[], 'שני מעגלים משיקים פנימית ברדיוס N', 'שני מעגלים משיקים פנימית', 'ברדיוס N'],
  [[], 'מעגל O ומעגל P משיקים מבפנים ברדיוס N', 'מעגל O ומעגל P משיקים מבפנים', 'ברדיוס N'],
  [[], 'two internally tangent circles with radius N', 'two internally tangent circles', 'with radius N'],
  [['מעגל O', 'מעגל P'], 'המעגלים משיקים מבפנים ברדיוס N', 'המעגלים משיקים מבפנים', 'ברדיוס N'], // a drawn pair
];

describe('#2263 — one radius on a nested pair is refused with the one-given-per-line message', () => {
  for (const [prefix, tpl, pair, phrase] of ROWS) {
    it.each([5, 4])(`«${tpl}» with N = %d → refused, parts (1) pair (2) radius, the model never asked`, async (n) => {
      const line = tpl.replace('N', String(n));
      const v = await decide(prefix, line);
      expect(v.kind, line).toBe('refuse');
      if (v.kind !== 'refuse') return;
      expect(v.category).toBe('guided');
      expect(v.note).toMatchObject({ key: 'input.scope.split-statements', params: { all: `(1) ${pair}  (2) ${phrase.replace('N', String(n))}` } });
      expect(v.logs.at(-1)?.result).toBe('scope:split-statements:nested-pair-radius');
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('the operator’s line, in the words the student reads', async () => {
    const v = await decide([], 'שני מעגלים בעלי מרכז משותף O ברדיוס 5');
    expect(v.kind).toBe('refuse');
    if (v.kind !== 'refuse' || !v.note || !('key' in v.note)) throw new Error('expected a keyed refusal note');
    const he = i18n.getFixedT('he');
    expect(stripFormatControls(String(he(v.note.key, v.note.params as never)))).toBe(
      'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. זיהינו כאן שני נתונים — נסו להקליד אותם בשני שלבים: (1) שני מעגלים בעלי מרכז משותף O  (2) ברדיוס 5',
    );
  });

  it('the parser owns the refusal: `nested-pair-radius`, never `not-handled`', () => {
    expect(parse('שני מעגלים בעלי מרכז משותף O ברדיוס 5')).toEqual({ ok: false, reason: 'nested-pair-radius', parts: ['שני מעגלים בעלי מרכז משותף O', 'ברדיוס 5'] });
  });

  it('the ✎ editor refuses the same edit naming the radius phrase, nothing committed', () => {
    for (const [prefix, tpl, , phrase] of ROWS.filter(([p]) => p.length === 0)) {
      const line = tpl.replace('N', '5');
      useGeoStore.getState().clear();
      driveThroughGate([...prefix, 'שני מעגלים']);
      const facts = useGeoStore.getState().facts;
      const key = groupKey(facts[facts.length - 1]);
      const before = facts.length;
      const notes: string[] = [];
      const deps: EditDeps = { t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k), setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} };
      expect(runEditCommit(key, line, deps), line).toBe(false);
      expect(useGeoStore.getState().facts.length).toBe(before);
      expect(notes.at(-1), line).toBe(`steps.editDropped:${JSON.stringify({ items: phrase.replace('N', '5') })}`);
    }
  });
});

describe('#2263 — unchanged: the pair without a radius, the two-line form, the pairs that take it, a named circle’s own size', () => {
  it.each(['שני מעגלים בעלי מרכז משותף O', 'שני מעגלים קונצנטריים', 'שני מעגלים מוכלים', 'שני מעגלים משיקים מבפנים', 'two concentric circles'])(
    '«%s» still commits',
    async (line) => {
      expect((await decide([], line)).kind, line).toBe('commit');
    },
  );

  it('the two-line form builds: «שני מעגלים בעלי מרכז משותף O» · «רדיוס מעגל חיצוני הוא 10»', () => {
    useGeoStore.getState().clear();
    const { facts, refused } = driveThroughGate(['שני מעגלים בעלי מרכז משותף O', 'רדיוס מעגל חיצוני הוא 10']);
    expect(refused).toEqual([]);
    for (const seed of [0, 1, 2, 3]) {
      const fig = replay(facts, seed);
      expect(fig.lastError).toBeNull();
      expect(fig.violations).toEqual([]);
      expect(fig.circles.get('circle-O')!.r).toBeCloseTo(10, 6);
      expect(fig.circles.get('circle-O-2')!.r).toBeLessThan(10);
    }
  });

  it.each(['שני מעגלים נחתכים ברדיוס 5', 'שני מעגלים משיקים ברדיוס 5', 'שני מעגלים משיקים מבחוץ ברדיוס 5', 'שני מעגלים זרים ברדיוס 5'])(
    '«%s» — a pair that can take it — still sizes both (ADR-677)',
    async (line) => {
      expect((await decide([], line)).kind, line).toBe('commit');
      useGeoStore.getState().clear();
      const { facts } = driveThroughGate([line]);
      expect([...replay(facts, 0).circles.values()].map((c) => c.r)).toEqual([5, 5]);
    },
  );

  it('a radius after a NAMED circle is that circle’s own size, not the pair’s: not this refusal', () => {
    const r = parse('שני מעגלים בעלי מרכז משותף O, מעגל O ברדיוס 5');
    expect(r.ok === false && r.reason === 'nested-pair-radius').toBe(false);
  });
});
