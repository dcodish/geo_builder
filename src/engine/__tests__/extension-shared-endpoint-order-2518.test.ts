/**
 * #2518 ([ADR-780](../../../docs/06-decisions.md#adr-780), [ADR-784](../../../docs/06-decisions.md#adr-784), operator
 * rulings 2026-11-04) — «המשך AO חותך את מעגל P בנקודה R» with A on circle P draws R past O when the figure allows it;
 * otherwise the line is refused and offers the reversed sentence. ADR-142's either-side tier is withdrawn.
 *
 * Measured at pickup (`main` ebacadd1, `driveThroughGate`, `meetsRequirements` seeds 0–7): the report was strict
 * 00000000 (relaxed 01101111; `findValidConfig` showed seed 1 with R past A), «המשך OA» with a free O strict 00000000.
 * Every row green. The shared-endpoint branch of `extend-onto-circle` built the second crossing and nothing ever put
 * the other end where that crossing lies beyond the second letter.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));

import { driveThroughGate } from '@/__tests__/submit-gate';
import { findValidConfig, meetsRequirements, replay, searchAnotherView, trialFacts, useGeoStore, type Fact } from '@/store/geoStore';
import { extensionSideConfig, impossibleExtensionSide } from '@/replay/core';
import { work } from '@/engine/solveBudget';
import { parse } from '@/parser';
import { extensionSideVerdict } from '@/app/extensionSide';
import { ctxOf } from '@/__tests__/scenario-pipeline';
import type { AnyCommand, Vec } from '@/engine';

type Side = 'past-second' | 'past-first' | 'between';
/** Where R lies on the line through the extension's two letters `a`, `b` (R beyond b, beyond a, or between them). */
function sideOf(pos: Map<string, Vec>, a: string, b: string): Side {
  const A = pos.get(a)!;
  const B = pos.get(b)!;
  const R = pos.get('R')!;
  const t = ((R.x - A.x) * (B.x - A.x) + (R.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
  return t > 1 ? 'past-second' : t < 0 ? 'past-first' : 'between';
}
const onCircle = (pos: Map<string, Vec>, f: ReturnType<typeof replay>, id: string, circle: string) => {
  const c = f.circles.get(circle)!;
  return Math.abs(Math.hypot(pos.get(id)!.x - c.center.x, pos.get(id)!.y - c.center.y) - c.r);
};

/** The configuration the app shows (the post-commit search) and the next `presses` «הציגו תצורה אחרת». */
function shownViews(facts: Fact[], presses = 4) {
  let cur = findValidConfig(facts, 0, Number.POSITIVE_INFINITY) ?? { facts, seed: 0 };
  const out = [cur];
  for (let k = 0; k < presses; k++) {
    const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
    if (!next) break;
    cur = next;
    out.push(cur);
  }
  return out;
}

const REPORT = ['מעגל שמרכזו O', 'מעגל שמרכזו P', 'נקודה A על מעגל P', 'המשך AO חותך את מעגל P בנקודה R'];

describe('#2518 — the stated side holds wherever the figure allows it', () => {
  const ROWS: [string, string[], string, string][] = [
    ['the report (A on the circle, R past O)', REPORT, 'A', 'O'],
    ['the shared end second («המשך OA», O a circle centre)', ['מעגל שמרכזו O', 'מעגל שמרכזו P', 'נקודה A על מעגל P', 'המשך OA חותך את מעגל P בנקודה R'], 'O', 'A'],
    ['the shared end second («המשך OA», O a free point)', ['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O', 'המשך OA חותך את מעגל P בנקודה R'], 'O', 'A'],
    ['the shared end first, a free O', ['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O', 'המשך AO חותך את מעגל P בנקודה R'], 'A', 'O'],
  ];
  for (const [name, lines, a, b] of ROWS) {
    it(`${name}: every row green, R beyond ${b} at the shown configuration and at each one «הציגו תצורה אחרת» reaches`, () => {
      const { facts, refused } = driveThroughGate(lines);
      expect(refused).toEqual([]);
      const views = shownViews(facts);
      expect(views.length).toBeGreaterThan(1);
      for (const v of views) {
        const f = replay(v.facts, v.seed);
        expect(Object.values(f.status).every((s) => s === 'ok')).toBe(true);
        expect(meetsRequirements(v.facts, v.seed), `seed ${v.seed} meets the strict bar`).toBe(true);
        expect(sideOf(f.positions, a, b), `seed ${v.seed}`).toBe('past-second');
        expect(onCircle(f.positions, f, 'R', 'circle-P')).toBeLessThan(1e-6);
      }
    });
  }

  it('the report at the default figure: R beyond O, and only O moves (A, P and circle P stay where they were)', () => {
    const before = replay(driveThroughGate(REPORT.slice(0, 3)).facts, 0);
    const after = replay(driveThroughGate(REPORT).facts, 0);
    expect(sideOf(after.positions, 'A', 'O')).toBe('past-second');
    for (const id of ['A', 'P']) {
      expect(after.positions.get(id)!.x).toBeCloseTo(before.positions.get(id)!.x, 9);
      expect(after.positions.get(id)!.y).toBeCloseTo(before.positions.get(id)!.y, 9);
    }
    expect(after.circles.get('circle-P')!.r).toBeCloseTo(before.circles.get('circle-P')!.r, 9);
  });

  it('stability: when the side already holds nothing moves', () => {
    const lines = ['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O', 'המשך AO חותך את מעגל P בנקודה R'];
    const before = replay(driveThroughGate(lines.slice(0, 3)).facts, 0);
    const after = replay(driveThroughGate(lines).facts, 0);
    expect(sideOf(after.positions, 'A', 'O')).toBe('past-second');
    for (const id of ['A', 'O', 'P']) {
      expect(after.positions.get(id)!.x).toBeCloseTo(before.positions.get(id)!.x, 9);
      expect(after.positions.get(id)!.y).toBeCloseTo(before.positions.get(id)!.y, 9);
    }
  });
});

const PINNED = ['מעגל שמרכזו P ברדיוס 3', 'נקודה A על מעגל P', 'נקודה O', 'OP = 10'];
const Q4_142 = ['שני מעגלים נחתכים בנקודות A ו B', 'המשיק למעגל O בנקודה A חותך את מעגל P בנקודה D', 'המשיק למעגל P בנקודה B חותך את מעגל O בנקודה C'];
const Q4_267 = ['שני מעגלים נחתכים בנקודות A ו-B', 'AD מיתר במעגל P משיק למעגל O בנקודה A', 'CB מיתר במעגל O משיק למעגל P בנקודה B'];

/** The refusal of the last line of `lines`: the note's key and the offered sentence. */
function refusalOf(lines: string[]) {
  const { refused } = driveThroughGate(lines);
  expect(refused.map((r) => r.utterance)).toEqual([lines[lines.length - 1]]);
  const v = refused[0].verdict;
  if (v.kind !== 'refused' || v.reason !== 'extension-side') throw new Error(`not the side refusal: ${JSON.stringify(v)}`);
  return { key: v.detail, step: v.step };
}

describe('#2518 (ADR-784, rulings 2026-11-04) — a stated side no figure has is refused, offering the right sentence', () => {
  const ROWS: [string, string[], string, string][] = [
    ['O pinned outside the circle', PINNED, 'המשך AO חותך את מעגל P בנקודה R', 'המשך OA חותך את מעגל P בנקודה R'],
    ['bagrut Q4 reversed (ADR-142)', Q4_142, 'נקודה F נמצאת על המשך הצלע BD וחותכת את מעגל O בנקודה F', 'נקודה F נמצאת על המשך הצלע DB וחותכת את מעגל O בנקודה F'],
    ['booklet-571 p.78 Q4 reversed (ADR-267)', Q4_267, 'המשך AC חותך את מעגל P בנקודה E', 'המשך CA חותך את מעגל P בנקודה E'],
  ];
  for (const [name, prior, line, book] of ROWS) {
    it(`${name}: refused, nothing commits, and the offered sentence is the reversed one`, () => {
      const r = refusalOf([...prior, line]);
      expect(r).toEqual({ key: 'input.extensionSideImpossible', step: book });
      expect(useGeoStore.getState().facts.some((f) => f.utterance === line)).toBe(false);
    });

    it(`${name}: the offered sentence, typed, builds green on the stated side (a taught remedy is a grammar claim)`, () => {
      const { facts, refused } = driveThroughGate([...prior, book]);
      expect(refused).toEqual([]);
      const f = replay(facts, 0);
      expect(Object.values(f.status).every((st) => st === 'ok')).toBe(true);
      expect(findValidConfig(facts, 0, Number.POSITIVE_INFINITY)).not.toBeNull();
    });
  }

  it('the point lies between the two letters, so neither extension reaches it: refused with no offer', () => {
    const lines = ['מעגל שמרכזו P ברדיוס 3', 'נקודה A על מעגל P', 'נקודה O', 'OP = 5', 'OA = 7', 'המשך OA חותך את מעגל P בנקודה R'];
    expect(refusalOf(lines)).toEqual({ key: 'input.extensionSideImpossibleNoStep', step: undefined });
    const other = [...lines.slice(0, -1), 'המשך AO חותך את מעגל P בנקודה R'];
    expect(refusalOf(other)).toEqual({ key: 'input.extensionSideImpossibleNoStep', step: undefined });
  });

  it('the LLM lane: the offer is built from the canonical line, and the refusal quotes what the student typed', () => {
    const { facts } = driveThroughGate(PINNED);
    const cmd: AnyCommand = { type: 'extend-onto-circle', id: 'R', a: 'A', b: 'O', circle: 'circle-P' };
    const typed = 'המשך AO חותר את מעגל P בנקודה R';
    const v = extensionSideVerdict(typed, 'המשך AO חותך את מעגל P בנקודה R', [cmd], ctxOf(facts), facts, 0);
    expect(v?.messageKey).toBe('input.extensionSideImpossible');
    expect(v?.params).toEqual({ detail: typed, id: 'R', second: 'O', step: 'המשך OA חותך את מעגל P בנקודה R' });
  });

  it('English reads the same', () => {
    const r = refusalOf([...PINNED, 'the extension of AO meets circle P at R']);
    expect(r).toEqual({ key: 'input.extensionSideImpossible', step: 'the extension of OA meets circle P at R' });
  });

  it('a line that states no extension pays nothing, and an extension built another way is the ladder\'s (the gate does not read it)', () => {
    const { facts } = driveThroughGate(PINNED);
    expect(impossibleExtensionSide(facts, [{ type: 'segment', id: 'seg-AO', a: 'A', b: 'O' } as AnyCommand], 0)).toBeNull();
    const { facts: bare } = driveThroughGate(['מעגל שמרכזו P', 'קטע AO']);
    expect(impossibleExtensionSide(bare, [{ type: 'extend-onto-circle', id: 'R', a: 'A', b: 'O', circle: 'circle-P' }], 0)).toBeNull();
  });
});

describe('#2518 (ADR-784, judge ruling, option B) — a later line that makes a standing extension impossible is refused', () => {
  const STANDING = ['מעגל שמרכזו P ברדיוס 3', 'נקודה A על מעגל P', 'נקודה O', 'המשך AO חותך את מעגל P בנקודה R'];
  const expectBroken = (lines: string[]) => {
    const { facts, refused } = driveThroughGate(lines);
    expect(refused.map((r) => r.utterance)).toEqual([lines[lines.length - 1]]);
    expect(refused[0].verdict).toMatchObject({ kind: 'refused', reason: 'extension-side', detail: 'input.extensionSideBroken' });
    expect(facts.some((f) => f.utterance === lines[lines.length - 1]), 'nothing committed').toBe(false);
  };

  it('a pinned circle: «OP = 10» after the extension', () => expectBroken([...STANDING, 'OP = 10']));

  it('a free radius, where a larger circle would have worked, is refused too (the report, then «OP = 10»)', () => expectBroken([...REPORT, 'OP = 10']));

  it('the refusal names the extension line and the statement that broke it', () => {
    const { facts } = driveThroughGate(STANDING);
    const c = parse('OP = 10', ctxOf(facts));
    if (!c.ok) throw new Error('parse');
    const v = extensionSideVerdict('OP = 10', 'OP = 10', c.commands, ctxOf(facts), facts, 0);
    expect(v?.messageKey).toBe('input.extensionSideBroken');
    expect(v?.params).toEqual({ detail: 'OP = 10', extension: STANDING[3], id: 'R', second: 'O' });
  });

  it('a line that leaves the side possible commits', () => {
    const { refused } = driveThroughGate([...STANDING, 'AO = 2']);
    expect(refused).toEqual([]);
  });

  it('a figure already off its side (a saved one) never blames a new line', () => {
    const { facts } = driveThroughGate(PINNED);
    const saved = trialFacts(facts, [{ type: 'extend-onto-circle', id: 'R', a: 'A', b: 'O', circle: 'circle-P' }]);
    const line = parse('AO = 12', ctxOf(saved));
    if (!line.ok) throw new Error('parse');
    expect(impossibleExtensionSide(saved, line.commands, 0)).toBeNull();
  });

  it('a figure with no extension pays nothing: not one read of a fact beyond its command', () => {
    const { facts } = driveThroughGate(['ריבוע ABCD', 'נקודה G על AD']);
    let reads = 0;
    const watched = facts.map((f) => new Proxy(f, { get: (t, k) => { if (k !== 'cmd' && k !== 'enabled') reads++; return Reflect.get(t, k); } }));
    expect(impossibleExtensionSide(watched, [{ type: 'segment', id: 'seg-AB', a: 'A', b: 'B' } as AnyCommand], 0)).toBeNull();
    expect(reads, 'no replay, no trial, no pool').toBe(0);
  });

  it('a line on the side at the drawn seed spends only the trial replay; the work cap bounds the rest, the same on every run', () => {
    const { facts } = driveThroughGate(REPORT);
    const c = parse('נקודה M על AR', ctxOf(facts));
    if (!c.ok) throw new Error('parse');
    const w0 = work.done;
    expect(impossibleExtensionSide(facts, c.commands, 0)).toBeNull();
    expect(work.done - w0).toBeLessThan(1000);
    expect(extensionSideConfig.cap).toBeLessThanOrEqual(150_000);
  });
});

describe('#2518 — a saved figure keeps loading', () => {
  it('a figure saved with the reversed letters replays its drawing, every row built, flagged amber by the verifier', () => {
    const { facts } = driveThroughGate(PINNED);
    const saved = trialFacts(facts, [{ type: 'extend-onto-circle', id: 'R', a: 'A', b: 'O', circle: 'circle-P' }]);
    const f = replay(saved, 0);
    expect(Object.values(f.status).every((st) => st === 'ok')).toBe(true);
    expect(f.positions.has('R')).toBe(true);
    expect(sideOf(f.positions, 'A', 'O')).toBe('past-first');
    expect(f.violations.map((v) => v.messageKey)).toEqual(['figure.v.orderBeyondOther']);
    expect(meetsRequirements(saved, 0)).toBe(false);
  });
});
