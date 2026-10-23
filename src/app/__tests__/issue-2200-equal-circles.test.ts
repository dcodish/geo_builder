/**
 * #2200 ([ADR-712](../../../docs/06-decisions.md#adr-712)) — two circles of equal radius: the bare pair builds, and
 * a pair stated CONTAINED and equal is refused from the words.
 *
 * Measured at de7c221f through `decideDeterministic2D` → `commitVerdict` → `replay`, model mocked: «שני מעגלים
 * ברדיוסים שווים» and its five other spellings escalated `not-handled` (the bare rule's leftover never stripped the
 * equal-size vocabulary it reads); «שני מעגלים מוכלים ברדיוסים שווים» and five spellings committed RED
 * (`figure.v.circleContained`); «מעגל מוכל (במעגל O) ברדיוסים שווים» escalated through ADR-679's word gate. Operator
 * ruling 2026-10-16 (card 20, option A): *"Build the first; refuse the second with a sentence naming the
 * contradiction"*.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { variantCountOf, withVariant } from '@/engine/variants';
import i18n from '@/i18n';

const lang = (line: string): 'he' | 'en' => (/[א-ת]/.test(line) ? 'he' : 'en');

async function decide(prefix: string[], line: string) {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, lang(line));
}

function facts(lines: string[]) {
  useGeoStore.getState().clear();
  const { facts: fs, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  return fs;
}

type Fig = ReturnType<typeof replay>;
const pairOf = (fig: Fig) => {
  const [a, b] = [...fig.circles.values()];
  return { a, b, gap: Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) };
};
const classify = (fig: Fig): 'intersecting' | 'disjoint' | 'contained' | 'coincident' => {
  const { a, b, gap } = pairOf(fig);
  if (gap < 1e-6) return 'coincident';
  if (gap > a.r + b.r) return 'disjoint';
  if (gap + Math.min(a.r, b.r) < Math.max(a.r, b.r)) return 'contained';
  return 'intersecting';
};

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const BARE = [
  'שני מעגלים ברדיוסים שווים',
  'שני מעגלים שרדיוסיהם שווים',
  'שני מעגלים, רדיוסיהם שווים',
  'שני מעגלים ששטחם שווה',
  'שני מעגלים שהיקפם שווה',
  'two circles with equal radii',
];

describe('#2200 (i) — the bare equal pair builds, in every spelling', () => {
  for (const line of BARE) {
    it(`«${line}» commits two equal circles, the given in the list, green at seeds 0–23, the model never asked`, async () => {
      const v = await decide([], line);
      expect(v.kind, line).toBe('commit');
      const fs = facts([line]);
      expect(fs.some((f) => f.cmd.type === 'set-radius-ratio' && (f.cmd as { k: number }).k === 1), 'the given is in the givens list').toBe(true);
      let whole = 0;
      for (let seed = 0; seed < 24; seed++) {
        const fig = replay(fs, seed);
        const { a, b } = pairOf(fig);
        if (fig.lastError === null && fig.violations.length === 0 && Math.abs(a.r - b.r) < 1e-6 && Object.values(fig.status).every((s) => s === 'ok')) whole++;
      }
      expect(whole, 'whole-rate (docs/17 §9)').toBeGreaterThanOrEqual(20);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }
});

describe('#2200 (ii) — an equal pair cycles crossing ↔ apart only', () => {
  for (const line of ['שני מעגלים ברדיוסים שווים', 'two circles with equal radii']) {
    it(`«${line}»: two configurations, each crossing or apart and never nearly coincident`, () => {
      const fs = facts([line]);
      const pos = fs.find((f) => f.cmd.type === 'set-circle-position')!;
      expect(variantCountOf(pos.cmd), 'the configuration count').toBe(2);
      for (const v of [0, 1]) {
        const stepped = fs.map((f) => (f.cmd.type === 'set-circle-position' ? { ...f, cmd: withVariant(f.cmd, v) } : f));
        for (let seed = 0; seed < 8; seed++) {
          const fig = replay(stepped, seed);
          const { a, b, gap } = pairOf(fig);
          expect(Math.abs(a.r - b.r), `v${v} s${seed} equal`).toBeLessThan(1e-6);
          expect(fig.violations, `v${v} s${seed}`).toEqual([]);
          expect(gap, `v${v} s${seed}: the centres are apart`).toBeGreaterThan(0.5 * a.r);
          expect(['intersecting', 'disjoint'], `v${v} s${seed}`).toContain(classify(fig));
          if (seed === 0) expect(classify(fig), 'the seeded default of each case').toBe(v === 0 ? 'intersecting' : 'disjoint');
        }
      }
    });
  }

  it('the store\'s «הציגו תצורה אחרת» steps to the apart configuration and back', () => {
    facts(['שני מעגלים ברדיוסים שווים']);
    const st = () => useGeoStore.getState();
    const seen: string[] = [classify(replay(st().facts, st().seed))];
    for (let i = 0; i < 2; i++) {
      expect(st().cycleVariant(), 'a variant step is available').toBe(true);
      seen.push(classify(replay(st().facts, st().seed)));
    }
    expect(seen).toEqual(['intersecting', 'disjoint', 'intersecting']);
  });
});

const NESTED: [string[], string][] = [
  [[], 'שני מעגלים מוכלים ברדיוסים שווים'],
  [[], 'שני מעגלים מוכלים ששטחם שווה'],
  [[], 'two contained circles with equal radii'],
  [[], 'שני מעגלים, אחד מוכל בשני, ברדיוסים שווים'],
  [['מעגל O', 'מעגל P'], 'מעגל P מוכל במעגל O ברדיוסים שווים'],
  [['מעגל O', 'מעגל P'], 'המעגלים מוכלים ברדיוסים שווים'],
  [['מעגל O'], 'מעגל מוכל במעגל O ברדיוסים שווים'],
  [[], 'מעגל מוכל ברדיוסים שווים'],
];

describe('#2200 (iii) — a contained pair stated equal is refused from the words', () => {
  for (const [prefix, line] of NESTED) {
    it(`${prefix.length ? `[${prefix.join(' · ')}] ` : ''}«${line}» → refused naming the contradiction, nothing added`, async () => {
      const v = await decide(prefix, line);
      expect(v.kind, line).toBe('refuse');
      if (v.kind !== 'refuse') return;
      expect(v.note).toEqual({ key: 'input.equalCirclesNested.contained', params: { detail: line } });
      useGeoStore.getState().clear();
      const { facts: fs, refused } = driveThroughGate([...prefix, line]);
      expect(refused.length, 'the gate refuses the line').toBe(1);
      expect(fs.filter((f) => f.utterance === line), 'nothing added').toEqual([]);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('the message quotes the line and names the contradiction, in both locales', () => {
    const line = 'שני מעגלים מוכלים ברדיוסים שווים';
    const he = i18n.getFixedT('he')('input.equalCirclesNested.contained', { detail: line });
    expect(he).toBe(`«${line}»: שני מעגלים שרדיוסיהם שווים אינם יכולים להיות מוכלים זה בזה, כי מעגל שמוכל במעגל אחר קטן ממנו. כתבו רק אחד מהשניים: «מוכלים» או «ברדיוסים שווים».`);
    const en = i18n.getFixedT('en')('input.equalCirclesNested.contained', { detail: 'two contained circles with equal radii' });
    expect(en).toContain('«two contained circles with equal radii»: two circles with equal radii cannot be contained');
  });

  it('each taught next step builds: «שני מעגלים מוכלים» and «שני מעגלים ברדיוסים שווים»', () => {
    for (const line of ['שני מעגלים מוכלים', 'שני מעגלים ברדיוסים שווים']) {
      const fig = replay(facts([line]), 0);
      expect(fig.lastError, line).toBeNull();
      expect(fig.violations, line).toEqual([]);
    }
  });
});

describe('#2200 (iv) — controls unchanged', () => {
  it('«שני מעגלים» keeps its three configurations', () => {
    const fs = facts(['שני מעגלים']);
    const pos = fs.find((f) => f.cmd.type === 'set-circle-position')!;
    expect(variantCountOf(pos.cmd)).toBe(3);
    expect((pos.cmd as { admits?: unknown }).admits).toBeUndefined();
  });
  it.each(['שני מעגלים מוכלים', 'שני מעגלים זרים ברדיוסים שווים', 'שני מעגלים משיקים ברדיוסים שווים'])('«%s» commits', async (line) => {
    const v = await decide([], line);
    expect(v.kind, line).toBe('commit');
  });
});
