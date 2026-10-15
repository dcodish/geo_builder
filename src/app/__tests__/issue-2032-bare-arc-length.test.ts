/**
 * #2032 + #2041 ([ADR-664](../../../docs/06-decisions.md#adr-664)) — one verdict for an arc's value.
 *
 * Measured at pickup (`main` b0ef3240 + the ADR-663 branch, `decideDeterministic2D`, the model mocked), after
 * «גזרה AOB»: «קשת AB = 4π» (also «⌢AB», «הקשת AB», "arc AB", «= π») committed the CHORD |AB| = 4π (`measurePi`
 * read «AB = 4π» out of the sentence and dropped the arc noun); «הקשת AB היא 4π» and «קשת AB שווה ל-4π» escalated;
 * «קשת AB = x», «= 2√3», «= 3a», «= α» committed the chord AB = x (`measureLength` / `measureSqrt`). Operator rulings
 * 2026-10-13: #2032 *"«קשת AB = 4π» means the arc's length is 4π … the same as «אורך הקשת AB הוא 4π»"*; #2041 C +
 * the worded sentence: refuse a non-number arc value as ambiguous, teaching «∠AOB = x» and «אורך הקשת AB הוא x».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { angleDeg, dist, type AnyCommand, type Vec } from '@/engine';
import i18n from '@/i18n';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function decide(prefix: string[], line: string, locale: 'he' | 'en' = 'he') {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}
const cmds = (v: Awaited<ReturnType<typeof decide>>): AnyCommand[] => (v.kind === 'commit' ? [...v.commands] : []);
const SECTOR = ['גזרה AOB'];
const CIRCLE_AB = ['מעגל O', 'A על מעגל O', 'B על מעגל O'];

/** Build the lines and read the sector O-A-B at `seed`. */
function sector(lines: string[], seed = 0) {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate(lines);
  const d = replay(facts, seed);
  const p = (id: string) => d.positions.get(id) as Vec;
  const O = p('O'), A = p('A'), B = p('B');
  const ok = Object.values(d.status).every((s) => s === 'ok') && d.violations.length === 0;
  return { refused: refused.map((r) => r.utterance), ok, r: dist(O, A), angle: angleDeg(O, A, B), d };
}

describe('#2032 — a π value on the bare arc noun is the arc’s LENGTH', () => {
  it.each([['קשת AB = 4π'], ['הקשת AB = 4π'], ['⌢AB = 4π'], ['arc AB = 4π'], ['הקשת AB היא 4π'], ['קשת AB שווה ל-4π']])(
    '«%s» commits exactly what «אורך הקשת AB הוא 4π» commits — never a segment length',
    async (line) => {
      const twin = cmds(await decide(SECTOR, 'אורך הקשת AB הוא 4π'));
      const got = cmds(await decide(SECTOR, line, /[א-ת]/.test(line) ? 'he' : 'en'));
      expect(twin).toHaveLength(1);
      expect(got).toEqual(twin);
      expect(got.some((c) => c.type === 'measure-length' || c.type === 'set-distance')).toBe(false);
      expect(llmParseMock).not.toHaveBeenCalled();
    },
  );

  it('«קשת AB = π» is the π twin', async () => {
    expect(cmds(await decide(SECTOR, 'קשת AB = π'))).toEqual(cmds(await decide(SECTOR, 'אורך הקשת AB הוא π')));
  });

  it('at 24 seeds the figure is the twin’s, the verifier holds the length, and the angle stays free (ADR-052)', () => {
    const angles = new Set<string>();
    for (let seed = 0; seed < 24; seed++) {
      const s = sector([...SECTOR, 'קשת AB = 4π'], seed);
      const twin = sector([...SECTOR, 'אורך הקשת AB הוא 4π'], seed);
      expect(s.refused).toEqual([]);
      expect(s.ok, `seed ${seed}: green and verified`).toBe(true);
      expect(s.r, `seed ${seed}: the twin’s radius`).toBeCloseTo(twin.r, 9);
      expect(s.angle, `seed ${seed}: the twin’s angle`).toBeCloseTo(twin.angle, 9);
      angles.add(s.angle.toFixed(2));
    }
    expect(sector([...SECTOR, 'קשת AB = 4π']).r * ((sector([...SECTOR, 'קשת AB = 4π']).angle * Math.PI) / 180)).toBeCloseTo(4 * Math.PI, 3);
    expect(angles.size).toBeGreaterThanOrEqual(2);
  });

  it('«4π» is written on the arc, as the length', () => {
    expect(sector([...SECTOR, 'קשת AB = 4π']).d.labels.areas).toEqual([{ ids: ['O', 'A', 'B'], round: {}, of: 'length', text: '4π' }]);
  });

  describe('no drawn arc: not understood — never the chord', () => {
    it.each([['קשת AB = 4π'], ['arc AB = 4π']])('a circle with A and B on it · «%s» escalates', async (line) => {
      const v = await decide(CIRCLE_AB, line, /[א-ת]/.test(line) ? 'he' : 'en');
      expect(v.kind).toBe('escalate');
      expect(JSON.stringify(v)).not.toMatch(/measure-length|set-distance/);
    });

    it('two drawn sectors and «קשת = 4π» with no letters escalates', async () => {
      const v = await decide(['גזרה AOB', 'גזרה COD'], 'קשת = 4π');
      expect(v.kind).toBe('escalate');
      expect(JSON.stringify(v)).not.toMatch(/measure-length|set-distance/);
    });
  });

  describe('unchanged', () => {
    it.each([['קשת AB = 40'], ['קשת AB = 40°']])('«%s» is still a 40° arc', async (line) => {
      expect(cmds(await decide(SECTOR, line))).toEqual([{ type: 'set-angle', vertex: 'O', ray1: 'A', ray2: 'B', value: 40, arcOf: 'circle-O' }]);
    });

    it('«קשת AB = 2π/3» still escalates (the length reader does not read it)', async () => {
      expect((await decide(SECTOR, 'קשת AB = 2π/3')).kind).toBe('escalate');
    });

    it('a copula before a plain number keeps its verdict: «הקשת AB היא 40» escalates', async () => {
      expect((await decide(SECTOR, 'הקשת AB היא 40')).kind).toBe('escalate');
    });

    it('an arc equality and an arc sum are untouched', async () => {
      const four = ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O'];
      expect(cmds(await decide(four, 'קשת AB = קשת CD')).map((c) => c.type)).toEqual(['set-angle-ratio']);
      expect(cmds(await decide(four, 'קשת AB + קשת CD = 180')).map((c) => c.type)).toEqual(['set-measure-sum']);
    });
  });
});

describe('#2041 — a symbol on an arc is asked about: degrees or length?', () => {
  const he = i18n.getFixedT('he');
  const said = (v: Awaited<ReturnType<typeof decide>>) =>
    v.kind === 'refuse' && v.note && 'key' in v.note ? String(he(v.note.key, v.note.params as Record<string, unknown>)).replace(/[⁦-⁩]/g, '') : '';

  it('the ruled sentence, verbatim, with the student’s letters, centre and value', async () => {
    const v = await decide(SECTOR, 'קשת AB = x');
    expect(v.kind).toBe('refuse');
    expect(said(v)).toBe('לא ברור אם x היא מידת הקשת במעלות או אורך הקשת. למעלות כתבו «∠AOB = x», ולאורך כתבו «אורך הקשת AB הוא x».');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it.each([['x'], ['3a'], ['2x']])('«קשת AB = %s» is refused with the question — never the chord', async (value) => {
    const v = await decide(SECTOR, `קשת AB = ${value}`);
    expect(v.kind).toBe('refuse');
    expect(v.kind === 'refuse' && v.note).toEqual({ key: 'input.arcValueAmbiguous', params: { value, a: 'A', b: 'B', center: 'O' } });
  });

  it.each([['הקשת AB היא x'], ['⌢AB = x'], ['arc AB = x']])('«%s» — the same question', async (line) => {
    const v = await decide(SECTOR, line, /[א-ת]/.test(line) ? 'he' : 'en');
    expect(v.kind === 'refuse' && v.note).toEqual({ key: 'input.arcValueAmbiguous', params: { value: 'x', a: 'A', b: 'B', center: 'O' } });
  });

  it.each([['x'], ['3a'], ['2x']])('both taught sentences build for «%s» (the refusal teaches grammar that holds)', (value) => {
    for (const taught of [`∠AOB = ${value}`, `אורך הקשת AB הוא ${value}`]) {
      const s = sector([...SECTOR, taught]);
      expect(s.refused, taught).toEqual([]);
      expect(s.ok, taught).toBe(true);
    }
  });

  it('the English taught sentence builds too', () => {
    const s = sector([...SECTOR, 'arc length AB is x']);
    expect(s.refused).toEqual([]);
    expect(s.ok).toBe(true);
  });

  it.each([['α'], ['2√3'], ['√2']])('«קשת AB = %s»: one taught sentence would not build today (a Greek arc length / a root angle), so the line escalates — never the chord', async (value) => {
    const v = await decide(SECTOR, `קשת AB = ${value}`);
    expect(v.kind).toBe('escalate');
    expect(JSON.stringify(v)).not.toMatch(/measure-length|set-distance/);
  });

  it('no drawn arc: the length sentence would not build, so the line escalates — never the chord', async () => {
    const v = await decide(CIRCLE_AB, 'קשת AB = x');
    expect(v.kind).toBe('escalate');
    expect(JSON.stringify(v)).not.toMatch(/measure-length|set-distance/);
  });
});
