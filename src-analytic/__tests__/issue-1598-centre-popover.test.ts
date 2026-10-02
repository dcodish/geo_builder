/**
 * #1598 — click an unnamed circle's centre, type a letter: the shared letter popover names it.
 *
 * Operator, 2026-10-02: *"in analytic tool, i want to be able to press on the center of a circle to create
 * a letter in addition to the ability to define it through input like O מרכז המעגל"*.
 *
 * Driven through what App hands the popover — `centrePopoverOps` over the REAL store (`recordLine` via
 * `commitRecord`, `applySwap`, `setError`) — and the offer list the canvas draws (`offersOf`). The
 * recorded line is then re-parsed and re-derived, so the lock is that the canvas wrote a sentence the typed
 * path reads back to the SAME centre (ADR-AG-048), not that a function returned a string.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { derive } from '../engine/derive';
import { offersOf } from '../engine/crossings';
import { centreLabelOf, centrePopoverOps } from '../app/centreName';
import { commitRecord, decideSubmit } from '../app/submit';
import { swapOffered } from '../../shell/frame/letterOffer';

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

/** The canvas's centre offer — what the click target is drawn from. */
const centreOffer = () => offersOf(current().figure, current().construction).find((o) => o.centreOf);

/** What App hands the popover, for the centre offer on the canvas now. */
const popover = () => {
  const offer = centreOffer();
  if (!offer) throw new Error('no centre offer on the canvas');
  const ops = centrePopoverOps(offer.id, state(), { record: (v) => commitRecord(v, store().recordLine, t), applySwap: store().applySwap, setError: store().setError }, current());
  return { offer, label: centreLabelOf(current()), ...ops };
};

beforeEach(() => build([]));

describe('#1598 — the letter typed on a centre records the typed sentence', () => {
  it.each([
    ['an equation circle (O is taken — PR #1577 T51)', ['O(5,5)', 'x^2+y^2=16'], 'M', 'M מרכז המעגל x^2+y^2=16'],
    ['an equation circle stated with «שמשוואתו»', ['נתון מעגל שמשוואתו (x-3)^2+(y-4)^2=25'], 'K', 'K מרכז המעגל (x-3)^2+(y-4)^2=25'],
    ['a numeral circle', ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=25'], 'C', 'C מרכז המעגל I'],
    ['the figure’s only computed circle', ['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC', 'המעגל החוסם את המשולש ABC'], 'M', 'M מרכז המעגל'],
  ])('%s', (_name, lines, letter, sentence) => {
    build(lines);
    const { offer, onRename } = popover();
    expect(onRename('ignored', letter)).toEqual({ ok: true });
    // EXACTLY the sentence the typed path takes, as the last row
    expect(store().lines).toEqual([...lines, sentence]);
    // …and it names THAT centre: the letter is a point at the offer's position
    const p = current().figure.points.find((q) => q.id === letter);
    expect(p).toBeDefined();
    expect(p!.x).toBeCloseTo(offer.x, 9);
    expect(p!.y).toBeCloseTo(offer.y, 9);
    // the recorded line re-parses to the same centre: typing it on the figure before is the same record
    const typed = decideSubmit(sentence, lines, 0, derive(lines, 0));
    expect(typed.kind).toBe('record');
    // the centre is named, so the canvas offers it no more
    expect(centreOffer()).toBeUndefined();
    // one undo takes the naming back
    store().undo();
    expect(store().lines).toEqual(lines);
  });

  it('a lowercase letter is the capital, as every popover reads it', () => {
    build(['O(5,5)', 'x^2+y^2=16']);
    expect(popover().onRename('', 'm')).toEqual({ ok: true });
    expect(store().lines.at(-1)).toBe('M מרכז המעגל x^2+y^2=16');
  });

  it('a non-letter is refused and nothing is recorded', () => {
    build(['O(5,5)', 'x^2+y^2=16']);
    const r = popover().onRename('', '7');
    expect(r.ok).toBe(false);
    expect(store().lines).toEqual(['O(5,5)', 'x^2+y^2=16']);
  });
});

describe('#1598 — a taken letter offers the swap, like every letter popover', () => {
  it('the holder is quoted, the swap is offered, and the swap gives the centre that letter in ONE step', () => {
    const lines = ['O(5,5)', 'x^2+y^2=16'];
    build(lines);
    const { onRename, onSwap, label, offer } = popover();
    const r = onRename(label, 'O');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('taken');
    expect(r.holder?.text).toBe('O(5,5)');
    expect(swapOffered(r.holder)).toBe(true);
    expect(store().lines).toEqual(lines); // the refusal changed nothing

    expect(onSwap(label, 'O')).toEqual({ ok: true });
    // the centre is O now, and the old O took the centre's automatic letter
    const o = current().figure.points.find((q) => q.id === 'O')!;
    expect(o.x).toBeCloseTo(offer.x, 9);
    expect(o.y).toBeCloseTo(offer.y, 9);
    expect(store().lines).toEqual([`${label}(5,5)`, 'x^2+y^2=16', 'O מרכז המעגל x^2+y^2=16']);
    store().undo();
    expect(store().lines).toEqual(lines);
  });
});

describe('#1598 — circles whose centre is already a point are unchanged', () => {
  it('a canonical circle’s centre is the tool’s O (ADR-AG-184) — no centre offer, O where it was', () => {
    build(['x^2+y^2=16']);
    expect(centreOffer()).toBeUndefined();
    const o = current().figure.points.find((q) => q.id === 'O')!;
    expect([o.x, o.y].map((v) => Math.abs(v))).toEqual([0, 0]);
  });

  it('a circle stated with its centre letter offers nothing', () => {
    build(['מעגל שמרכזו O(1,1) ורדיוסו 3']);
    expect(centreOffer()).toBeUndefined();
  });
});
