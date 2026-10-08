/**
 * #1922 ([ADR-605](../../../docs/06-decisions.md#adr-605), amending ADR-542) — A GIVEN TRUE ONLY BY THE TOOL'S
 * DEFAULT IS RECORDED, NEVER «כבר קיים».
 *
 * «טרפז ABCD» · «AB ∥ DC» · «AD ∥ BC»: the second line answered «זה כבר קיים באיור» and was not recorded, so
 * the third re-seated the trapezoid onto AD ∥ BC (ADR-506) and AB ∦ DC was drawn green. Root cause: the
 * restatement check (`impliedByPrior`) judged entailment over a sample pool that never varies the tool's
 * own unstated choices — ADR-502's parallel pair never, and the registry's branch/side/seat axes only on a
 * determined figure — so "true by the default of an unstated choice" (ADR-052) read as "entailed". The check
 * now also asks the residual question at the other answer of every choice the pool did not vary
 * (`choiceAlternatives`).
 *
 * Runs the REAL parser, replay, decision, commit and the App's post-commit view search (`runViewResolve` →
 * `geoWork.autoResolve`, whose no-Worker fallback is the worker's own `findValidConfig`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: () => { throw new Error('no live LLM call in this test'); } }));

import { factsOf } from '@/__tests__/scenario-pipeline';
import { choiceAlternatives, impliedByPrior, replay as replayCore, sharedSamples, type Fact } from '@/replay/core';
import { buildParseCtx, parse } from '@/parser';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { runViewResolve } from '@/app/resolveView';
import { runEditCommit, type EditDeps } from '@/app/editPipeline';
import { geoWork, isCancelled } from '@/store/geoWork';
import { groupKey, meetsRequirements, replay, useGeoStore } from '@/store/geoStore';
import { unstatedChoices } from '@/engine';
import { humanizeError } from '@/i18n/humanizeError';
import i18n from '@/i18n';

const he = (k: string, o?: Record<string, unknown>) => String(i18n.t(k, { lng: 'he', ...(o ?? {}) }));
const strip = (s: string) => s.replace(/[⁦-⁩]/g, '');
const st = () => useGeoStore.getState();

const commandsOf = (facts: Fact[], line: string) => {
  const view = replayCore(facts, 0);
  const r = parse(line, buildParseCtx(view.construction, view.positions));
  if (!r.ok) throw new Error(`«${line}» did not parse`);
  return r.commands;
};
const implied = (pre: string[], line: string) => {
  const facts = factsOf(pre as never);
  return impliedByPrior(facts, commandsOf(facts, line), 0);
};

/** Type each line as the App does: decide, commit, then the post-commit view search. */
async function play(lines: string[]) {
  st().clear();
  const verdicts: { line: string; kind: string; note?: { key?: string; explain?: string } }[] = [];
  let exhausted = false;
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, 'he')) as never as {
      kind: string;
      note?: { key?: string; explain?: string };
    };
    verdicts.push({ line, kind: v.kind, note: v.note });
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
    if (v.kind === 'commit') {
      exhausted = false;
      await runViewResolve({
        getState: () => st(),
        meetsRequirements,
        autoResolve: (facts, seed) => geoWork.autoResolve(facts, seed),
        applyView: (found) => {
          const t = useGeoStore.temporal.getState();
          t.pause();
          try {
            st().applyView({ facts: found.facts, seed: found.seed });
          } finally {
            t.resume();
          }
        },
        setPending: () => {},
        onExhausted: () => {
          exhausted = true;
        },
        isCancelled,
      });
    }
  }
  const fig = replay(st().facts, st().seed);
  return { verdicts, exhausted, fig, utterances: st().facts.map((f) => f.utterance) };
}

const sinBetween = (fig: ReturnType<typeof replay>, a: string, b: string, c: string, d: string) => {
  const P = (id: string) => fig.positions.get(id)!;
  const ux = P(b).x - P(a).x, uy = P(b).y - P(a).y, vx = P(d).x - P(c).x, vy = P(d).y - P(c).y;
  return Math.abs(ux * vy - uy * vx) / Math.hypot(ux, uy) / Math.hypot(vx, vy);
};
const angleAt = (fig: ReturnType<typeof replay>, v: string, p: string, q: string) => {
  const P = (id: string) => fig.positions.get(id)!;
  const a = [P(p).x - P(v).x, P(p).y - P(v).y], b = [P(q).x - P(v).x, P(q).y - P(v).y];
  return (Math.acos((a[0] * b[0] + a[1] * b[1]) / Math.hypot(a[0], a[1]) / Math.hypot(b[0], b[1])) * 180) / Math.PI;
};

beforeEach(() => st().clear());

describe('#1922 — the restatement check ranges over the tool\'s unstated choices', () => {
  it.each([
    [['טרפז ABCD'], 'AB ∥ DC'],
    [['טרפז ABCD'], 'AB מקביל ל-DC'],
    [['טרפז ABCD'], 'DC ∥ AB'],
    [['טרפז שווה שוקיים ABCD'], 'AB ∥ DC'],
    [['טרפז ישר זווית ABCD'], 'AB ∥ DC'],
    [['טרפז ABCD'], '∠A + ∠D = 180'],
    [['טרפז ישר זווית ABCD'], 'AD ⊥ DC'],
    [['משולש ישר זווית ABC'], 'AC ⊥ BC'],
    [['משולש ישר זווית ABC'], 'BC ⊥ AC'],
    [['משולש ישר זווית ABC'], 'AC מאונך ל-BC'],
    [['משולש ישר זווית ABC'], '∠A + ∠B = 90'],
  ])('«%s» · «%s» — true only by the tool\'s default: NOT implied', (pre, line) => {
    expect(implied(pre, line)).toBe(false);
  });

  it.each([
    [['ריבוע ABCD'], 'AB ∥ DC'],
    [['משולש ABC', '∠ABC = 90'], 'AB ⊥ BC'],
    [['משולש ישר זווית ABC', '∠ACB = 90'], 'AC ⊥ BC'],
    [['טרפז ABCD'], '∠A + ∠B + ∠C + ∠D = 360'],
  ])('«%s» · «%s» — forced by the givens: still implied', (pre, line) => {
    expect(implied(pre, line)).toBe(true);
  });

  it('the alternatives: the other parallel pair on a trapezoid, the seat axis on an undetermined right triangle', () => {
    const trap = factsOf(['טרפז ABCD'] as never);
    const alts = choiceAlternatives(trap, replayCore(trap, 0).construction, sharedSamples(trap));
    expect(alts?.some((fc) => fc.some((f) => f.cmd.type === 'set-parallel' && f.cmd.a === 'B' && f.cmd.b === 'C' && f.cmd.c === 'D' && f.cmd.d === 'A'))).toBe(true);
    const rt = factsOf(['משולש ישר זווית ABC'] as never);
    const rtAlts = choiceAlternatives(rt, replayCore(rt, 0).construction, { determined: false }) ?? [];
    expect(rtAlts.length, 'the two other right-angle seats').toBe(2);
    // a stated pair leaves no parallel-pair choice to vary
    const pinned = factsOf(['טרפז ABCD', 'AB ∥ DC'] as never);
    expect(unstatedChoices(pinned)).toEqual([]);
  });
});

describe('#1922 — what the student sees (decide → commit → post-commit view search)', () => {
  const morph = he('figure.v.trapezoidMorph', { quad: 'ABCD' });
  it('the exact Hebrew of the banner and the note', () => {
    expect(strip(morph)).toBe('ABCD הוגדר כטרפז, אך כעת שני זוגות הצלעות הנגדיות מקבילים — זה כבר לא טרפז. כדי לשנות את הצורה, ערכו או מחקו את שלב הטרפז.');
    expect(he('figure.noValidConfig')).toBe('לא נמצאה תצורה שמקיימת את כל הדרישות יחד — הציור המוצג עשוי להיות מנוון (למשל נקודות שמתלכדות). בדקו את הנתון האחרון שהוזן.');
  });

  it.each([
    [['טרפז ABCD', 'AB ∥ DC', 'AD ∥ BC']],
    [['טרפז ABCD', 'AD ∥ BC', 'AB ∥ DC']],
    [['טרפז ABCD', 'AB מקביל ל-DC', 'AD מקביל ל-BC']],
    [['טרפז ABCD', 'DC ∥ AB', 'BC ∥ AD']],
    [['טרפז שווה שוקיים ABCD', 'AB ∥ DC', 'AD ∥ BC']],
    [['טרפז ישר זווית ABCD', 'AB ∥ DC', 'AD ∥ BC']],
    [['טרפז ABCD', '∠A + ∠D = 180', 'AD ∥ BC']],
    [['טרפז ישר זווית ABCD', 'AD ⊥ DC', 'AD ∥ BC']],
  ])('«%s»: every line is recorded; the end figure carries the amber morph and the no-valid-config note', async (lines) => {
    const r = await play(lines);
    expect(r.verdicts.map((v) => v.kind)).toEqual(['commit', 'commit', 'commit']);
    expect(new Set(r.utterances)).toEqual(new Set(lines));
    expect(r.fig.violations.map((v) => v.messageKey)).toEqual(['figure.v.trapezoidMorph']);
    expect(r.exhausted, 'figure.noValidConfig is shown').toBe(true);
    // the restated given is never drawn false
    expect(sinBetween(r.fig, 'A', 'B', 'D', 'C')).toBeLessThan(1e-6);
  });

  it('«טרפז ABCD» · «AB ∥ DC»: the step-row note «הכלי הניח ש-AB ∥ DC…» goes once the pair is stated', async () => {
    await play(['טרפז ABCD']);
    expect(unstatedChoices(st().facts)).toHaveLength(1);
    const r = await play(['טרפז ABCD', 'AB ∥ DC']);
    expect(r.verdicts[1].kind).toBe('commit');
    expect(unstatedChoices(st().facts)).toHaveLength(0);
    expect(r.fig.violations).toEqual([]);
  });

  it.each([['AC ⊥ BC'], ['BC ⊥ AC'], ['AC מאונך ל-BC'], ['∠A + ∠B = 90'], ['∠ACB = 90']])(
    '«משולש ישר זווית ABC» · «%s» · «AB = 3» · «BC = 5»: recorded, and «BC = 5» is refused as the hypotenuse',
    async (line) => {
      const r = await play(['משולש ישר זווית ABC', line, 'AB = 3', 'BC = 5']);
      expect(r.verdicts.map((v) => v.kind)).toEqual(['commit', 'commit', 'commit', 'refuse']);
      const said = strip(humanizeError(r.verdicts[3].note?.explain ?? '', he as never, 'BC = 5'));
      expect(said).toContain('לא ייתכן: מול הזווית הישרה ב-C נמצא היתר AB, הצלע הארוכה ביותר במשולש — אבל |AB| = 3 בעוד |BC| = 5. בדקו את הנתונים.');
      expect(angleAt(r.fig, 'C', 'A', 'B')).toBeCloseTo(90, 6);
    },
  );

  it.each([
    [['ריבוע ABCD', 'AB ∥ DC']],
    [['משולש ABC', '∠ABC = 90', 'AB ⊥ BC']],
    [['משולש ישר זווית ABC', '∠ACB = 90', 'AC ⊥ BC']],
    [['טרפז ABCD', '∠A + ∠B + ∠C + ∠D = 360']],
    [['טרפז ישר זווית ABCD', 'AD ⊥ AB']],
  ])('«%s»: a restatement the givens force still answers «כבר קיים»', async (lines) => {
    const r = await play(lines);
    const last = r.verdicts[r.verdicts.length - 1];
    expect(last.kind).toBe('noop');
    expect(last.note?.key).toBe('input.alreadyDrawn');
    expect(he('input.alreadyDrawn')).toBe('זה כבר קיים באיור — אין מה להוסיף.');
  });
});

describe('#1922 — stability and the ✎ edit seam', () => {
  it.each([
    ['טרפז ABCD', 'AB ∥ DC'],
    ['טרפז שווה שוקיים ABCD', 'AB ∥ DC'],
    ['טרפז ישר זווית ABCD', 'AB ∥ DC'],
    ['משולש ישר זווית ABC', 'AC ⊥ BC'],
    ['טרפז ABCD', '∠A + ∠D = 180'],
    // NOT «טרפז ישר זווית ABCD» · «AD ⊥ DC»: recording it re-seats D and C (0.26 at seed 0), exactly as its other
    // spelling «∠ADC = 90» already does at main (5edeeca1) — a solver re-seat of a constraint that holds at the drawn
    // figure, reported as found work on #1922, not this fix's mechanism.
  ])('recording «%s» · «%s» moves no point', async (first, line) => {
    await play([first]);
    const before = replay(st().facts, st().seed);
    const r = await play([first, line]);
    expect(r.verdicts[1].kind, 'the line is recorded').toBe('commit');
    const after = replay(st().facts, st().seed);
    let max = 0;
    for (const [id, p] of before.positions) {
      const q = after.positions.get(id);
      if (q) max = Math.max(max, Math.hypot(p.x - q.x, p.y - q.y));
    }
    expect(max).toBeLessThan(1e-9);
    expect(Object.values(after.status).every((s) => s === 'ok')).toBe(true);
  });

  it('editing a row into «AB ∥ DC» on «טרפז ABCD» commits', () => {
    const submit = (line: string) => {
      const view = replay(st().facts, st().seed);
      const r = parse(line, buildParseCtx(view.construction, view.positions));
      if (!r.ok) throw new Error(line);
      st().executeMany(r.commands, line);
      return groupKey(st().facts[st().facts.length - 1]);
    };
    submit('טרפז ABCD');
    const key = submit('AB = 5');
    const notes: string[] = [];
    const deps: EditDeps = { t: (k) => k, setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} };
    expect(runEditCommit(key, 'AB ∥ DC', deps)).toBe(true);
    expect(notes).not.toContain('input.alreadyDrawn');
    expect(st().facts.some((f) => f.cmd.type === 'set-parallel')).toBe(true);
  });
});
