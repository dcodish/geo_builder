/**
 * #1751 ([ADR-592](../../../docs/06-decisions.md#adr-592), amends ADR-569) — THE GRAMMATICAL SUBJECT OF A CROSSING
 * SENTENCE DECIDES WHAT IS DRAWN.
 *
 * Operator, round #1736 play, T3: *"«AC ו- BD נפגשים בנקודה M» should draw AC and BD vs «M מפגש AC ו-BD» which
 * related to the dot itself only and therefore only builds the dot."* Rulings 2026-10-04: the noun form gives the
 * point only, in BOTH 2-D and analytic; the verb form draws its lines whether named by letters or by role.
 *
 * Measured at pickup (origin/main 4d6e3fd6, `decideDeterministic2D` after «מרובע ABCD»): every NOUN spelling with
 * letters («M מפגש AC ו-BD», «M נקודת החיתוך של AC ו-BD», «M נקודת המפגש של …», «M היא נקודת החיתוך של …», "M is the
 * intersection of AC and BD") committed `segment AC`, `segment BD`; the VERB with the role («האלכסונים נפגשים בנקודה M»,
 * "the diagonals meet at M») committed the crossing with no diagonals drawn. Each lock drives the real submit gate and
 * reads the replayed figure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

const SIDES = new Set(['AB', 'BC', 'CD', 'AD']);

/** Drive the lines through the real gate; what is drawn beyond the ring's sides, and whether M is the crossing. */
function play(lines: string[]) {
  const { facts, refused } = driveThroughGate(lines);
  const d = replay(facts, useGeoStore.getState().seed);
  const drawn = [
    ...new Set(
      d.construction.objects.flatMap((o) => (o.kind === 'segment' ? [[o.a, o.b].sort().join('')] : [])).filter((k) => !SIDES.has(k)),
    ),
  ].sort();
  const p = (id: string) => d.positions.get(id)!;
  const [a, b, c, dd, m] = ['A', 'B', 'C', 'D', 'M'].map(p);
  const onAC = Math.abs((c.x - a.x) * (m.y - a.y) - (c.y - a.y) * (m.x - a.x));
  const onBD = Math.abs((dd.x - b.x) * (m.y - b.y) - (dd.y - b.y) * (m.x - b.x));
  const ok = Object.values(d.status).every((s) => s === 'ok');
  return { refused: refused.map((r) => r.utterance), ok, drawn, crossing: onAC < 1e-6 && onBD < 1e-6 };
}

const QUAD = 'מרובע ABCD';
const BOTH = { refused: [], ok: true, drawn: ['AC', 'BD'], crossing: true };
const POINT = { refused: [], ok: true, drawn: [], crossing: true };

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1751 — the operator’s lines, through the real submit gate', () => {
  it.each(['AC ו- BD נפגשים בנקודה M', 'AC ו-BD נפגשים בנקודה M', '⁦AC⁩ ו- ⁦BD⁩ נפגשים בנקודה ⁦M⁩', '⁦AC⁩ ו-⁦BD⁩ נפגשים בנקודה ⁦M⁩'])('«%s» draws AC, BD and M', (line) => {
    expect(play([QUAD, line])).toEqual(BOTH);
  });

  it.each(['M מפגש AC ו-BD', 'M מפגש AC ו- BD', 'M מפגש ⁦AC⁩ ו-⁦BD⁩'])('«%s» builds M only — AC and BD are not added', (line) => {
    expect(play([QUAD, line])).toEqual(POINT);
  });
});

describe('#1751 — the VERB frame draws its lines: letters or role', () => {
  it.each([
    'AC ו-BD נפגשים בנקודה M',
    'AC ו-BD נחתכים בנקודה M',
    'הישרים AC ו-BD נפגשים בנקודה M',
    'AC and BD meet at M',
    'AC חותך את BD בנקודה M',
    'האלכסונים נפגשים בנקודה M',
    'האלכסונים נחתכים בנקודה M',
    'אלכסוני המרובע נפגשים בנקודה M',
    'אלכסוני ABCD נפגשים בנקודה M',
    'the diagonals meet at M',
  ])('«%s» draws AC and BD, M at their crossing', (line) => {
    expect(play([QUAD, line])).toEqual(BOTH);
  });

  it('the role-named diagonals carry no false claim when the ring is named only in the sentence (#1650’s corpus 6/4)', () => {
    const { facts, refused } = driveThroughGate(['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה', 'O מרכז המעגל', 'אלכסוני המרובע ABCO נפגשים בנקודה K']);
    expect(refused).toEqual([]);
    expect(replay(facts, 0).violations).toEqual([]);
  });
});

describe('#1751 — the NOUN frame draws the point only: letters or role', () => {
  it.each([
    'M מפגש AC ו-BD',
    'M נקודת החיתוך של AC ו-BD',
    'M נקודת המפגש של AC ו-BD',
    'M היא נקודת החיתוך של AC ו-BD',
    'M נקודת החיתוך של AC עם BD',
    'M is the intersection of AC and BD',
    'M מפגש האלכסונים',
    'M נקודת החיתוך של האלכסונים',
    'M is the intersection of the diagonals',
  ])('«%s» builds M at the crossing, nothing else drawn', (line) => {
    expect(play([QUAD, line])).toEqual(POINT);
  });

  it('on an empty canvas the noun introduces the four ends and M, with no lines (as analytic does)', () => {
    const { facts, refused } = driveThroughGate(['M מפגש AC ו-BD']);
    expect(refused).toEqual([]);
    const d = replay(facts, 0);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(['A', 'B', 'C', 'D', 'M'].every((id) => d.positions.has(id))).toBe(true);
    expect(d.construction.objects.filter((o) => o.kind === 'segment')).toEqual([]);
  });

  it('a noun crossing over points the figure has never moves them (the ensured ends are `ifAbsent`)', () => {
    const before = replay(driveThroughGate([QUAD]).facts, 0).positions;
    const after = replay(driveThroughGate([QUAD, 'M מפגש AC ו-BD']).facts, 0).positions;
    for (const id of ['A', 'B', 'C', 'D']) expect(after.get(id)).toEqual(before.get(id));
  });
});
