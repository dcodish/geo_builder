/**
 * #2554 — the + at a lone circle's centre names it (ADR-AG-338).
 *
 * Operator, 2026-10-25 (prod analytic): *"when I wrote שני מעגלים it marked with + the centers but i count
 * press and name them"*; the #1598 promise, 2026-10-02: *"press on the center of a circle to create a letter"*.
 *
 * `centresOf` offered the contextual «X מרכז המעגל» only to a lone `circle-thru-*`, so a free «מעגל ברדיוס 5», a
 * diameter's circle and a quadrilateral's incircle drew a + nothing could act on. Item 1 widens the contextual
 * offer to any lone circle with no numeral and no equation. Item 2 (a PAIR's centres) stays unbuilt: the operator
 * ruled D8 = B on #2552 (2026-10-26) that «המעגל הראשון / השני» is read only in the exam's two sentences, so no
 * sentence names one circle of a pair, and a click with no sentence is not offered (ADR-AG-048, ADR-AG-054).
 *
 * The locks drive what App drives: the canvas's offer list (`offersOf`), the popover's ops over the REAL store,
 * and the recorded line through `decideSubmit` — never a re-assembled sentence.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { derive } from '../engine/derive';
import { offersOf, pointAt } from '../engine/crossings';
import { centrePopoverOps } from '../app/centreName';
import { commitRecord, decideSubmit } from '../app/submit';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

const store = () => useAnalyticStore.getState();
const current = () => derive(store().lines, store().seed, store().seedNames);
const state = () => {
  const s = store();
  return { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames, segStyle: s.segStyle };
};
const t = (k: string) => k;

function build(lines: string[]) {
  store().clearAll();
  for (const l of lines) store().recordLine(l);
  useAnalyticStore.temporal.getState().clear();
}

const centreOffers = () => offersOf(current().figure, current().construction).filter((o) => o.centreOf);

beforeEach(() => build([]));

describe('#2554 item 1 — a lone circle of any kind offers its centre, and the click records «X מרכז המעגל»', () => {
  it.each([
    ['the reported free circle «מעגל ברדיוס 5»', ['מעגל ברדיוס 5']],
    ['a bare «מעגל»', ['מעגל']],
    ['a circle by its diameter length', ['מעגל בקוטר 10']],
    ['a circle on a diameter segment', ['B(7,7)', 'D(1,1)', 'נתון מעגל שקוטרו BD']],
    ['a quadrilateral’s incircle', ['A(0,0)', 'B(4,0)', 'C(4,4)', 'D(0,4)', 'מעגל חסום במרובע ABCD']],
  ])('%s', (_name, lines) => {
    build(lines);
    const offers = centreOffers();
    expect(offers).toHaveLength(1);
    const offer = offers[0];
    const ops = centrePopoverOps(offer.id, state(), { record: (v) => commitRecord(v, store().recordLine, t), applySwap: store().applySwap, setError: store().setError }, current());
    expect(ops.onRename('', 'O')).toEqual({ ok: true });
    // EXACTLY the typed sentence, as the last row
    expect(store().lines).toEqual([...lines, 'O מרכז המעגל']);
    // …it names THAT centre
    const o = current().figure.points.find((p) => p.id === 'O');
    expect(o).toBeDefined();
    expect(o!.x).toBeCloseTo(offer.x, 9);
    expect(o!.y).toBeCloseTo(offer.y, 9);
    // the typed path reads the same line back (one grammar, two surfaces)
    expect(decideSubmit('O מרכז המעגל', lines, 0, derive(lines, 0)).kind).toBe('record');
    // named now, so the canvas offers it no more
    expect(centreOffers()).toEqual([]);
    store().undo();
    expect(store().lines).toEqual(lines);
  });
});

describe('#2554 item 2 is unbuilt (D8 = B on #2552) — a pair’s centres offer nothing', () => {
  it.each([['שני מעגלים'], ['שני מעגלים זרים']])('%s', (line) => {
    build([line]);
    expect(centreOffers()).toEqual([]);
  });
});

/**
 * THE CLASS GUARD (#2554 item 3): every circle any catalog entry draws, with its centre on the canvas, either has
 * a letter at its centre or offers its + — and every offer's sentence reads back through `decideSubmit` to a point
 * AT that centre. The one declared exception is a sentence-drawn PAIR (`circle-pair<k>-1/2`): the operator ruled
 * D8 = B on #2552 (2026-10-26) that the pair reference «המעגל הראשון / השני» is not a general reference, so no
 * sentence can name one specific circle of the pair; its centres are named by typing «O_1 מרכז מעגל» in order.
 */
describe('#2554 item 3 — the class guard over every circle the catalog draws', () => {
  /** Declared exception, ruled D8 = B on #2552 (2026-10-26): a pair circle has no sentence that names it alone. */
  const PAIR_EXCEPTION = /^circle-pair\d+-[12]$/;
  /** KNOWN GAP #2566 (found by this guard): an equation circle with a free letter offers its equation sentence, which the typed path refuses. Remove when #2566 is fixed. */
  const KNOWN_GAP = new Set(['נתון מעגל שמשוואתו (x-13)^2+y^2=R^2']);
  const extra = [['מעגל ברדיוס 5'], ['A(0,0)', 'B(4,0)', 'C(4,4)', 'D(0,4)', 'מעגל חסום במרובע ABCD']];
  const seqs = [...COMMAND_CATALOG_ANALYTIC.filter((e) => !e.lane).map((e) => [...(e.needs ?? []), e.he]), ...extra];

  it('a + with no offer exists only where the centre is lettered or the circle is a ruled pair', () => {
    const silent: string[] = [];
    const broken: string[] = [];
    let circlesSeen = 0;
    const gapSeen: boolean[] = [];
    for (const lines of seqs) {
      const d = derive(lines, 0);
      const offers = offersOf(d.figure, d.construction).filter((o) => o.centreOf);
      for (const cu of d.figure.curves) {
        const circle = cu.curve as { kind: string; cx?: number; cy?: number };
        if (!cu.stated || circle.kind !== 'circle' || circle.cx === undefined || circle.cy === undefined) continue;
        circlesSeen += 1;
        if (pointAt(d.figure, circle.cx, circle.cy) !== null) continue;
        const offer = offers.find((o) => o.centreOf === cu.id);
        if (!offer) {
          if (!PAIR_EXCEPTION.test(cu.id)) silent.push(`${cu.id} :: ${lines.join(' | ')}`);
          continue;
        }
        // the offer must be a sentence the typed path records, naming a point AT this centre
        const v = decideSubmit(offer.sentence, lines, 0, d);
        const after = v.kind === 'record' ? derive([...lines, offer.sentence], 0) : null;
        const letter = offer.sentence.split(' ')[0];
        const p = after?.figure.points.find((q) => q.id === letter);
        const reads = !!p && Math.hypot(p.x - circle.cx, p.y - circle.cy) <= 1e-6;
        if (KNOWN_GAP.has(lines.at(-1)!)) {
          gapSeen.push(reads);
          continue;
        }
        if (!reads) broken.push(`${cu.id} «${offer.sentence}» :: ${lines.join(' | ')}`);
      }
    }
    expect(circlesSeen).toBeGreaterThan(20);
    expect(silent).toEqual([]);
    expect(broken).toEqual([]);
    // the known gap is still a gap: when #2566 lands this fails, so the row is removed rather than left stale
    expect(gapSeen).toEqual([false]);
  });
});
