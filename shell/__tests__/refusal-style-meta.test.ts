/**
 * #1995 stage 5 ([ADR-W-154](../../docs/06w-decisions-workspace.md#adr-w-154)) — THE META-LOCK: the refusal-style
 * ratchet is fed deliberately broken rows and baselines, and each is shown to be caught. A shared assertion that
 * passed everything would let all four thin locks go green while the one-next-step rule is held by nothing.
 */
import { describe, expect, it } from 'vitest';
import { engineTextFaults, hasNextStep, refusalStyleFaults, saysNone, type Baseline, type Row } from './fixtures/refusal-style';

/** 21 clean rows (the lock is vacuous at ≤ 20), each with 2-D's own retry hint as its step. */
const clean = (n = 21): Row[] =>
  Array.from({ length: n }, (_, i) => ({ label: `r${i}`, key: `k${i}`, he: `הנתון «AB = ${i}» סותר את «משולש ABC». אפשר לנסות סדר אחר, לנסח מחדש, או לבנות את זה בכמה צעדים קטנים.` }));
const empty: Baseline = { queuedCap: {}, entries: {} };
const NO_STEP = 'הנקודה P אינה על הישר.';

describe('#1995 stage 5 — the refusal-style lock can fail', () => {
  it('a conforming product passes', () => {
    expect(refusalStyleFaults('x', clean(), empty)).toEqual([]);
  });

  it('catches an internal id, an engine word and an untyped Latin word', () => {
    expect(engineTextFaults('לא ניתן לבנות את T: המעגלים circle-O ו-tanaux-OP אינם נחתכים')).not.toEqual([]);
    expect(engineTextFaults('הנקודה @ctr-O לא נמצאה')).not.toEqual([]);
    expect(engineTextFaults('the solver did not converge')).not.toEqual([]);
    expect(engineTextFaults('הנתון references an unknown point')).not.toEqual([]);
    // …but not the student's algebra in a taught example, a point-name run, or a key name
    expect(engineTextFaults('בחרו אות אחרת, למשל: x=t(k-1, 5-k, -2)')).toEqual([]);
    expect(engineTextFaults('ריבוע ABCD — לחצו Enter')).toEqual([]);
    const rows = [...clean(), { label: 'leak', key: 'k', he: 'המעגל circle-O. נסו שוב.' }];
    expect(refusalStyleFaults('x', rows, empty).join('\n')).toMatch(/x:leak \(k\): the id-shaped token «circle-O»/);
  });

  it('catches a row with no next step that is not on the baseline', () => {
    const rows = [...clean(), { label: 'bare', key: 'k', he: NO_STEP }];
    expect(refusalStyleFaults('x', rows, empty).join('\n')).toMatch(/x:bare \(k\): no next step/);
    const listed: Baseline = { queuedCap: { x: 1 }, entries: { 'x:bare': { key: 'k', reason: 'queued', note: 'batch 1' } } };
    expect(refusalStyleFaults('x', rows, listed)).toEqual([]);
  });

  it('catches a baseline entry whose row now passes (the baseline only shrinks)', () => {
    const b: Baseline = { queuedCap: { x: 1 }, entries: { 'x:r0': { key: 'k0', reason: 'queued', note: 'batch 1' } } };
    expect(refusalStyleFaults('x', clean(), b).join('\n')).toMatch(/x:r0 .* remove it from the baseline/);
  });

  it('catches a stale baseline entry, and leaves another product’s entries alone', () => {
    const b: Baseline = { queuedCap: {}, entries: { 'x:gone': { key: 'k', reason: 'plain-none', note: '«…»' }, 'y:other': { key: 'k', reason: 'queued', note: '' } } };
    expect(refusalStyleFaults('x', clean(), b)).toEqual(['x:gone: stale baseline entry (no such row)']);
  });

  it('catches a queued backlog that grew past its cap', () => {
    const rows = [...clean(), { label: 'a', key: 'k', he: NO_STEP }, { label: 'b', key: 'k', he: NO_STEP }];
    const b: Baseline = {
      queuedCap: { x: 1 },
      entries: { 'x:a': { key: 'k', reason: 'queued', note: '' }, 'x:b': { key: 'k', reason: 'queued', note: '' } },
    };
    expect(refusalStyleFaults('x', rows, b).join('\n')).toMatch(/2 queued entries exceed the cap 1/);
  });

  it('catches a vacuous product (≤ 20 rows)', () => {
    expect(refusalStyleFaults('x', clean(20), empty).join('\n')).toMatch(/only 20 rows/);
  });
});

describe('#1995 stage 5 — the heuristic, as measured', () => {
  it('reads a step: a plural imperative (with ו־), a modal, an example, a taught form', () => {
    expect(hasNextStep('הגדירו אותה תחילה.')).toBe(true);
    expect(hasNextStep('המשפט לא נבנה ונסו שוב.')).toBe(true);
    expect(hasNextStep('אפשר לנסות סדר אחר, לנסח מחדש, או לבנות את זה בכמה צעדים קטנים.')).toBe(true);
    expect(hasNextStep('כתיבה אחרת, למשל «AB = 3».')).toBe(true);
    expect(hasNextStep('כדי לומר שהקשת שווה ל-40: «קשת AB = 40°».')).toBe(true);
  });

  it('does not read a step in a singular past tense, a negated modal or a bare statement', () => {
    expect(hasNextStep('זו הנקודה שהכלי בחר.')).toBe(false);
    expect(hasNextStep('לא אפשר לבנות את זה.')).toBe(false);
    expect(hasNextStep(NO_STEP)).toBe(false);
  });

  it('reads a plain "there is none"', () => {
    expect(saysNone('זו מגבלה של הכלי.')).toBe(true);
    expect(saysNone('זה כבר קיים באיור — אין מה להוסיף.')).toBe(true);
    expect(saysNone(NO_STEP)).toBe(false);
  });

  /**
   * The measured FALSE PASSES (the text at 99358597), pinned: each reads as a step but is not one. A regex change that
   * "fixes" one flips its row onto the baseline — this pin makes that change visible and reviewed, not silent.
   */
  it.each([
    ['3d err.twoParams — «(למשל a)» illustrates the problem, it is not a remedy', 'אפשר פרמטר אחד בלבד בציור (למשל a)'],
    ['3d err.incircleNeedsTriangle — «ניתן לשרטט רק…» states a limit', 'מעגל חסום ניתן לשרטט רק במשולש — למרובע כללי אין מעגל חסום.'],
    ['complex whyMaybeMulti — «יש לערך…» means "the value has"', 'ייתכן שיש לערך כמה אפשרויות — הוא אינו נקבע בוודאות'],
    ['3d err.signNotSelectable — «ערכו» is "its value", not "edit!"', 'הפרמטר k מוגדר בסרטוט, אך ערכו נקבע על ידי הקשר שהגדיר אותו — לא ניתן לבחור לו סימן'],
  ])('known false pass: %s', (_why, he) => {
    expect(hasNextStep(he)).toBe(true);
  });
});
