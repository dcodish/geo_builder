/**
 * #2477 ([ADR-761](../../../docs/06-decisions.md#adr-761)) — A DIAMETER STATED ABOUT «המעגל» / "THE CIRCLE" IS A
 * REFERENCE: it is drawn on the circle the figure already has, and beside several circles it asks which (or binds
 * the one its ends already ride). It never mints another circle.
 *
 * Measured at 1944d866 through `decideDeterministic2D` + the store, model mocked (0 calls):
 *   «מעגל O» · «AB הוא קוטר של המעגל» (and every copula/possessive spelling, English, an unnamed circle, a
 *   circumcircle, ends already on O, the compounds)    → `segment` + `midpoint @ctr-P` + `circle-through circle-P`:
 *                                                         a NEW circle on AB beside O, green
 *   «מעגל O» · «מעגל P» · the same line               → a THIRD circle M, green
 *
 * Root cause: `circleOnDiameter` (ADR-090) decided define-vs-add by phrasing alone; its DEFINE marker matched the
 * definite «של המעגל» / "of the circle", a reference. Fix: it asks the shared `definiteCircleReference` predicate
 * (ADR-548, ADR-690) first and steps aside to `diameter`, which binds, asks, or applies the membership tie-break.
 *
 * The assertion is the honesty invariant, not a command shape: a committed line never adds a circle object
 * beside a drawn circle it referred to definitely.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

type Out = { kind: string; key: string | null; commands: readonly unknown[] | null };
async function submit(lines: string[], lng: 'he' | 'en' = 'he'): Promise<Out[]> {
  useGeoStore.getState().clear();
  const out: Out[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, lng);
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
    }
    const note = v.kind === 'refuse' ? (v.note as { key?: string } | undefined) : undefined;
    out.push({ kind: v.kind, key: note?.key ?? null, commands: v.kind === 'commit' ? v.commands : null });
  }
  return out;
}
const circleCount = () => {
  const st = useGeoStore.getState();
  return replay(st.facts, st.seed).circles.size;
};
const allGreen = () => {
  const st = useGeoStore.getState();
  const fig = replay(st.facts, st.seed);
  expect(fig.lastError).toBeNull();
  for (const f of st.facts) expect(fig.status[f.id], f.utterance).toBe('ok');
};
/** At seeds 0–2: `a` and `b` are antipodal on `circle` — both on it, and its centre is their midpoint. */
const isDiameterOf = (a: string, b: string, circle: string) => {
  const st = useGeoStore.getState();
  for (const seed of [0, 1, 2]) {
    const fig = replay(st.facts, seed);
    const c = fig.circles.get(circle)!;
    const A = fig.positions.get(a)!;
    const B = fig.positions.get(b)!;
    expect(Math.hypot(A.x - c.center.x, A.y - c.center.y), `|${a}·centre| @ ${seed}`).toBeCloseTo(c.r, 6);
    expect(Math.hypot(B.x - c.center.x, B.y - c.center.y), `|${b}·centre| @ ${seed}`).toBeCloseTo(c.r, 6);
    expect((A.x + B.x) / 2, `midpoint x @ ${seed}`).toBeCloseTo(c.center.x, 6);
    expect((A.y + B.y) / 2, `midpoint y @ ${seed}`).toBeCloseTo(c.center.y, 6);
  }
};

describe('#2477 — one circle drawn: a diameter of «המעגל» is a diameter of THAT circle', () => {
  // [prelude, the line, the diameter's ends, locale]
  const ROWS: [string[], string, [string, string], 'he' | 'en'][] = [
    [['מעגל O'], 'AB הוא קוטר של המעגל', ['A', 'B'], 'he'], // the report
    [['מעגל O'], 'AB קוטר של המעגל', ['A', 'B'], 'he'],
    [['מעגל O'], 'AB הינו קוטר של המעגל', ['A', 'B'], 'he'],
    [['מעגל O'], 'AB הוא הקוטר של המעגל', ['A', 'B'], 'he'],
    [['מעגל O'], 'הקטע AB הוא קוטר של המעגל', ['A', 'B'], 'he'],
    [['circle O'], 'AB is a diameter of the circle', ['A', 'B'], 'en'],
    [['circle O'], 'AB is the diameter of the circle', ['A', 'B'], 'en'],
    [['circle O'], 'AB diameter of the circle', ['A', 'B'], 'en'],
    [['מעגל ברדיוס 3'], 'AB הוא קוטר של המעגל', ['A', 'B'], 'he'], // an unnamed circle
    [['משולש ABC חסום במעגל'], 'AD קוטר של המעגל', ['A', 'D'], 'he'], // a circumcircle
    [['מעגל O', 'A על המעגל'], 'AB קוטר של המעגל', ['A', 'B'], 'he'], // one end already on O
    [['מעגל O', 'A על המעגל', 'B על המעגל'], 'AB קוטר של המעגל', ['A', 'B'], 'he'], // both ends on O
    // controls already right at 1944d866 (the locative / construct spellings) — the same figure
    [['מעגל O'], 'AB קוטר במעגל', ['A', 'B'], 'he'],
    [['מעגל O'], 'AB הוא קוטר המעגל', ['A', 'B'], 'he'],
  ];
  it.each(ROWS)('%j · «%s»', async (prelude, line, [a, b], lng) => {
    const out = await submit([...prelude, line], lng);
    expect(out[out.length - 1].kind, line).toBe('commit');
    expect(circleCount(), 'no second circle').toBe(1);
    allGreen();
    isDiameterOf(a, b, 'circle-O');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the compounds bind both clauses to the one circle', async () => {
    for (const line of ['AB קוטר של המעגל ו-CD מיתר במעגל', 'AB קוטר של המעגל, C על המעגל']) {
      const out = await submit(['מעגל O', line]);
      expect(out[1].kind, line).toBe('commit');
      expect(circleCount(), line).toBe(1);
      allGreen();
      isDiameterOf('A', 'B', 'circle-O');
    }
  });
});

describe('#2477 — several circles: the line asks which, or binds the one its ends ride; never a third circle', () => {
  it.each([
    [['מעגל O', 'מעגל P'], 'AB הוא קוטר של המעגל', 'he'],
    [['מעגל O', 'מעגל P'], 'AB קוטר של המעגל', 'he'],
    [['circle O', 'circle P'], 'AB is a diameter of the circle', 'en'],
    [['circle O', 'circle P'], 'AB is the diameter of the circle', 'en'],
    [['שני מעגלים נחתכים בנקודות A ו-B'], 'AC קוטר של המעגל', 'he'], // A rides both: the ask
  ] as [string[], string, 'he' | 'en'][])('%j · «%s» asks', async (prelude, line, lng) => {
    const out = await submit([...prelude, line], lng);
    const last = out[out.length - 1];
    expect(last.kind, line).toBe('refuse');
    expect(last.key).toBe('input.ambiguousCircleRef');
    expect(circleCount()).toBe(2);
  });

  it('the membership tie-break: with A on circle P, AB is a diameter of P (as «AB קוטר במעגל» does)', async () => {
    for (const line of ['AB קוטר של המעגל', 'AB קוטר במעגל']) {
      const out = await submit(['מעגל O', 'מעגל P', 'A על מעגל P', line]);
      expect(out[3].kind, line).toBe('commit');
      expect(circleCount(), line).toBe(2);
      allGreen();
      isDiameterOf('A', 'B', 'circle-P');
    }
  });

  it('a size-qualified «המעגל הגדול» still picks its circle', async () => {
    const out = await submit(['מעגל O ברדיוס 2', 'מעגל P ברדיוס 5', 'AB קוטר של המעגל הגדול']);
    expect(out[2].kind).toBe('commit');
    expect(circleCount()).toBe(2);
    isDiameterOf('A', 'B', 'circle-P');
  });
});

describe('#2477 — the definite twin of a refused line is refused the same way (never a second circle)', () => {
  it('«מעגל O · AB = 6 · AB קוטר של המעגל» answers exactly as «… AB קוטר במעגל» does', async () => {
    const definite = await submit(['מעגל O', 'AB = 6', 'AB קוטר של המעגל']);
    expect(circleCount()).toBe(1);
    const twin = await submit(['מעגל O', 'AB = 6', 'AB קוטר במעגל']);
    expect(definite[2].kind).toBe(twin[2].kind);
    expect(definite[2].key).toBe(twin[2].key);
  });
});

describe('#2477 — controls that must keep CREATING a circle on AB', () => {
  it.each([
    [['מעגל O'], 'AB קוטר של מעגל', 'he'], // ADR-090's indefinite define
    [['circle O'], 'AB is a diameter of a circle', 'en'],
    [['מעגל O'], 'מעגל שקוטרו AB', 'he'],
    [['מעגל O'], 'המעגל שקוטרו AB', 'he'], // a defining clause (#2498's open question — unchanged)
    [['circle O'], 'the circle with diameter AB', 'en'],
    [['מעגל O'], 'AB קוטר של המעגל החדש', 'he'],
    [['מעגל O'], 'AB קוטר של מעגל חדש', 'he'],
    [['מעגל O'], 'OB קוטר של המעגל', 'he'], // #152: an end that is the centre cannot lie on it
    [['מעגל O'], 'OB קוטר במעגל', 'he'],
  ] as [string[], string, 'he' | 'en'][])('%j · «%s» → a new circle', async (prelude, line, lng) => {
    const out = await submit([...prelude, line], lng);
    expect(out[out.length - 1].kind, line).toBe('commit');
    expect(circleCount(), line).toBe(2);
    allGreen();
  });

  it.each([
    ['AB הוא קוטר של המעגל', 'he'],
    ['AB קוטר של המעגל', 'he'],
    ['AB is a diameter of the circle', 'en'],
    ['AB is the diameter of the circle', 'en'],
  ] as [string, 'he' | 'en'][])('no circle drawn: «%s» introduces one on AB', async (line, lng) => {
    const out = await submit([line], lng);
    expect(out[0].kind).toBe('commit');
    expect(circleCount()).toBe(1);
    allGreen();
    isDiameterOf('A', 'B', 'circle-O');
  });
});

describe('#2477 — radius and chord were never members (non-regression)', () => {
  it.each(['OA הוא רדיוס של המעגל', 'OA רדיוס של המעגל', 'AB הוא מיתר של המעגל', 'AB מיתר של המעגל'])(
    '«מעגל O» · «%s» stays on O',
    async (line) => {
      const out = await submit(['מעגל O', line]);
      expect(out[1].kind, line).toBe('commit');
      expect(circleCount()).toBe(1);
      allGreen();
    },
  );
});
