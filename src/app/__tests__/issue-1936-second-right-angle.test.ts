/**
 * #1936 ([ADR-658](../../../docs/06-decisions.md#adr-658)) — A SECOND RIGHT ANGLE ON A TRIANGLE IS REFUSED AT ONCE,
 * NAMING BOTH STATEMENTS, IN EVERY SPELLING — NEVER A RED ROW PARKED AS "PENDING".
 *
 * Operator rulings 2026-10-09 / 2026-10-10: *"All three tools refuse immediately, naming both statements. A pending
 * row that can never clear is not really pending."* This WITHDRAWS a shipped 2-D behaviour (the deferred row).
 *
 * Measured on `main` @ b0ef3240 through the browser path: «משולש ABC» · «AB ⊥ BC» · «AC ⊥ BC» committed DEFERRED
 * («over-constrained: AC ⟂ BC cannot hold [vs #1]»), and so did «זווית B ישרה» · «AC ⊥ BC» and «AB ⊥ BC» ·
 * «זווית C = 90»; only the all-angle spelling was refused. Root cause: `angleSumImpossibility` read only `angle`
 * constraints and only a sum strictly PAST (n − 2)·180°, so the flex probe (`constraintIsPending`) saw the free
 * apex move and parked the row. The prover now reads every spelling and refuses stated angles that leave an
 * unstated one no room.
 *
 * The gate is decided by `decideDeterministic2D` (the app's own decision). The model is mocked and never called.
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
type V = { kind: string; note?: { explain?: string } };

async function play(lines: string[]) {
  st().clear();
  const verdicts: V[] = [];
  const said: string[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const t0 = Date.now();
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, 'he')) as never as V;
    verdicts.push({ ...v, ms: Date.now() - t0 } as V);
    const ex = v.note?.explain;
    said.push(ex ? humanizeError(ex, i18n.getFixedT('he') as never, line, otherUtteranceForError(st().facts, ex)).replace(/[⁦-⁩]/g, '') : '');
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return { verdicts, said, facts: st().facts };
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const msg = (said: string, other: string, why: string) => `לא ניתן: «${said}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד. הסיבה: ${why}.`;

/** [lines, the refused last line's expected note] — the reported row first, then the class in its other spellings. */
const CLASS: [string[], string][] = [
  [['משולש ישר זווית ABC', 'AB ⊥ BC', 'AC ⊥ BC'], msg('AC ⊥ BC', 'AB ⊥ BC', 'AC ⟂ BC')],
  [['משולש ABC', 'AB ⊥ BC', 'AC ⊥ BC'], msg('AC ⊥ BC', 'AB ⊥ BC', 'AC ⟂ BC')],
  [['משולש ABC', 'זווית B ישרה', 'AC ⊥ BC'], msg('AC ⊥ BC', 'זווית B ישרה', 'AC ⟂ BC')],
  [['משולש ABC', 'AB ⊥ BC', 'זווית C = 90'], msg('זווית C = 90', 'AB ⊥ BC', '∠BCA = 90°')],
  [['משולש ABC', 'זווית ABC = 90', 'זווית ACB = 90'], msg('זווית ACB = 90', 'זווית ABC = 90', '∠ACB = 90°')],
  [['משולש ABC', 'AB ⊥ BC', 'AB ⊥ AC'], msg('AB ⊥ AC', 'AB ⊥ BC', 'AB ⟂ AC')],
  [['משולש ABC', 'זווית ABC = 100', 'זווית ACB = 80'], msg('זווית ACB = 80', 'זווית ABC = 100', '∠ACB = 80°')],
];

describe('#1936 — the second right angle (and every angle pair leaving no room) is refused at once, naming both', () => {
  for (const [lines, note] of CLASS) {
    it(lines.join(' · '), async () => {
      const g = await play(lines);
      expect(g.verdicts.map((v) => v.kind)).toEqual(['commit', 'commit', 'refuse']);
      expect(g.said[2]).toBe(note);
      const r = replay(g.facts, 0);
      expect(Object.values(r.status).every((s) => s === 'ok'), 'the figure keeps line 2, green').toBe(true);
      expect(r.pending, 'no pending row').toBe(false);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }
});

describe('#1936 — the false-refusal controls still build', () => {
  const CONTROLS: string[][] = [
    ['משולש ABC', 'AB ⊥ BC', 'AB = 3', 'BC = 4'],
    ['משולש ABC', 'AB ⊥ BC', 'AC = 5', 'AB = 3'],
    ['משולש ישר זווית ABC', 'AC ⊥ BC'],
    ['משולש ישר זווית ABC', 'AB ⊥ BC'],
    ['משולש ABC', 'זווית ABC = 90', 'זווית ACB = 89'],
    ['משולש ABC', 'זווית ABC = 60', 'זווית ACB = 60', 'זווית BAC = 60'],
    ['מלבן ABCD'],
    ['ריבוע ABCD', 'AB = 4'],
    ['מרובע ABCD', 'AB ⊥ BC', 'BC ⊥ CD', 'CD ⊥ DA'],
  ];
  for (const lines of CONTROLS) {
    it(lines.join(' · '), async () => {
      const g = await play(lines);
      expect(g.verdicts.every((v) => v.kind === 'commit'), JSON.stringify(g.said)).toBe(true);
      const r = replay(g.facts, 0);
      expect(Object.values(r.status).every((s) => s === 'ok'), JSON.stringify(r.status)).toBe(true);
    });
  }
});
