/**
 * #1931 ([ADR-640](../../../docs/06-decisions.md#adr-640)) — a crossing asked of a line the givens make TANGENT at a
 * placed point has no second point, however the tangency was stated and however the crossing is spelled.
 *
 * Measured before (main @ 6096b643, through `decideDeterministic2D` + `commitVerdict`): after «הישר AP משיק למעגל O
 * בנקודה A» or «AP ⊥ OA», every crossing spelling COMMITTED with E 1·10⁻⁶ from A (the relation may lean by its own
 * 1e-6 tolerance, and the solve tuned the lean until a "second root" cleared `LEN_EPS`). Three spellings were still
 * wrong after the `evaluate` half (ADR-640 part 1): «E על הישר AP · E על מעגל O» refused as «AP ⟂ OA cannot hold»,
 * «AP חותך…» / «הקטע PA חותך…» refused with the A–E–P order sentence, and the other order (crossing first, then the
 * tangency) parked as a red row. The operator's ruling (2026-10-13, option A): EVERY spelling gets the tangent sentence.
 */
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/parser/llm', () => ({ llmParse: vi.fn() }));
import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import { tangentAt } from '@/engine/evaluate';
import { TANGENT_COS } from '@/engine/types';

const TANGENT_HE = 'לא ניתן למקם את E: הישר משיק למעגל בנקודה אחת בלבד — אין נקודת חיתוך נוספת להמשיך אליה.';
const he = i18n.getFixedT('he');

/** Play `pre` (each must commit), then submit `last`; returns its verdict kind and the sentence a refusal reads. */
async function play(pre: string[], last: string): Promise<{ kind: string; said: string; ea: number }> {
  useGeoStore.getState().clear();
  const submit = async (line: string) => {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
    commitVerdict(v, line);
    return v;
  };
  for (const line of pre) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  const v = await submit(last);
  const explain = (v as { note?: { explain?: string } }).note?.explain;
  const said = humanizeError(explain, he as never).replace(/[⁦-⁩]/g, '');
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const A = f.positions.get('A');
  const E = f.positions.get('E');
  return { kind: v.kind, said, ea: A && E ? Math.hypot(A.x - E.x, A.y - E.y) : NaN };
}

const REL = ['מעגל O', 'A על מעגל O', 'נקודה P', 'הישר AP משיק למעגל O בנקודה A'];
const PERP = ['מעגל O', 'A על מעגל O', 'נקודה P', 'AP ⊥ OA'];
const CON = ['מעגל O', 'מנקודה P משיק נוגע במעגל O בנקודה A'];

/** Every crossing spelling: the lines before the last, and the last. */
const TAILS: [string[], string][] = [
  [[], 'הישר AP חותך את המעגל בנקודה E'],
  [[], 'הישר PA חותך את מעגל O בנקודה E'],
  [[], 'המשך PA חותך את מעגל O בנקודה E'],
  [[], 'E נקודת החיתוך של הישר AP עם המעגל'],
  [[], 'E נקודת החיתוך השנייה של הישר AP עם המעגל'],
  [[], 'AP חותך את המעגל בנקודה E'], // (ii) was the order sentence
  [[], 'הקטע PA חותך את המעגל בנקודה E'], // (ii)
  [['E על PA'], 'E על מעגל O'],
  [['E על מעגל O'], 'E על הישר AP'],
  [['E על הישר AP'], 'E על מעגל O'], // (i) was «AP ⟂ OA cannot hold»; committed at HEAD after the construction spelling
  [['B על הישר AP'], 'הישר AB חותך את המעגל בנקודה E'],
];

describe('#1931 — a crossing asked of a tangent is refused with the tangent sentence', () => {
  const rows = [
    ...TAILS.map(([mid, last]) => ['relation', REL, mid, last] as const),
    ...TAILS.map(([mid, last]) => ['⟂', PERP, mid, last] as const),
    ...TAILS.map(([mid, last]) => ['construction', CON, mid, last] as const),
  ];
  it.each(rows)('%s · %s %s → «%s» refused', async (_name, pre, mid, last) => {
    const r = await play([...pre, ...mid], last);
    expect(r.kind).toBe('refuse');
    expect(r.said).toBe(TANGENT_HE);
  }, 120_000);

  it('the tangency stated without its point («הישר AP משיק למעגל O») is the same refusal', async () => {
    const r = await play(['מעגל O', 'A על מעגל O', 'נקודה P', 'הישר AP משיק למעגל O'], 'הישר AP חותך את המעגל בנקודה E');
    expect(r).toMatchObject({ kind: 'refuse', said: TANGENT_HE });
  }, 120_000);

  it.each([['AP ⊥ OA'], ['הישר AP משיק למעגל O בנקודה A']])('(iii) the other order: the crossing first, then «%s» — refused, never parked', async (tangency) => {
    const r = await play(['מעגל O', 'A על מעגל O', 'נקודה P', 'הישר AP חותך את המעגל בנקודה E'], tangency);
    expect(r.kind, 'refused before it is added, not committed as a deferred row').toBe('refuse');
    expect(r.said).toBe(TANGENT_HE);
    expect(r.ea, 'the crossing E keeps its own place').toBeGreaterThan(1);
    const st = useGeoStore.getState();
    expect(Object.values(replay(st.facts, st.seed).status).every((s) => s === 'ok'), 'every committed row stays green').toBe(true);
  }, 120_000);

  it('control: a free secant keeps its E, apart from A', async () => {
    const r = await play(['מעגל O', 'A על מעגל O', 'נקודה P'], 'הישר AP חותך את המעגל בנקודה E');
    expect(r.kind).toBe('commit');
    expect(r.ea).toBeGreaterThan(1);
  }, 120_000);
});

describe('#1931 — tangentAt is an angle test held to the ⟂ tolerance, not LEN_EPS', () => {
  const circle = { center: { x: 0, y: 0 }, r: 5 };
  const A = { x: 5, y: 0 };
  it('a line leaning from the tangent by the ⟂ tolerance is still the tangent', () => {
    expect(tangentAt({ anchor: A, dir: { x: 0, y: 1 } }, circle, A)).toBe(true);
    const lean = 1e-6; // what a relation held to DIRECTION_EPS may lean by
    expect(tangentAt({ anchor: A, dir: { x: lean, y: Math.sqrt(1 - lean * lean) } }, circle, A)).toBe(true);
  });
  it('a real secant, and a point off the circle or off the line, are not', () => {
    const c = Math.SQRT1_2;
    expect(tangentAt({ anchor: A, dir: { x: -c, y: c } }, circle, A)).toBe(false);
    const steep = 20 * TANGENT_COS;
    expect(tangentAt({ anchor: A, dir: { x: steep, y: Math.sqrt(1 - steep * steep) } }, circle, A)).toBe(false);
    expect(tangentAt({ anchor: { x: 6, y: 0 }, dir: { x: 0, y: 1 } }, circle, { x: 6, y: 0 })).toBe(false);
    expect(tangentAt({ anchor: { x: 5, y: 1 }, dir: { x: 1, y: 0 } }, circle, A)).toBe(false);
  });
});
