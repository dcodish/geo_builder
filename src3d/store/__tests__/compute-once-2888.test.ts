/**
 * #2888 ([ADR-3D-491](../../../docs/06b-decisions-3d.md#adr-3d-491); ADR-W-210 invariant 4) — COMPUTE ONCE: a derive is
 * keyed by the fact list's CONTENT and a solve by the construction's CONTENT, never by the object that carries it.
 *
 * Three things are locked, each by COUNT (never a clock):
 *  1. the same content is solved once, whichever array or construction object brings it back;
 *  2. a different content is never answered from another's entry (every field a derive reads is in the key);
 *  3. a result does not depend on what was solved before: the same session, run with every cache cleared before each
 *     action and run warm, gives the same verdicts, statuses, positions and panel, and the warm run never works more.
 *
 * pipeline-lock: the memo under test IS the store's derive chokepoint, and "a result does not depend on what was solved
 * before" can only be asserted by driving the same whole session twice through the student's entry point; a fixture or
 * a scenario asserts one run.
 *
 * test-budget: six whole sessions are each walked twice (cold before every action, then warm), and the count locks solve
 * a real figure a dozen times: about a minute. The sessions are the lock that a result does not depend on warmth.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useGeo3, derive3, deriveStats3, deriveMemoStats3, deriveMemoSize3, clearSolveCaches3, DERIVE_MEMO_ENTRIES, type Fact3 } from '../store3';
import { figureContent3, meetsShapePreferences3, resolve3, resolveStats3, seedVerdictCount3, seedVerdictStats3, FIGURE_CONTENT_ENTRIES, SEED_VERDICTS_PER_FIGURE } from '../../engine/evaluate';
import { leastSquaresStats } from '../../engine/solve3';
import { scalarPinOrigin3 } from '../../engine/types';
import { dataView } from '../../engine/dataView';
import { walkFixture3, type WalkedAction3 } from '../../__tests__/work-meter/walk3';

const DIR = join(__dirname, '..', '..', '..', 'fixtures3');

const reset = (): void => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
  clearSolveCaches3();
};
const submit = (...lines: string[]): void => lines.forEach((u) => useGeo3.getState().submit(u));
const state = () => useGeo3.getState();
/** The same rows in new objects: what an edit, a load or an undo-and-retype hands the derive. */
const copyOf = (facts: readonly Fact3[]): Fact3[] => facts.map((f) => ({ ...f, cmds: JSON.parse(JSON.stringify(f.cmds)) as Fact3['cmds'] }));
/** A figure whose derive SOLVES (ADR-3D-260's rider lane): the #1422 press figure. */
const SOLVED = ['וקטור AB', 'אורך AB = 5'];

beforeEach(reset);

describe('#2888 — a fact list is derived once per content', () => {
  it('the same rows in another array are answered from the memo: no derive, no solver work, the same object', () => {
    submit(...SOLVED);
    const { facts, seed } = state();
    const first = derive3(facts, seed);
    const [d0, e0] = [deriveStats3.uncached, leastSquaresStats.evals];
    const again = derive3(copyOf(facts), seed);
    expect(again).toBe(first);
    expect(deriveStats3.uncached - d0).toBe(0);
    expect(leastSquaresStats.evals - e0).toBe(0);
    expect(deriveMemoStats3.hits).toBeGreaterThan(0);
  });

  it('a row edited to what it already says costs no solver work (the meter’s edit)', () => {
    submit(...SOLVED);
    const before = state();
    derive3(before.facts, before.seed);
    const last = before.facts[before.facts.length - 1];
    const e0 = leastSquaresStats.evals;
    expect(state().replaceFact(last.id, last.utterance)).toBe(true);
    const after = state();
    expect(after.facts).not.toBe(before.facts); // the edit brings a new array
    derive3(after.facts, after.seed);
    expect(leastSquaresStats.evals - e0).toBe(0);
  });

  it('deleting the last row returns to a figure the session has: no solver work', () => {
    submit(...SOLVED, 'נקודה C');
    const { facts, seed } = state();
    const e0 = leastSquaresStats.evals;
    state().remove(facts[facts.length - 1].id);
    derive3(state().facts, state().seed);
    expect(state().seed).toBe(seed);
    expect(leastSquaresStats.evals - e0).toBe(0);
  });

  it.each([
    ['another id', (f: Fact3): Fact3 => ({ ...f, id: `${f.id}x` })],
    ['another text', (f: Fact3): Fact3 => ({ ...f, utterance: `${f.utterance} ` })],
    ['another command', (f: Fact3): Fact3 => ({ ...f, cmds: JSON.parse(JSON.stringify(f.cmds).replace('5', '6')) as Fact3['cmds'] })],
    ['unticked', (f: Fact3): Fact3 => ({ ...f, enabled: false })],
    ['held', (f: Fact3): Fact3 => ({ ...f, held: true })],
  ])('never a stale answer: the last row with %s is its own derive', (_what, change) => {
    submit(...SOLVED);
    const { facts, seed } = state();
    const first = derive3(facts, seed);
    const changed = [...copyOf(facts).slice(0, -1), change(copyOf(facts)[facts.length - 1])];
    expect(JSON.stringify(changed)).not.toBe(JSON.stringify(facts)); // the change is real
    const d0 = deriveStats3.uncached;
    const other = derive3(changed, seed);
    expect(other).not.toBe(first);
    expect(deriveStats3.uncached - d0).toBe(1);
  });

  it('never a stale answer: another configuration and one row more are their own derives; one row fewer is the figure the session had', () => {
    submit(...SOLVED);
    const { facts, seed } = state();
    expect(seed).toBe(0);
    const first = derive3(facts, seed);
    const d0 = deriveStats3.uncached;
    expect(derive3(copyOf(facts), 1)).not.toBe(first);
    expect(derive3([...copyOf(facts), { id: 'more', utterance: 'נקודה C', cmds: [], enabled: true }], seed)).not.toBe(first);
    expect(deriveStats3.uncached - d0).toBe(2);
    // the first row alone is what the session derived when it was typed: answered, and it is that figure, not this one
    const alone = derive3(copyOf(facts).slice(0, 1), seed);
    expect(alone).not.toBe(first);
    expect(Object.keys(alone.status)).toEqual([facts[0].id]);
    expect(deriveStats3.uncached - d0).toBe(2);
    // and the changed command is read: the length is 6, not the memo's 5
    const six = derive3(copyOf(facts).map((f, i) => (i === 1 ? { ...f, cmds: JSON.parse(JSON.stringify(f.cmds).replace('5', '6')) as Fact3['cmds'] } : f)), seed);
    const [a, b] = [six.positions.get('A')!, six.positions.get('B')!];
    expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeCloseTo(6, 4);
  });

  it(`the bound holds: at most ${DERIVE_MEMO_ENTRIES} derives, the least recently used dropped, and a dropped one derives the same again`, () => {
    submit('נקודה A');
    const { facts } = state();
    const first = derive3(facts, 0);
    const snapshot = JSON.stringify([...first.positions]);
    for (let s = 1; s <= DERIVE_MEMO_ENTRIES + 9; s++) {
      derive3(facts, s);
      expect(deriveMemoSize3()).toBeLessThanOrEqual(DERIVE_MEMO_ENTRIES);
    }
    expect(deriveMemoStats3.dropped).toBe(10);
    const d0 = deriveStats3.uncached;
    const again = derive3(facts, 0); // seed 0 was the least recently used: dropped, so derived again
    expect(deriveStats3.uncached - d0).toBe(1);
    expect(again).not.toBe(first);
    expect(JSON.stringify([...again.positions])).toBe(snapshot);
    // a derive that is USED is kept: seed 5 is read on every round and outlives the rounds
    clearSolveCaches3();
    const kept = derive3(facts, 5);
    for (let s = 100; s < 100 + 3 * DERIVE_MEMO_ENTRIES; s++) {
      derive3(facts, s);
      expect(derive3(facts, 5)).toBe(kept);
    }
  });

  it('clearSolveCaches3 clears: the same array is derived and solved again, to the same figure', () => {
    submit(...SOLVED);
    const { facts, seed } = state();
    const first = derive3(facts, seed);
    clearSolveCaches3();
    expect(deriveMemoSize3()).toBe(0);
    expect(figureContent3.size).toBe(0);
    const [d0, e0] = [deriveStats3.uncached, leastSquaresStats.evals];
    const again = derive3(facts, seed);
    expect(again).not.toBe(first);
    expect(deriveStats3.uncached - d0).toBe(1);
    expect(leastSquaresStats.evals - e0).toBeGreaterThan(0);
    expect(JSON.stringify([...again.positions])).toBe(JSON.stringify([...first.positions]));
  });
});

describe('#2888 — a construction is solved once per content', () => {
  it('the same lines at another configuration fold a NEW construction, and it is solved where the first was not', () => {
    submit(...SOLVED);
    const { facts } = state();
    const c0 = derive3(facts, 0).construction;
    const c7 = derive3(facts, 7).construction;
    expect(c7).not.toBe(c0); // the fold ran again
    expect(figureContent3.of(c7)).toBe(figureContent3.of(c0)); // one content
    const at7 = resolve3(c7, 7);
    const [r0, e0] = [resolveStats3.uncached, leastSquaresStats.evals];
    expect(resolve3(c0, 7)).toBe(at7); // the first object, at the seed the second was solved at
    expect(resolveStats3.uncached - r0).toBe(0);
    expect(leastSquaresStats.evals - e0).toBe(0);
  });

  it('a copy of a construction is the same figure; a construction with one more given is not', () => {
    submit(...SOLVED);
    const { facts, seed } = state();
    const c = derive3(facts, seed).construction;
    const solved = resolve3(c, seed);
    const r0 = resolveStats3.uncached;
    expect(resolve3({ ...c }, seed)).toBe(solved);
    expect(resolveStats3.uncached - r0).toBe(0);
    const shorter = derive3(facts.slice(0, 1), seed).construction;
    expect(figureContent3.of(shorter)).not.toBe(figureContent3.of(c));
    expect(resolve3(shorter, seed)).not.toBe(solved);
    const moved = { ...c, points: new Map([...c.points].reverse()) }; // the same points in another order: another content
    expect(figureContent3.of(moved)).toBe(moved);
  });

  it('what a construction asked for stays with it, whatever its content solves afterwards (an undo finds its figure)', () => {
    submit('נקודה A', 'נקודה B');
    const { facts } = state();
    const c0 = derive3(facts, 0).construction;
    const first = resolve3(c0, 0);
    // the same content, asked through another object at far more configurations than one memo holds
    const sweep = { ...c0 };
    expect(figureContent3.of(sweep)).toBe(figureContent3.of(c0));
    for (let seed = 100; seed < 300; seed++) resolve3(sweep, seed);
    // the content's shared answers no longer hold seed 0: an object that never asked solves it again…
    const r1 = resolveStats3.uncached;
    resolve3({ ...c0 }, 0);
    expect(resolveStats3.uncached - r1).toBe(1);
    // …but the object that asked still has its own answer, the same object
    const r0 = resolveStats3.uncached;
    expect(resolve3(c0, 0)).toBe(first);
    expect(resolveStats3.uncached - r0).toBe(0);
  });

  it('the pin-origin table is content: the same givens stated by another row are not shared', () => {
    const lines = ['ריבוע ABCD', 'קטע AS', '|SA| = 5'];
    submit(...lines);
    const { facts, seed } = state();
    const c = derive3(facts, seed).construction;
    const pinned = c.scalarPins.filter((p) => scalarPinOrigin3.get(p)?.fact !== undefined);
    expect(pinned.length, 'the figure must carry a pin a row stated, or this lock checks nothing').toBeGreaterThan(0);
    // an unticked row before the pin's row moves the row's list position and nothing else
    const shifted: Fact3[] = [facts[0], { id: 'off', utterance: 'נקודה Q', cmds: [], enabled: false }, ...copyOf(facts.slice(1))];
    const c2 = derive3(shifted, seed).construction;
    expect(JSON.stringify([...c2.points])).toBe(JSON.stringify([...c.points]));
    const statedBy = (k: typeof c): (number | undefined)[] => k.scalarPins.map((p) => scalarPinOrigin3.get(p)?.fact);
    expect(statedBy(c2).length).toBe(statedBy(c).length);
    expect(statedBy(c2)).not.toEqual(statedBy(c));
    expect(figureContent3.of(c2)).not.toBe(figureContent3.of(c));
  });

  it('a construction whose pins are not all stated by a row keeps the identity rule: a probe with a temporary pin is never shared', () => {
    const lines = ['ריבוע ABCD', 'קטע AS', '|SA| = 5'];
    submit(...lines);
    const { facts, seed } = state();
    const c = derive3(facts, seed).construction;
    const probe = () => ({ ...c, scalarPins: [...c.scalarPins, { kind: 'length' as const, a: 'A', b: 'B', value: 1 }] });
    const [p1, p2] = [probe(), probe()];
    const opaque = figureContent3.stats.opaque;
    expect(figureContent3.of(p1)).toBe(p1);
    expect(figureContent3.of(p2)).toBe(p2);
    expect(figureContent3.stats.opaque - opaque).toBe(2);
  });

  it(`the bound holds: at most ${FIGURE_CONTENT_ENTRIES} constructions are held`, () => {
    for (let n = 0; n < FIGURE_CONTENT_ENTRIES + 20; n++) {
      const c = derive3([{ id: 'p', utterance: `נקודה A`, cmds: [{ type: 'point3', id: 'A', x: n, y: 0, z: 0 }] as Fact3['cmds'], enabled: true }], 0).construction;
      resolve3(c, 0);
      expect(figureContent3.size).toBeLessThanOrEqual(FIGURE_CONTENT_ENTRIES);
    }
    expect(figureContent3.stats.dropped).toBeGreaterThanOrEqual(20);
  });
});

/**
 * THE SEED WALK. «AB = 5 · BC = 3 · AC = 7.9999» is a triangle the givens force flat to a hair, so the configuration
 * search (`firstSatisfyingSeed3`) finds no seed it prefers and walks its whole window of 200. A press then walks the
 * window again from one seed on: 199 seeds of the same construction content the submit had just judged.
 */
describe('#2888 — a seed is judged once per construction content', () => {
  const FLAT = (JSON.parse(readFileSync(join(DIR, 'stated-length-7-9999-2361.geo3.json'), 'utf8')) as { facts: { utterance: string }[] }).facts.map((f) => f.utterance);

  it('a press after the submit re-judges one seed, not the window, and lands where a cold press lands', () => {
    submit(...FLAT);
    const typed = { facts: state().facts, seed: state().seed };
    expect(Object.values(derive3(typed.facts, typed.seed).status).every((st) => st === 'ok')).toBe(true);
    const submitAsked = seedVerdictStats3.asked;
    expect(submitAsked, 'the submit must have walked the window, or this lock checks nothing').toBeGreaterThanOrEqual(200);
    // warm: the session that typed the figure presses
    const [h0, e0] = [seedVerdictStats3.hits, leastSquaresStats.evals];
    state().resample();
    const warm = { seed: state().seed, hits: seedVerdictStats3.hits - h0, work: leastSquaresStats.evals - e0 };
    const warmFigure = JSON.stringify([...derive3(state().facts, state().seed).positions]);
    expect(warm.hits).toBeGreaterThanOrEqual(199);
    // cold: the same figure and seed in a new session
    clearSolveCaches3();
    useGeo3.setState({ facts: typed.facts, seed: typed.seed, lastError: null, lastNotice: null });
    const e1 = leastSquaresStats.evals;
    state().resample();
    const cold = { seed: state().seed, hits: seedVerdictStats3.hits, work: leastSquaresStats.evals - e1 };
    expect(cold.hits).toBe(0);
    expect(warm.seed).toEqual(cold.seed);
    expect(warmFigure).toBe(JSON.stringify([...derive3(state().facts, state().seed).positions]));
    expect(warm.work).toBeLessThan(cold.work / 10);
  });

  it('never a stale verdict: another figure, another seed and another set of preferences are each their own question', () => {
    submit(...FLAT);
    const { facts, seed } = state();
    const c = derive3(facts, seed).construction;
    expect(seedVerdictCount3(c)).toBeGreaterThanOrEqual(200);
    // another figure (one row fewer): nothing kept for it by this walk beyond what its own submit asked
    const shorter = derive3(facts.slice(0, 3), seed).construction;
    expect(figureContent3.of(shorter)).not.toBe(figureContent3.of(c));
    const kept = seedVerdictCount3(shorter);
    const [a0, h0] = [seedVerdictStats3.asked, seedVerdictStats3.hits];
    meetsShapePreferences3(shorter, 100_000);
    expect(seedVerdictStats3.hits - h0).toBe(0);
    expect(seedVerdictCount3(shorter)).toBe(kept + 1);
    // the same figure at a seed nobody asked: judged
    meetsShapePreferences3(c, 100_000);
    expect(seedVerdictStats3.hits - h0).toBe(0);
    // asked again: answered
    meetsShapePreferences3(c, 100_000);
    expect(seedVerdictStats3.hits - h0).toBe(1);
    expect(seedVerdictStats3.asked - a0).toBe(3);
  });

  it('which preferences were asked is part of the question: the same seed with none of them is judged on its own', () => {
    submit('מלבן ABCD');
    const { facts, seed } = state();
    const c = derive3(facts, seed).construction;
    expect(c.requirements.some((r) => r.kind === 'quad-general'), 'a rectangle carries a drawing preference, or this lock checks nothing').toBe(true);
    const h0 = seedVerdictStats3.hits;
    meetsShapePreferences3(c, 100_000);
    meetsShapePreferences3(c, 100_000, []);
    expect(seedVerdictStats3.hits - h0).toBe(0);
    meetsShapePreferences3(c, 100_000, []);
    meetsShapePreferences3(c, 100_000);
    expect(seedVerdictStats3.hits - h0).toBe(2);
  });

  it(`the bound holds (${SEED_VERDICTS_PER_FIGURE} verdicts per construction), and the one clear forgets them`, () => {
    submit('משולש ABC');
    const { facts, seed } = state();
    const c = derive3(facts, seed).construction;
    for (let s = 0; s < SEED_VERDICTS_PER_FIGURE + 40; s++) {
      meetsShapePreferences3(c, 1000 + s);
      expect(seedVerdictCount3(c)).toBeLessThanOrEqual(SEED_VERDICTS_PER_FIGURE);
    }
    expect(seedVerdictCount3(c)).toBe(SEED_VERDICTS_PER_FIGURE);
    clearSolveCaches3();
    expect(seedVerdictCount3(c)).toBe(0);
    expect(seedVerdictStats3.asked).toBe(0);
  });
});

/**
 * COLD = WARM, at the student's entry point (docs/17 §9): the meter's own session walk (a load, every row typed, one
 * «הציגו תצורה אחרת», an edit, a delete), once with every cache cleared before each action and once as a session runs.
 * The figures are the classes the content keys serve: a row that stands aside for its twin, independent parts, a
 * configuration search that redraws, a parameter with branches, a bound pyramid, a reseated trapezoid.
 */
const PLAN = { submits: 'all', presses: 1 } as const;
const SESSIONS = [
  'held-row-2790.geo3.json',
  'nine-separate-shapes-2764.geo3.json',
  'stated-length-7-9999-2361.geo3.json',
  'plane-distance-param-1472.geo3.json',
  'right-pyramid-rhombus-2490.geo3.json',
  'trapezoid-reseat-1918.geo3.json',
];

const plain = (v: unknown): unknown => {
  if (v instanceof Map) return [...v.entries()].map(([k, x]) => [k, plain(x)]);
  if (v instanceof Set) return [...v].map(plain);
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'function') return 'fn';
  if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0) ? v : `n:${Object.is(v, -0) ? '-0' : v}`;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};

/** Everything a student can see of the store's figure, with each row's random id replaced by its list position. */
function seen(): string {
  const { facts, seed, lastError, lastNotice } = state();
  const d = derive3(facts, seed);
  let panel: unknown;
  try {
    panel = plain(dataView(d.construction, seed));
  } catch (e) {
    panel = `throw:${String(e)}`;
  }
  let out = JSON.stringify({
    seed, lastError, lastNotice,
    rows: facts.map((f) => [f.utterance, f.enabled, f.held ?? false, d.status[f.id], d.created[f.id] ?? null, d.createdCircles[f.id] ?? null, d.readings[f.id] ?? null]),
    resolved: plain(d.resolved), notices: plain(d.notices), shapeWarnings: plain(d.shapeWarnings), coincidences: d.coincidences, panel,
  });
  facts.forEach((f, i) => {
    out = out.split(f.id).join(`#${i}`);
  });
  return out;
}

function session(text: string, cold: boolean): { actions: WalkedAction3[]; views: string[] } {
  const views: string[] = [];
  let started = false;
  const actions = walkFixture3(text, PLAN, () => {
    if (started) views.push(seen()); // the figure the action before this one left
    started = true;
    if (cold) clearSolveCaches3();
  });
  views.push(seen());
  return { actions, views };
}

describe('#2888 — a result does not depend on what was solved before', () => {
  const totals = { cold: 0, warm: 0 };
  for (const file of SESSIONS) {
    it(`${file}: the session cold before every action and the session warm are the same session`, () => {
      const text = readFileSync(join(DIR, file), 'utf8');
      const cold = session(text, true);
      expect(figureContent3.changed(), 'a construction was changed after it was solved').toEqual([]);
      const warm = session(text, false);
      expect(figureContent3.changed(), 'a construction was changed after it was solved').toEqual([]);
      expect(warm.actions.map((a) => `${a.action}:${a.rec.verdict}`)).toEqual(cold.actions.map((a) => `${a.action}:${a.rec.verdict}`));
      expect(warm.views.length).toBe(cold.views.length);
      warm.views.forEach((v, i) => expect(v, `after ${cold.actions[i].action}`).toBe(cold.views[i]));
      // and warm never works more than cold, action by action
      warm.actions.forEach((a, i) => expect(a.rec.work.total, a.action).toBeLessThanOrEqual(cold.actions[i].rec.work.total));
      totals.cold += cold.actions.reduce((s, a) => s + a.rec.work.total, 0);
      totals.warm += warm.actions.reduce((s, a) => s + a.rec.work.total, 0);
    }, 300_000);
  }

  it('and over these sessions the warm run does less work than the cold one (the lock above is not vacuous)', () => {
    expect(totals.cold).toBeGreaterThan(0);
    expect(totals.warm).toBeLessThan(totals.cold);
  });
});
