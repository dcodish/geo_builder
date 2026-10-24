/**
 * #2443 ([ADR-764](../../../docs/06-decisions.md#adr-764)) — GIVENS THAT HOLD ONLY WHERE TWO NAMED POINTS MEET ARE
 * REFUSED WHETHER OR NOT THE THREE POINTS ARE A DECLARED TRIANGLE.
 *
 * «מרובע ABCD» · «AB = BC» · «AC ⊥ BC» drew a green quadrilateral with C on A (1.3e-3 – 1.9e-3 of the extent at
 * seeds 0–7, measured at 045a8546), and «AB = BC» · «∠ACB = 90» in the quadrilateral was parked as pending. ADR-746
 * closed the class for a DECLARED triangle only, through two channels both scoped to declared polygons:
 *  A. the tightened re-solve's trigger read whole-polygon flatness; two vertices of a quadrilateral meeting leave it
 *     fat, and loose points have no polygon. The trigger now also reads the collapsible term pairs of every enforced
 *     constraint, inside the same band (`THIN_POLYGON_RATIO`);
 *  A′. a primary refused on a term pair alone carries its own verdict (the over-constraint), never a rescue stage's
 *     collateral straight corner;
 *  B. the no-room prover read base angles only inside a declared triangle; the base-angle theorem holds for any three
 *     distinct points, so the triples no declared triangle covers are read too (`undeclared`).
 * Both refuse with FR-EN-8's over-constraint («X» סותר את «Y»), marked degenerate, never a flat-polygon sentence that
 * would name a line D is not on.
 *
 * The runner is the real pre-LLM decision `decideDeterministic2D` with every accepted line committed by the pipeline's
 * own `commitVerdict`, the model mocked (standing rule 2).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { COLLAPSED_VS, OVER_CONSTRAINED_VS } from '@/replay/core';
import { applyCommand, buildSymTab, drivenConstraintsOf, lowerOne } from '@/engine';
import type { Command } from '@/engine';
import { angleSumImpossibility } from '@/engine/metricFeasibility';
import { buildParseCtx, parse } from '@/parser';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { otherUtteranceForError } from '@/app/errorSubject';
import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';

const st = () => useGeoStore.getState();
const SEEDS24 = Array.from({ length: 24 }, (_, s) => s);
const SEEDS8 = SEEDS24.slice(0, 8);

async function drive(lines: string[], seed: number, locale: 'he' | 'en' = 'he'): Promise<{ verdicts: Verdict2D[]; fig: ReturnType<typeof replay> }> {
  st().clear();
  useGeoStore.setState({ seed } as never);
  const verdicts: Verdict2D[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
    verdicts.push(v);
    if (v.kind !== 'store-op' && v.kind !== 'refuse') commitVerdict(v, line);
  }
  return { verdicts, fig: replay(st().facts, st().seed) };
}
const explainOf = (v: Verdict2D): string => (v.kind === 'refuse' && 'explain' in v.note ? v.note.explain : '');
const he = i18n.getFixedT('he') as unknown as Translate;
const en = i18n.getFixedT('en') as unknown as Translate;
/** The smallest distance between two named (single-letter) points over the figure's extent. */
function closestPair(fig: ReturnType<typeof replay>): number {
  const pts = [...fig.positions.entries()].filter(([k]) => /^[A-Z]$/.test(k)).map(([, v]) => v);
  let ext = 1;
  for (const p of pts) ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y));
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) best = Math.min(best, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y) / ext);
  return best;
}

/** The prover's verdict on the construction with the line applied — the gate's own reading. */
function proverOn(prefix: string[], line: string) {
  const facts = factsOf(prefix);
  const fig = replay(facts);
  const r = parse(line, buildParseCtx(fig.construction, fig.positions));
  if (!r.ok) throw new Error(`no parse: ${line}`);
  const symtab = buildSymTab([...facts.map((f) => f.cmd), ...r.commands]);
  const cmds = r.commands.flatMap((c) => lowerOne(c, symtab)) as Command[];
  const probe = cmds.reduce((c, cmd) => applyCommand(c, cmd), fig.construction);
  return angleSumImpossibility(probe.objects, probe.constraints, [...probe.constraints, ...drivenConstraintsOf(probe)]);
}

/** Members: the last line is refused; `said` is the statement the refusal names, `other` the one it contradicts. */
const MEMBERS: { lines: string[]; said: string; other: string; locale?: 'en' }[] = [
  { lines: ['מרובע ABCD', 'AB = BC', 'AC ⊥ BC'], said: 'AC ⊥ BC', other: 'AB = BC' },
  { lines: ['מרובע ABCD', 'AC ⊥ BC', 'AB = BC'], said: 'AB = BC', other: 'AC ⊥ BC' },
  { lines: ['מרובע ABCD', 'AB = BC', 'BC ⊥ AC'], said: 'BC ⊥ AC', other: 'AB = BC' },
  { lines: ['מרובע ABCD', 'AB = BC', 'AC מאונך ל-BC'], said: 'AC מאונך ל-BC', other: 'AB = BC' },
  { lines: ['quadrilateral ABCD', 'AB = BC', 'AC ⊥ BC'], said: 'AC ⊥ BC', other: 'AB = BC', locale: 'en' },
  { lines: ['מרובע ABCD', 'AB = 5', 'BC = 5', 'AC ⊥ BC'], said: 'AC ⊥ BC', other: '' },
  { lines: ['מרובע ABCD', 'AC = BC', 'AB ⊥ AC'], said: 'AB ⊥ AC', other: 'AC = BC' },
  { lines: ['מרובע ABCD', 'AB = AD', 'AB ⊥ BD'], said: 'AB ⊥ BD', other: 'AB = AD' },
  { lines: ['מחומש ABCDE', 'AB = BC', 'AC ⊥ BC'], said: 'AC ⊥ BC', other: 'AB = BC' },
  { lines: ['מרובע ABCD', 'AB = AC', '∠ABC = 90'], said: '∠ABC = 90', other: 'AB = AC' },
  { lines: ['מרובע ABCD', 'AB = BC', '∠ACB = 90'], said: '∠ACB = 90', other: 'AB = BC' },
  { lines: ['מרובע ABCD', '∠ACB = 90', 'AB = BC'], said: 'AB = BC', other: '∠ACB = 90' },
  { lines: ['מרובע ABCD', 'AB = AC', 'AB ⊥ BC'], said: 'AB ⊥ BC', other: 'AB = AC' },
  { lines: ['נקודה A', 'נקודה B', 'נקודה C', 'AB = BC', 'AC ⊥ BC'], said: 'AC ⊥ BC', other: 'AB = BC' },
  { lines: ['קטע AB', 'קטע BC', 'AB = BC', 'AC ⊥ BC'], said: 'AC ⊥ BC', other: 'AB = BC' },
  // reaches the ladder past the prover (a ratio is no equal pair the prover reads): arm A alone answers
  { lines: ['מרובע ABCD', 'AB:BC = 1:1', 'AC ⊥ BC'], said: 'AC ⊥ BC', other: 'AB:BC = 1:1' },
];

/** Controls: real figures that must keep building green (`skip`: seeds already refused before this change, filed). */
const CONTROLS: { lines: string[]; skip?: number[] }[] = [
  { lines: ['מרובע ABCD', 'AB = BC', 'AB ⊥ BC'] },
  { lines: ['מרובע ABCD', 'AB = 2', 'BC = 1', 'AC ⊥ BC'] },
  { lines: ['מרובע ABCD', 'AB = 10', 'BC = 9.99', 'AC ⊥ BC'] },
  // a real thin triangle inside the band: the pair trigger fires and the exact re-solve keeps it. Seed 2 is refused with
  // a straight corner at D at 045a8546 too, before this change: #2544
  { lines: ['מרובע ABCD', 'AB = 10', 'BC = 9.9999', 'AC ⊥ BC'], skip: [2] },
  { lines: ['מרובע ABCD', 'AB = BC', '∠ACB = 60'] },
  { lines: ['ריבוע ABCD', 'AC = 5'] },
];
/** FR-EN-20's forced coincidences: drawn, with the notice — never refused by the pair trigger. */
const COINCIDENCES: string[][] = [
  ['משולש ABC', 'D על BC', 'BD = BC'],
  ['משולש ABC', 'D על BC', 'שטח ABD = שטח ABC'],
  ['ריבוע ABCD', 'E על AB', 'DE = DA'],
];

describe('#2443 B — the no-room prover reads base angles over any three points', () => {
  it.each([
    [['מרובע ABCD', 'AB = BC'], 'AC ⊥ BC'],
    [['מרובע ABCD', 'AB = BC'], '∠ACB = 90'],
    [['מרובע ABCD', 'AB = AC'], 'AB ⊥ BC'],
    [['מרובע ABCD', 'AB = 5', 'BC = 5'], 'AC ⊥ BC'],
    [['נקודה A', 'נקודה B', 'נקודה C', 'AB = BC'], 'AC ⊥ BC'],
  ])('%j · «%s» is an undeclared limit-collapse', (prefix, line) => {
    const v = proverOn(prefix, line);
    expect(v?.kind).toBe('limit-collapse');
    expect(v?.undeclared).toBe(true);
    expect(v?.inferred?.[0]?.value).toBe(90);
  });

  it.each([
    [['מרובע ABCD', 'AB = BC'], '∠ACB = 89', 'a base angle below 90° leaves the apex room'],
    [['מרובע ABCD', 'AB = BC'], '∠ACB = 60', 'an ordinary base angle'],
    [['מרובע ABCD', 'AB = BC'], 'AB ⊥ BC', 'the right angle at the APEX'],
    [['מרובע ABCD', 'AB = 10', 'BC = 9.99'], 'AC ⊥ BC', 'unequal stated lengths are no pair'],
  ])('%j · «%s» proves nothing (%s)', (prefix, line) => {
    expect(proverOn(prefix, line)).toBeNull();
  });

  it('a DECLARED triangle keeps ADR-746\'s reading (not undeclared)', () => {
    const v = proverOn(['מרובע ABCD', 'משולש ABC', 'AB = BC'], 'AC ⊥ BC');
    expect(v?.kind).toBe('limit-collapse');
    expect(v?.undeclared).toBeUndefined();
    expect(v?.polygon).toEqual(['A', 'B', 'C']);
  });
});

describe('#2443 — every member is refused at its last line with the over-constraint, the prior figure kept', () => {
  it.each(MEMBERS)('$lines', async ({ lines, said, other, locale }) => {
    for (const seed of SEEDS8) {
      const { verdicts, fig } = await drive(lines, seed, locale);
      for (const v of verdicts.slice(0, -1)) expect(v.kind, `seed ${seed}: the prefix commits`).toBe('commit');
      const last = verdicts[verdicts.length - 1]!;
      expect(last.kind, `seed ${seed}`).toBe('refuse');
      const explain = explainOf(last);
      expect(explain, `seed ${seed}: the statement's over-constraint`).toMatch(OVER_CONSTRAINED_VS);
      expect(explain, `seed ${seed}: never a flat polygon (D is not on the line)`).not.toMatch(COLLAPSED_VS);
      const t = locale === 'en' ? en : he;
      const text = humanizeError(explain, t, said, otherUtteranceForError(st().facts, explain)).replace(/[⁦-⁩]/g, '');
      expect(text, `seed ${seed}: names the statement`).toContain(`«${said}»`);
      if (other) expect(text, `seed ${seed}: names the statement it contradicts`).toContain(`«${other}»`);
      expect(fig.pending, `seed ${seed}: never «waiting for more givens»`).toBe(false);
      expect(fig.lastError, `seed ${seed}`).toBeNull();
      expect(closestPair(fig), `seed ${seed}: the kept figure has no two points on one spot`).toBeGreaterThan(0.01);
    }
  });

  it('the report, at 24 seeds, in Hebrew: FR-EN-8\'s contradiction sentence', async () => {
    for (const seed of SEEDS24) {
      const { verdicts } = await drive(['מרובע ABCD', 'AB = BC', 'AC ⊥ BC'], seed);
      const explain = explainOf(verdicts[2]!);
      expect(explain, `seed ${seed}`).toBe('over-constrained: AC ⟂ BC cannot hold [vs #1]');
      const text = humanizeError(explain, he, 'AC ⊥ BC', otherUtteranceForError(st().facts, explain)).replace(/[⁦-⁩]/g, '');
      expect(text).toContain('«AC ⊥ BC» סותר את «AB = BC»');
    }
  });

  it('arm A (the ladder, past the prover): the ratio spelling is refused at 24 seeds', async () => {
    for (const seed of SEEDS24) {
      const { verdicts } = await drive(['מרובע ABCD', 'AB:BC = 1:1', 'AC ⊥ BC'], seed);
      expect(explainOf(verdicts[2]!), `seed ${seed}`).toMatch(/^over-constrained: AC ⟂ BC cannot hold/);
    }
  });

  it('arm A′: the numeric twin names «AC ⊥ BC», never a straight corner at D', async () => {
    for (const seed of SEEDS8) {
      const { verdicts } = await drive(['מרובע ABCD', 'AB = 5', 'BC = 5', 'AC ⊥ BC'], seed);
      const explain = explainOf(verdicts[3]!);
      expect(explain, `seed ${seed}`).toMatch(/^over-constrained: AC ⟂ BC cannot hold/);
      expect(explain).not.toMatch(/A, B, C, D/);
    }
  });

  it('the triangle twins keep ADR-602\'s flat-triangle refusal', async () => {
    for (const lines of [['משולש ABC', 'AB = BC', 'AC ⊥ BC'], ['מרובע ABCD', 'משולש ABC', 'AB = BC', 'AC ⊥ BC']]) {
      const { verdicts } = await drive(lines, 0);
      expect(explainOf(verdicts[verdicts.length - 1]!), JSON.stringify(lines)).toMatch(/^collapsed: polygon A, B, C would be flat/);
    }
  });
});

describe('#2443 — the controls keep building green at 24 seeds', () => {
  it.each(CONTROLS)('$lines', async ({ lines, skip }) => {
    for (const seed of SEEDS24.filter((s) => !skip?.includes(s))) {
      const { verdicts, fig } = await drive(lines, seed);
      for (const v of verdicts) expect(v.kind, `seed ${seed}: ${JSON.stringify(v).slice(0, 300)}`).toBe('commit');
      expect(fig.lastError, `seed ${seed}`).toBeNull();
      expect(fig.pending, `seed ${seed}`).toBe(false);
    }
  });

  it.each(COINCIDENCES)('FR-EN-20: %j is still drawn', async (...lines) => {
    for (const seed of SEEDS24) {
      const { verdicts, fig } = await drive(lines, seed);
      for (const v of verdicts) expect(v.kind, `seed ${seed}: ${JSON.stringify(v).slice(0, 300)}`).toBe('commit');
      expect(fig.lastError, `seed ${seed}`).toBeNull();
    }
  });
});
