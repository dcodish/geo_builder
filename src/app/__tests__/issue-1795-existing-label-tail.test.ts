/**
 * #1795 ([ADR-597](../../../docs/06-decisions.md#adr-597)) — a clause about EXISTING points is never dropped green.
 *
 * Measured on `main` fa1d2492 through `decideDeterministic2D` (the LLM mocked): after «משולש ABC»,
 * «מעגל שקוטרו AB עובר דרך C» committed `segment AB · midpoint · circle-through A` with C gone, and about
 * twenty whole-line rules dropped a trailing clause the same way («M אמצע AB ו-D על BC» → the midpoint only;
 * «מעגל שמרכזו A עובר דרך B ו-D על BC» → only `D on BC`, the circle gone). Every label gate exempted an
 * EXISTING label as "context" without asking whether any command referred to it.
 *
 * The class: a stated label the lowering neither carries nor refers to (through a circle it references, a
 * circle it names, or a polygon the sentence names) is unaccounted, so the parser routes the line to the
 * clause split and the commit gate refuses what the split cannot read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { unaccountedLabels } from '@/parser/labelAccounting';
import type { AnyCommand } from '@/engine';

type V = { x: number; y: number };
const d = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y);

async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
}

/** The clause is CARRIED: a command places D on BC («ו-D על BC»), or names D at all («עובר דרך D»). */
function clauseCarried(tail: 'through' | 'on', cmds: readonly AnyCommand[]): boolean {
  const json = JSON.stringify(cmds);
  if (tail === 'through') return /"D"/.test(json);
  return cmds.some(
    (c) =>
      (c.type === 'point-on-segment' && c.id === 'D' && [c.a, c.b].sort().join() === 'B,C') ||
      (c.type === 'set-collinear' && [c.a, c.b, c.c].sort().join() === 'B,C,D'),
  );
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const PREFIX = ['משולש ABC', 'נקודה D'];
/** The triage's class table (2026-10-05), Hebrew, with the English mirror where the grammar reads one. */
const HEADS: string[] = [
  'מעגל שקוטרו AB',
  'AB קוטר במעגל',
  'מעגל חוסם את המשולש ABC',
  'מעגל חסום במשולש ABC',
  'M אמצע AB',
  'E על BC',
  'AH גובה לצלע BC',
  'AN תיכון לצלע BC',
  'AK חוצה את זווית A',
  'אנך אמצעי לצלע AB',
  'ישר דרך C המקביל ל-AB',
  'אנך מ-C ל-AB',
  'קטע AD',
  'זווית ABC = 50',
  'AB = AC',
  'מעגל שמרכזו A עובר דרך B',
  'המשך AB',
  'circle with diameter AB',
  'M is the midpoint of AB',
];
const TAILS: { tail: 'through' | 'on'; he: string; en: string }[] = [
  { tail: 'through', he: 'עובר דרך D', en: 'through D' },
  { tail: 'on', he: 'ו-D על BC', en: 'and D on BC' },
];

/**
 * The residual the token-level accountant cannot see: the dropped clause's letters are all carried by
 * ANOTHER clause of the line. That is #1798's class (the clause-coverage gate), closed by #1798's clause-coverage gate (ADR-598).
 */
const RESIDUAL_1798 = new Set(['AB מקביל ל-CD ו-D על BC', 'AB מאונך ל-CD ו-D על BC', 'מעגל חוסם את המשולש ABC ו-AD מאונך ל-BC']);

describe('#1795 — the class battery: no row commits without its clause', () => {
  const rows = HEADS.flatMap((h) =>
    TAILS.map(({ tail, he, en }) => ({ tail, line: /^[A-Za-z]/.test(h) && !/[א-ת]/.test(h) ? `${h} ${en}` : `${h} ${he}` })),
  ).filter(({ line }) => !/^קטע AD עובר דרך D$/.test(line)); // a tautology: AD passes through D
  it.each(rows)('«$line» after «משולש ABC · נקודה D» either carries the clause or does not commit', async ({ tail, line }) => {
    const v = await decide(PREFIX, line);
    if (v.kind === 'commit') expect(clauseCarried(tail, v.commands), JSON.stringify(v.commands)).toBe(true);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  // #1798 (ADR-598) closed the residual: the clause-coverage gate refuses the whole line with the shared message.
  it.each([...RESIDUAL_1798])('«%s» — the dropped clause rides another clause’s letters, and the line is refused whole (#1798)', async (line) => {
    const v = await decide(PREFIX, line);
    expect(v.kind).toBe('refuse');
    expect(v.kind === 'refuse' && v.note).toMatchObject({ key: 'input.scope.split-statements' });
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('#1795 — the issue’s own line and its spellings', () => {
  it.each(['מעגל שקוטרו AB עובר דרך C', 'מעגל שקוטרו AB העובר דרך C', 'המעגל שקוטרו AB עובר דרך C', 'circle with diameter AB through C', 'AB קוטר במעגל העובר דרך C'])(
    '«%s» after «משולש ABC» is not committed with C gone',
    async (line) => {
      const v = await decide(['משולש ABC'], line);
      if (v.kind === 'commit') expect(JSON.stringify(v.commands)).toMatch(/"C"/);
      else expect(v.kind).not.toBe('commit');
    },
  );

  it('the honest outcome is an escalation, not a refusal that names internals', async () => {
    const v = await decide(['משולש ABC'], 'מעגל שקוטרו AB עובר דרך C');
    expect(v.kind).toBe('escalate');
  });
});

describe('#1795 — the clause split now reads the compound (no paid call)', () => {
  it.each(['מעגל שקוטרו AB ו-C על המעגל', 'מעגל שקוטרו AB, C על המעגל', 'מעגל שקוטרו AB וגם C על המעגל'])(
    '«%s» commits the circle AND C on it, and the figure holds ∠ACB = 90° (seeds 0–3)',
    async (line) => {
      const v = await decide(['משולש ABC'], line);
      expect(v.kind).toBe('commit');
      expect(v.kind === 'commit' && v.commands).toContainEqual({ type: 'point-on-circle', id: 'C', circle: 'circle-O' });
      expect(llmParseMock).not.toHaveBeenCalled();
      for (const seed of [0, 1, 2, 3]) {
        const { facts, refused } = driveThroughGate(['משולש ABC', line]);
        expect(refused).toEqual([]);
        const f = replay(facts, seed);
        const [A, B, C] = ['A', 'B', 'C'].map((k) => f.positions.get(k)!);
        const ab2 = d(A, B) ** 2;
        // solver precision: the residual is ~1e-7 relative, the same as the canonical two-line spelling
        expect(Math.abs(d(A, C) ** 2 + d(B, C) ** 2 - ab2) / ab2, `seed ${seed}: Thales`).toBeLessThan(1e-5);
        expect(f.violations, `seed ${seed}`).toEqual([]);
      }
    },
  );

  it('the oracle decomposition of the through-form (what the LLM should emit) builds the same figure', async () => {
    const seq = ['משולש ABC', 'מעגל שקוטרו AB', 'C על המעגל'];
    const { facts, refused } = driveThroughGate(seq);
    expect(refused).toEqual([]);
    const f = replay(facts, 0);
    const [A, B, C] = ['A', 'B', 'C'].map((k) => f.positions.get(k)!);
    expect(Math.abs(d(A, C) ** 2 + d(B, C) ** 2 - d(A, B) ** 2) / d(A, B) ** 2).toBeLessThan(1e-5);
  });

  it('a head the split cannot keep (the centre-and-through circle) now keeps BOTH clauses', async () => {
    const v = await decide(PREFIX, 'מעגל שמרכזו A עובר דרך B ו-D על BC');
    expect(v.kind).toBe('commit');
    const cmds = v.kind === 'commit' ? v.commands : [];
    expect(cmds.some((c) => c.type === 'circle-through' && c.center === 'A' && c.through === 'B'), 'the circle').toBe(true);
    expect(clauseCarried('on', cmds), 'D on BC').toBe(true);
  });
});

describe('#1795 — the position-word row (operator ruling 2026-10-06: 2-D does not read it; it must only not commit green)', () => {
  it.each(['B מתחת לאלכסון AC', 'B מעל הקטע AC', 'B מימין לקטע AC', 'B רחוק מהקטע AC', 'B is above segment AC'])(
    '«%s» after «ריבוע ABCD» does not commit',
    async (line) => {
      const v = await decide(['ריבוע ABCD'], line);
      expect(v.kind).not.toBe('commit');
    },
  );
  // English «diagonal AC» draws BOTH diagonals today, so B is carried by a segment BD nobody asked for —
  // a separate defect (the `diagonals` rule reads the singular as the plural), filed as #1742.
  it.todo('«B below diagonal AC» after «ריבוע ABCD» does not commit (needs the singular-diagonal fix, #1742)');
});

describe('#1795 — references stay context (controls)', () => {
  it('a restated point on the circle, and a restated circumcircle, still commit or no-op', async () => {
    for (const [prefix, line] of [
      [['משולש ABC', 'מעגל חוסם את המשולש ABC'], 'מעגל חוסם את המשולש ABC'],
      [['משולש ABC', 'מעגל שקוטרו AB', 'C על המעגל'], 'C על המעגל'],
      [['משולש ABC', 'מעגל שקוטרו AB'], 'C על המעגל'],
      [['משולש ABC'], 'AB=4, BC=3'],
      [['ריבוע ABCD'], 'ריבוע ABCD, נקודה G על AD'],
    ] as [string[], string][]) {
      const v = await decide(prefix, line);
      expect(v.kind === 'commit' || (v.kind === 'refuse' && v.category !== 'conflict') || v.kind === 'noop', `${line}: ${JSON.stringify(v).slice(0, 200)}`).toBe(true);
      expect(v.kind, line).not.toBe('escalate');
    }
  });

  it('the reference rules: a referenced circle brings its members, a circle name and a named polygon are context', () => {
    const circleMembers = [{ id: 'circle-O', center: 'O', points: ['A', 'B', 'C', 'D'] }];
    const existingPoints = ['A', 'B', 'C', 'D', 'O', 'F'];
    // «AD קוטר במעגל ABCD»: the circle is named by its points
    const diam: AnyCommand[] = [{ type: 'point-on-circle', id: 'A', circle: 'circle-O' }, { type: 'point-on-circle', id: 'D', circle: 'circle-O' }];
    expect(unaccountedLabels('AD קוטר במעגל ABCD', diam, { existingPoints, circleMembers }).labels).toEqual([]);
    // «… במעגל O» names the circle, and the lowering touches a circle
    expect(unaccountedLabels('F על המעגל O', [{ type: 'point-on-circle', id: 'F', circle: 'circle-P' }], { existingPoints }).labels).toEqual([]);
    // «במשולש ABC» names an existing polygon whose vertex the lowering carries
    expect(
      unaccountedLabels('M אמצע AB במשולש ABC', [{ type: 'midpoint', id: 'M', a: 'A', b: 'B' }], { existingPoints, polygons: [['A', 'B', 'C']] }).labels,
    ).toEqual([]);
    // …but an existing label the lowering never reaches is NOT context
    expect(unaccountedLabels('M אמצע AB ו-D על BC', [{ type: 'midpoint', id: 'M', a: 'A', b: 'B' }], { existingPoints, polygons: [['A', 'B', 'C']] }).labels).toEqual(['D', 'C']);
  });
});
