/**
 * #1548 — THE MUTE CHECKBOX (docs/28 D6): disable, the operation the other three builders had.
 *
 * Operator, 2026-09-29: *"2d, 3d, and complex have the checkbox on the input line that allows to
 * disable that input but analytics doesnt and should"*.
 *
 * Every assertion CALLS the decision the App calls (`decideToggle`, `decideEdit`) and the store the
 * App writes — never a reproduction (#1102). The figure is always read through `derive` over the
 * ACTIVE projection, which is the one route the App takes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { activeOf, rowOf } from '../app/active';
import { decideEdit, decideSubmit, decideToggle } from '../app/submit';
import { loadAnalyticSession } from '../app/loadSession';
import { useAnalyticStore } from '../store/useAnalyticStore';

const store = () => useAnalyticStore.getState();
const figureOf = () => derive(activeOf(store().lines, store().disabled), store().seed);
const ids = () => figureOf().figure.points.map((p) => p.id);
/** The App's own toggle dispatch: decide, then record or refuse. */
const toggle = (i: number) => {
  const v = decideToggle(i, store().lines, store().disabled, store().seed);
  if (v.kind === 'refused') store().setError(v.error);
  else store().setDisabled(v.disabled);
  return v;
};

const MIDPOINT = ['A(0,0)', 'B(4,0)', 'M אמצע AB'];
/**
 * A line that DEPENDS on row 1 and cannot stand without it. Not «M אמצע AB» since #1670 (ADR-AG-210): with B muted a bare
 * midpoint mints B as a free point, as 2-D does — the honest counterfactual of a list without «B(4,0)». A cevian to a side
 * no shape has refers to B and mints nothing, in either builder.
 */
const DEPENDENT = ['A(0,0)', 'B(4,0)', 'CD גובה לצלע AB'];

beforeEach(() => {
  store().clearAll();
  useAnalyticStore.temporal.getState().clear();
});

describe('#1548 — muting a row takes it out of the figure and keeps it in the list', () => {
  it('a muted point leaves the figure; un-muting brings the same figure back', () => {
    DEPENDENT.forEach((l) => store().recordLine(l));
    expect(ids()).toEqual(['A', 'B', 'C', 'D']);
    const before = figureOf().figure.points.map((p) => [p.id, p.x, p.y]);

    expect(toggle(1).kind).toBe('apply');
    expect(store().lines).toEqual(DEPENDENT); // the row stays
    expect(store().disabled).toEqual([1]);
    expect(ids()).toEqual(['A']);

    expect(toggle(1).kind).toBe('apply');
    expect(store().disabled).toEqual([]);
    expect(figureOf().figure.points.map((p) => [p.id, p.x, p.y])).toEqual(before);
  });

  it('muting a midpoint’s parent leaves the midpoint standing on a FREE parent — the list without that row (#1670)', () => {
    MIDPOINT.forEach((l) => store().recordLine(l));
    toggle(1);
    const muted = figureOf();
    expect(muted.faults).toEqual([]);
    expect(muted.figure.points.map((p) => [p.id, p.x, p.y])).toEqual(derive(['A(0,0)', 'M אמצע AB'], store().seed).figure.points.map((p) => [p.id, p.x, p.y]));
  });

  it('a line that depended on the muted one faults on ITS OWN row — the honest counterfactual', () => {
    DEPENDENT.forEach((l) => store().recordLine(l));
    toggle(1);
    const d = figureOf();
    const rows = rowOf(store().lines.length, store().disabled);
    // the derivation indexes the ACTIVE lines; the row map puts the fault on «CD גובה לצלע AB», row 2
    expect(d.faults.map((f) => [rows[f.index], f.code])).toEqual([[2, 'unknown-reference']]);
  });

  it('un-muting faces the typed-line gate: a line that now contradicts the figure stays muted, and the refusal names IT', () => {
    MIDPOINT.forEach((l) => store().recordLine(l));
    toggle(1); // mute B(4,0)
    // with B muted, the student gives B elsewhere — a legitimate new given
    expect(decideSubmit('B(0,3)', activeOf(store().lines, store().disabled), 0).kind).toBe('record');
    store().recordLine('B(0,3)');

    const v = toggle(1);
    expect(v).toEqual({ kind: 'refused', error: expect.objectContaining({ key: 'conflicting-restatement', detail: 'B(4,0)' }) });
    expect(store().disabled).toEqual([1]); // refused ⇒ still muted
    expect(store().error?.detail).toBe('B(4,0)');
  });

  it('muting is always allowed, even the line everything else hangs on', () => {
    MIDPOINT.forEach((l) => store().recordLine(l));
    expect(toggle(0)).toEqual({ kind: 'apply', disabled: [0] });
  });
});

describe('#1548 — editing, removing and undoing around a muted row', () => {
  it('editing a MUTED row rewrites text only, but it must still read (D6 ruling b)', () => {
    MIDPOINT.forEach((l) => store().recordLine(l));
    toggle(1);
    expect(decideEdit(1, 'B(5,0)', store().lines, store().disabled, 0)).toBe(true);
    expect(decideEdit(1, 'בלה בלה', store().lines, store().disabled, 0)).toBe(false);
  });

  it('editing an ACTIVE row keeps its gate, with the row translated to its active position', () => {
    MIDPOINT.forEach((l) => store().recordLine(l));
    store().recordLine('C(1,1)');
    toggle(1); // mute B: active is A, M, C — C's row 3 is active index 2
    expect(decideEdit(3, 'C(2,2)', store().lines, store().disabled, 0)).toBe(true);
    // A restated at a different place on ITS row faults on that row
    expect(decideEdit(2, 'A(1,1)', ['A(0,0)', 'B(4,0)', 'A(1,1)'], [1], 0)).toBe(false);
  });

  it('removing an earlier row shifts the muted indexes with their lines', () => {
    ['A(0,0)', 'B(4,0)', 'C(0,3)', 'D(1,1)'].forEach((l) => store().recordLine(l));
    store().setDisabled([2, 3]);
    store().removeLine(0);
    expect(store().lines).toEqual(['B(4,0)', 'C(0,3)', 'D(1,1)']);
    expect(store().disabled).toEqual([1, 2]);
    store().removeLine(1); // removing a muted row drops its index
    expect(store().disabled).toEqual([1]);
    expect(store().lines[1]).toBe('D(1,1)');
  });

  it('undo takes a mute back — muting is a step the student took', () => {
    MIDPOINT.forEach((l) => store().recordLine(l));
    toggle(1);
    expect(store().disabled).toEqual([1]);
    store().undo();
    expect(store().disabled).toEqual([]);
    expect(store().lines).toEqual(MIDPOINT);
    store().redo();
    expect(store().disabled).toEqual([1]);
  });

  it('clear-all un-mutes (nothing to mute)', () => {
    MIDPOINT.forEach((l) => store().recordLine(l));
    toggle(1);
    store().clearAll();
    expect(store().disabled).toEqual([]);
  });
});

describe('#1548 — a muted row saves muted and loads muted', () => {
  it('the save carries `disabled` only when something is muted', () => {
    MIDPOINT.forEach((l) => store().recordLine(l));
    expect('disabled' in store().serialize()).toBe(false); // older readers see an unchanged file
    toggle(1);
    expect(store().serialize().disabled).toEqual([1]);
  });

  it('a load restores the mute and audits the figure the student will SEE', () => {
    DEPENDENT.forEach((l) => store().recordLine(l));
    toggle(1);
    const saved = store().serialize();
    store().clearAll();

    const out = loadAnalyticSession(saved as unknown as Record<string, unknown>, '');
    expect(store().lines).toEqual(DEPENDENT);
    expect(store().disabled).toEqual([1]);
    expect(ids()).toEqual(['A']);
    // the cevian's missing side end is reported on the cevian's own sentence
    expect(out.failed).toBe(1);
    expect(store().loadAudit?.failed).toEqual([{ line: 'CD גובה לצלע AB', reason: 'unknown-reference' }]);
  });

  it('a muted line that no longer READS is named by the audit (the drift net covers muted rows too)', () => {
    loadAnalyticSession({ app: 'analytic-builder', version: 1, lines: ['A(0,0)', 'בלה בלה'], seed: 0, disabled: [1] }, '');
    expect(store().disabled).toEqual([1]);
    expect(store().loadAudit?.failed.map((f) => f.line)).toEqual(['בלה בלה']);
  });

  it('an out-of-range or malformed index in a hand-edited file mutes nothing', () => {
    loadAnalyticSession({ app: 'analytic-builder', version: 1, lines: ['A(0,0)'], seed: 0, disabled: [5, -1, 0.5, 'x'] }, '');
    expect(store().disabled).toEqual([]);
  });
});
