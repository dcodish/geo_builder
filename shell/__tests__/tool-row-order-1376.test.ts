/**
 * #1376 — the tool row's ORDER is mechanical, so it cannot drift again.
 *
 * The operator reported this class twice. The first time produced `shell/ToolButton`, which unified
 * how the buttons LOOK; the order stayed in each product's JSX, so when #1372 added «העתק קישור»
 * three trees anchored it after 📂 טען and analytic anchored it before the manual button — 3rd in
 * three builders, 5th in one, and nothing could see it.
 *
 * These rows test the DECISION (`orderToolActions`), not where it is called from: a product can no
 * longer express placement at all, so the only thing left to get wrong is this function.
 */
import { describe, expect, it } from 'vitest';
import { TOOL_ROW_ORDER, orderToolActions, type ToolAction, type ToolActionId } from '../frame/toolRow';

/** Node stands in for JSX — the function never inspects it, so a string is honest here. */
const act = (id: ToolActionId): ToolAction => ({ id, node: id });

describe('#1376 — a product supplies actions by id and gets THE order back', () => {
  it('sorts an arbitrary listing into the canonical sequence', () => {
    const scrambled = ['manual', 'share', 'load', 'saveImage', 'save', 'copyImage'] as const;
    expect(orderToolActions(scrambled.map(act))).toEqual([
      'save',
      'load',
      'share',
      'copyImage',
      'saveImage',
      'manual',
    ]);
  });

  it('THE REPORTED DEFECT: share sits 3rd, never after the image exports', () => {
    // analytic's own listing, in the order its file happens to read.
    const analytic = ['save', 'load', 'copyImage', 'saveImage', 'share', 'manual'] as const;
    const row = orderToolActions(analytic.map(act));
    expect(row.indexOf('share'), 'immediately after load, as in every sibling').toBe(2);
    expect(row.indexOf('share')).toBeLessThan(row.indexOf('copyImage'));
  });

  it('a product that LACKS an action just omits it — the row closes up', () => {
    // complex and analytic have no «הורידו שאלה»; 2-D and 3-D do.
    const withQuestion = orderToolActions((['save', 'load', 'share', 'copyImage', 'saveImage', 'saveQuestion', 'manual'] as const).map(act));
    const without = orderToolActions((['save', 'load', 'share', 'copyImage', 'saveImage', 'manual'] as const).map(act));
    expect(without).toEqual(withQuestion.filter((x) => x !== 'saveQuestion'));
  });

  it('the listing ORDER in a product file cannot change the rendered row', () => {
    const ids = ['save', 'load', 'share', 'copyImage', 'manual'] as const;
    const forwards = orderToolActions(ids.map(act));
    const backwards = orderToolActions([...ids].reverse().map(act));
    expect(backwards).toEqual(forwards);
  });

  it('two variants of one action keep their relative order (stable sort)', () => {
    const rows = orderToolActions([
      { id: 'share', node: 'share-a' },
      { id: 'save', node: 'save' },
      { id: 'share', node: 'share-b' },
    ]);
    expect(rows).toEqual(['save', 'share-a', 'share-b']);
  });

  it('session actions come before exports, and the manual is last (the level model)', () => {
    const i = (id: ToolActionId) => TOOL_ROW_ORDER.indexOf(id);
    expect(i('save')).toBeLessThan(i('copyImage'));
    expect(i('load')).toBeLessThan(i('copyImage'));
    expect(i('share')).toBeLessThan(i('copyImage'));
    expect(i('manual')).toBe(TOOL_ROW_ORDER.length - 1);
  });
});
