/**
 * UNDO / REDO (#1098) — the row member this builder was missing.
 *
 * Operator, 2026-09-16: *"I wanted the analytics to look like the other tools with all aspects"*.
 * Undo was the one item on that list that is a CAPABILITY rather than a style.
 *
 * It is cheaper here than anywhere else in the suite, and for the reason that also makes the save
 * file a parser-drift net (ADR-AG-055): **the session IS the ordered line list, and the figure is
 * derived from it.** There is no position, parameter value or solver state to roll back, so a
 * history entry is a list of strings plus the seed, and an undone figure is RE-DERIVED rather than
 * restored. These tests assert that property directly — undo must return not merely the same lines
 * but the same figure.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { commitRecord, decideEditHost, decideSubmit, decideToggle } from '../app/submit';
import { activeOf, activePins } from '../app/active';
import { analyticI18n } from '../i18n';
import { hostTag } from '../../shell/cevianHost';
import { CEVIAN_HOST_TAG } from '../../shell/__tests__/fixtures/geo-input-parity';

const store = () => useAnalyticStore.getState();
const temporal = () => useAnalyticStore.temporal.getState();

const fresh = () => {
  store().clearAll();
  temporal().clear();
};

beforeEach(fresh);

describe('#1098 — a step can be taken back', () => {
  it('undo removes the last line, redo puts it back', () => {
    store().recordLine('A(0,0)');
    store().recordLine('B(4,0)');
    expect(store().lines).toEqual(['A(0,0)', 'B(4,0)']);

    store().undo();
    expect(store().lines).toEqual(['A(0,0)']);

    store().redo();
    expect(store().lines).toEqual(['A(0,0)', 'B(4,0)']);
  });

  it('and the FIGURE that comes back is the same figure, not just the same text', () => {
    // The property the line-list design buys: nothing is restored, everything is re-derived.
    const lines = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC'];
    for (const l of lines) store().recordLine(l);
    const before = derive(store().lines, store().seed);

    store().recordLine('נתון הישר y=1');
    store().undo();

    const after = derive(store().lines, store().seed);
    expect(after.figure.points).toEqual(before.figure.points);
    expect(after.faults).toEqual([]);
  });

  it('undoing a DELETE brings the line back where it was', () => {
    for (const l of ['A(0,0)', 'B(4,0)', 'C(0,3)']) store().recordLine(l);
    store().removeLine(1);
    expect(store().lines).toEqual(['A(0,0)', 'C(0,3)']);
    store().undo();
    expect(store().lines).toEqual(['A(0,0)', 'B(4,0)', 'C(0,3)']);
  });

  it('undoing an EDIT restores the text that was typed', () => {
    store().recordLine('A(0,0)');
    store().replaceLine(0, 'A(9,9)');
    expect(store().lines).toEqual(['A(9,9)']);
    store().undo();
    expect(store().lines).toEqual(['A(0,0)']);
  });

  it('CLEAR ALL is undoable — the press that recovers it must not be greyed out', () => {
    // This is why the buttons read availability from the history rather than from the line count:
    // a count-based test would disable undo on an empty canvas, which is exactly when it is needed.
    for (const l of ['A(0,0)', 'B(4,0)']) store().recordLine(l);
    store().clearAll();
    expect(store().lines).toEqual([]);
    expect(temporal().pastStates.length).toBeGreaterThan(0);
    store().undo();
    expect(store().lines).toEqual(['A(0,0)', 'B(4,0)']);
  });
});

describe('#1098 — what the history does NOT record', () => {
  it('a configuration change rides with its lines — undo restores the figure the student SAW', () => {
    // The E5/STO-5 lesson 2-D records: the seed is in the temporal slice, so «הציגו תצורה אחרת»
    // followed by undo puts back the configuration on screen, not merely the facts.
    store().recordLine('A(0,0)');
    store().goToSeed(7);
    expect(store().seed).toBe(7);
    store().undo();
    expect(store().seed).toBe(0);
  });

  it('an ERROR is not a step — it pushes no history entry', () => {
    store().recordLine('A(0,0)');
    const depth = temporal().pastStates.length;
    store().setError({ key: 'not-handled', detail: 'בלה' });
    expect(temporal().pastStates.length).toBe(depth);
  });

  it('a NOTICE is not a step either', () => {
    store().recordLine('A(0,0)');
    const depth = temporal().pastStates.length;
    store().setNotice('זה כבר ידוע');
    expect(temporal().pastStates.length).toBe(depth);
  });

  it('naming the figure is not a construction step', () => {
    // The same call 2-D made for `figureName`: a name is about the file, not the drawing's history.
    store().recordLine('A(0,0)');
    const depth = temporal().pastStates.length;
    store().setName('בגרות קיץ');
    expect(temporal().pastStates.length).toBe(depth);
    expect(store().name).toBe('בגרות קיץ');
  });

  it('and stepping away clears the message about the line you stepped away from', () => {
    store().recordLine('A(0,0)');
    store().setError({ key: 'not-handled', detail: 'בלה' });
    store().undo();
    expect(store().error).toBeNull();
  });
});

/**
 * #1973 (ADR-AG-430; 2-D's ADR-797) — THE HOST A CEVIAN LINE WAS ACCEPTED IN IS PART OF THE STEP. The submit decision
 * records it with the line (`commitRecord`), `derive` honours it (`pins`), and it follows its line through undo, a delete,
 * an edit and a mute exactly as the line does. The operator's seven lines, through the real decision and the store.
 */
describe('#1973 — the recorded host rides with its line', () => {
  const OPERATOR = ['A(0,0)', 'B(6,0)', 'C(5,4)', 'D(1,3)', 'משולש ABC', 'AE גובה', 'מרובע ABCD'];
  const pins = () => activePins(store().hosts, store().lines.length, store().disabled);
  const current = () => derive(activeOf(store().lines, store().disabled), store().seed, store().seedNames, pins());
  const submit = (line: string) => {
    const v = decideSubmit(line, activeOf(store().lines, store().disabled), store().seed, current());
    if (v.kind === 'record') commitRecord(v, store().recordLine, (k) => k);
    return v.kind;
  };
  const E = () => current().figure.points.find((p) => p.id === 'E');

  it('accepting «AE גובה» records triangle ABC with it; the row shows it, in 2-D’s words', () => {
    for (const l of OPERATOR) expect(submit(l), l).toBe('record');
    expect(store().hosts).toEqual({ 5: ['A', 'B', 'C'] });
    expect(store().lines[5]).toBe('AE גובה'); // the student's own words
    const host = current().hosts.find((h) => h.index === OPERATOR.indexOf(CEVIAN_HOST_TAG.row))?.host;
    for (const lng of ['he', 'en'] as const) expect(hostTag(host, (k, o) => analyticI18n.t(k, { ...o, lng }) as string)?.text).toBe(CEVIAN_HOST_TAG[lng]);
    const e = E()!;
    expect([e.x, e.y].map((n) => n.toFixed(2))).toEqual(['5.65', '1.41']); // the operator's screenshot
  });

  it('undo takes it back with its line, redo restores both', () => {
    for (const l of OPERATOR) submit(l);
    store().undo();
    store().undo();
    expect(store().hosts).toEqual({});
    store().redo();
    expect(store().hosts).toEqual({ 5: ['A', 'B', 'C'] });
  });

  it('a delete above it moves it with its line; deleting the line drops it', () => {
    for (const l of OPERATOR) submit(l);
    store().removeLine(3);
    expect(store().hosts).toEqual({ 4: ['A', 'B', 'C'] });
    store().removeLine(4);
    expect(store().hosts).toEqual({});
  });

  it('an EDIT that brings a second shape above it keeps the height the triangle’s — unpinned, the line would ask', () => {
    for (const l of OPERATOR) submit(l);
    const edit = decideEditHost(3, 'מרובע ABCD', store().lines, store().disabled, store().seed, store().seedNames, store().hosts);
    expect(edit).toEqual({ ok: true });
    store().replaceLine(3, 'מרובע ABCD', edit.host?.ring);
    expect(current().faults.filter((f) => f.index === 5)).toEqual([]);
    expect(current().hosts.find((h) => h.index === 5)?.host.ring).toEqual(['A', 'B', 'C']);
    expect(derive(store().lines, store().seed).faults.find((f) => f.index === 5)?.code).toBe('ambiguous-cevian');
  });

  it('an edit of the cevian row records the host its NEW sentence resolves to', () => {
    for (const l of OPERATOR.slice(0, 5)) submit(l);
    submit('AE גובה לצלע BC');
    expect(store().hosts).toEqual({});
    const edit = decideEditHost(5, 'AE גובה', store().lines, store().disabled, store().seed, store().seedNames, store().hosts);
    expect(edit).toEqual({ ok: true, host: { ring: ['A', 'B', 'C'], kind: 'triangle' } });
    store().replaceLine(5, 'AE גובה', edit.host?.ring);
    expect(store().hosts).toEqual({ 5: ['A', 'B', 'C'] });
  });

  it('UN-MUTING a second shape above it keeps the height the triangle’s — unpinned, the un-mute was refused', () => {
    for (const l of OPERATOR.slice(0, 5)) submit(l);
    submit('מרובע ABCD');
    store().setDisabled([5]);
    expect(submit('AE גובה')).toBe('record');
    expect(store().hosts).toEqual({ 6: ['A', 'B', 'C'] });
    expect(decideToggle(5, store().lines, store().disabled, store().seed, current(), store().hosts)).toEqual({ kind: 'apply', disabled: [] });
    expect(decideToggle(5, store().lines, store().disabled, store().seed, current()).kind).toBe('refused'); // no hosts: today's ask
  });
});
