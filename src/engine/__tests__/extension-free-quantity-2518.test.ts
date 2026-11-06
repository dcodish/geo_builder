/**
 * #2518 ([ADR-791](../../../docs/06-decisions.md#adr-791), operator ruling 2026-11-06: *"its not right to refuse. this shape
 * is possible"*) — a stated «המשך» side a free quantity can hold is held; refusal stays for a figure nothing the student
 * wrote can save.
 *
 * Measured at `main` 10331c78 through `driveThroughGate`: every BUILDS row below was refused, either as a typed extension
 * (offering to reverse a sentence that was right) or as a later line. The samples vary a free radius near its seed, so they
 * never reach a radius larger than a stated distance.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));

import { driveThroughGate } from '@/__tests__/submit-gate';
import { ctxOf } from '@/__tests__/scenario-pipeline';
import { findValidConfig, replay, searchAnotherView, type Fact } from '@/store/geoStore';
import { applyCoupledStep, type Command } from '@/engine';
import { crossingPastSecond, reseatExtensions, MAX_TRIES } from '@/engine/extensionSide';
import { parse } from '@/parser';

const AO = 'המשך AO חותך את מעגל P בנקודה R';
const OA = 'המשך OA חותך את מעגל P בנקודה R';
const REPORT = ['מעגל שמרכזו O', 'מעגל שמרכזו P', 'נקודה A על מעגל P'];
const FREE = ['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O'];
const PIN = ['מעגל שמרכזו P ברדיוס 3', 'נקודה A על מעגל P', 'נקודה O'];
const RIDER = ['נקודה A על מעגל P', 'משולש CDE', 'נקודה O על CD'];
const TANGENT = ['מעגל שמרכזו P', 'מעגל שמרכזו Q', 'המעגלים משיקים', 'נקודה A על מעגל P', 'נקודה C', 'נקודה O'];

/** R past the second letter at the shown configuration, with every row green. */
function drawn(lines: string[], a: string, b: string, shared: string) {
  const { facts, refused } = driveThroughGate(lines);
  expect(refused).toEqual([]);
  const cfg = findValidConfig(facts, 0, Number.POSITIVE_INFINITY);
  expect(cfg, 'a configuration meets every requirement').not.toBeNull();
  const f = replay(cfg!.facts, cfg!.seed);
  expect(Object.values(f.status).every((s) => s === 'ok')).toBe(true);
  expect(f.violations).toEqual([]);
  const P = f.circles.get('circle-P')!;
  const R = f.positions.get('R')!;
  expect(Math.abs(Math.hypot(R.x - P.center.x, R.y - P.center.y) - P.r), 'R on circle P').toBeLessThan(1e-6);
  const center = f.construction.objects.find((o) => o.id === 'circle-P');
  expect(crossingPastSecond(f.positions, a, b, shared, (center as { center: string }).center)).toBe(true);
  return { facts: cfg!.facts, seed: cfg!.seed, f, P };
}

describe('#2518 — a free quantity holds the side', () => {
  it('T5, the operator\'s exact lines: the figure draws, R past O, OP = 10, P large enough', () => {
    const { f, P } = drawn([...REPORT, AO, 'OP = 10'], 'A', 'O', 'A');
    const O = f.positions.get('O')!;
    expect(Math.hypot(O.x - P.center.x, O.y - P.center.y)).toBeCloseTo(10, 6);
    expect(P.r).toBeGreaterThan(10);
  });

  it('T5 can be cycled, and every view keeps the side', () => {
    const { facts, seed } = drawn([...REPORT, AO, 'OP = 10'], 'A', 'O', 'A');
    const next = searchAnotherView(facts, seed, undefined, Number.POSITIVE_INFINITY);
    expect(next).not.toBeNull();
    const f = replay(next!.facts, next!.seed);
    expect(crossingPastSecond(f.positions, 'A', 'O', 'A', 'P')).toBe(true);
  });

  const BUILDS: [string, string[], string, string, string][] = [
    ['«OP = 10» typed first', [...FREE, 'OP = 10', AO], 'A', 'O', 'A'],
    ['the later line with O a free point', [...FREE, AO, 'OP = 10'], 'A', 'O', 'A'],
    ['a chord on the circle first', [...REPORT, 'נקודה B על מעגל P', 'AB = 4', AO, 'OP = 10'], 'A', 'O', 'A'],
    ['A on both circles', [...REPORT, 'נקודה A על מעגל O', AO, 'OP = 10'], 'A', 'O', 'A'],
    ['the circle shrinks, later («המשך OA», OP = 2)', [...FREE, OA, 'OP = 2'], 'O', 'A', 'A'],
    ['the circle shrinks, typed, and A turns to face O', [...FREE, 'OP = 2', OA], 'O', 'A', 'A'],
    ['O a rider on a free triangle', ['מעגל שמרכזו P', ...RIDER, AO], 'A', 'O', 'A'],
    ['a pinned radius, P\'s free centre moves', ['מעגל שמרכזו P ברדיוס 3', ...RIDER, AO], 'A', 'O', 'A'],
    ['a pinned radius, shared end second, P\'s free centre moves', ['מעגל שמרכזו P ברדיוס 3', ...RIDER, OA], 'O', 'A', 'A'],
    ['the radius held by a free point it passes through', ['מעגל שמרכזו P העובר דרך B', 'נקודה A על מעגל P', 'נקודה O', AO, 'OP = 10'], 'A', 'O', 'A'],
    ['a tangent pair: the other circle moves out and keeps touching', [...TANGENT, AO, 'OP = 10'], 'A', 'O', 'A'],
    ['a circle stated larger grows too', ['מעגל שמרכזו P', 'מעגל שמרכזו Q', 'רדיוס מעגל P הוא a', 'רדיוס מעגל Q הוא b', 'a < b', 'נקודה A על מעגל P', 'נקודה O', AO, 'OP = 10'], 'A', 'O', 'A'],
    ['a circle stated to contain P grows too', ['מעגל שמרכזו P', 'מעגל שמרכזו Q', 'מעגל P מוכל בתוך מעגל Q', 'נקודה A על מעגל P', 'נקודה O', AO, 'OP = 10'], 'A', 'O', 'A'],
  ];
  for (const [name, lines, a, b, shared] of BUILDS) it(`${name}: draws on the stated side`, () => void drawn(lines, a, b, shared));

  it('the seat also runs after a coupled step', () => {
    const { facts } = driveThroughGate(FREE.concat(AO));
    const c = replay(facts, 0).construction;
    const r = parse('OP = 10', ctxOf(facts));
    if (!r.ok) throw new Error('parse');
    const step = applyCoupledStep(c, r.commands as Command[]);
    expect(step.ok).toBe(true);
    if (step.ok) expect(step.ladder).toContain('seat:extension-side');
  });
});

describe('#2518 — nothing the student wrote can save it: refused, and the figure is untouched', () => {
  const KEPT: [string, string[], string][] = [
    ['a pinned radius, typed', [...PIN, 'OP = 10', AO], 'input.extensionSideImpossible'],
    ['a pinned radius, later', [...PIN, AO, 'OP = 10'], 'input.extensionSideBroken'],
    ['a pinned radius, a length no chord can have', [...PIN, AO, 'AO = 12'], 'input.extensionSideBroken'],
    ['«המשך OA» inside a pinned radius', ['מעגל שמרכזו P ברדיוס 5', 'נקודה A על מעגל P', 'נקודה O', 'OP = 2', OA], 'input.extensionSideImpossible'],
    ['a radius stated after the circle grew', [...REPORT, AO, 'OP = 10', 'רדיוס מעגל P הוא 3'], 'input.extensionSideBroken'],
    ['a radius stated first', [...REPORT, AO, 'רדיוס מעגל P הוא 3', 'OP = 10'], 'input.extensionSideBroken'],
    ['O stated outside the circle: «המשך AO» needs it inside', ['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O מחוץ למעגל P', AO], 'input.extensionSideImpossible'],
    ['O stated inside the circle: «המשך OA» needs it outside', ['מעגל שמרכזו P ברדיוס 8', 'נקודה A על מעגל P', 'נקודה O בתוך מעגל P', OA], 'input.extensionSideImpossible'],
  ];
  for (const [name, lines, key] of KEPT) {
    it(name, () => {
      const { refused } = driveThroughGate(lines);
      expect(refused.map((r) => r.utterance)).toEqual([lines[lines.length - 1]]);
      expect(refused[0].verdict).toMatchObject({ kind: 'refused', reason: 'extension-side', detail: key });
    });
  }

  it('a free radius alone saves nothing: both bagrut lines typed reversed stay refused, though their radii are free', () => {
    const q142 = ['שני מעגלים נחתכים בנקודות A ו B', 'המשיק למעגל O בנקודה A חותך את מעגל P בנקודה D', 'המשיק למעגל P בנקודה B חותך את מעגל O בנקודה C', 'נקודה F נמצאת על המשך הצלע BD וחותכת את מעגל O בנקודה F'];
    const q267 = ['שני מעגלים נחתכים בנקודות A ו-B', 'AD מיתר במעגל P משיק למעגל O בנקודה A', 'CB מיתר במעגל O משיק למעגל P בנקודה B', 'המשך AC חותך את מעגל P בנקודה E'];
    for (const lines of [q142, q267]) {
      const { refused } = driveThroughGate(lines);
      expect(refused.map((r) => r.utterance)).toEqual([lines[3]]);
      expect(refused[0].verdict).toMatchObject({ reason: 'extension-side', detail: 'input.extensionSideImpossible' });
    }
  });

  it('a stated disjoint pair is not grown over: the seat keeps every stated position', () => {
    const lines = ['מעגל שמרכזו O', 'מעגל שמרכזו P', 'המעגלים זרים', 'נקודה A על מעגל P', AO];
    const { facts } = driveThroughGate(lines);
    const f = replay(facts, 0);
    expect(f.violations.filter((v) => v.relation === 'circles-disjoint')).toEqual([]);
  });
});

describe('#2518 — the seat is cheap and changes nothing it need not', () => {
  it('an extension on its side costs no evaluation: nothing to seat', () => {
    const { facts } = driveThroughGate([...FREE, AO]);
    const f = replay(facts, 0);
    expect(reseatExtensions(f.construction, f.positions)).toBeNull();
  });

  it('a figure off its side that nothing can save is left as it was, within the try budget', () => {
    expect(MAX_TRIES).toBe(5);
    const { facts } = driveThroughGate(PIN.concat('OP = 10'));
    const c = replay(facts, 0);
    const saved: Fact[] = [...facts, { ...facts[0], id: 'saved', group: undefined, cmd: { type: 'extend-onto-circle', id: 'R', a: 'A', b: 'O', circle: 'circle-P' } }];
    const f = replay(saved, 0);
    expect(f.circles.get('circle-P')!.r).toBe(3);
    expect(f.positions.get('O')).toEqual(c.positions.get('O'));
    expect(f.violations.map((v) => v.messageKey)).toEqual(['figure.v.orderBeyondOther']);
  });

  it('a saved figure a free quantity can hold redraws on its side, unflagged (operator ruling 2026-11-06)', () => {
    const { facts } = driveThroughGate(FREE.concat('OP = 10'));
    const saved: Fact[] = [...facts, { ...facts[0], id: 'saved', group: undefined, cmd: { type: 'extend-onto-circle', id: 'R', a: 'A', b: 'O', circle: 'circle-P' } }];
    const f = replay(saved, 0);
    expect(f.violations).toEqual([]);
    expect(crossingPastSecond(f.positions, 'A', 'O', 'A', 'P')).toBe(true);
  });
});
