/**
 * The TOOL ROW's order is a contract, not a convention (#1376).
 *
 * The operator has now reported this class twice. The first time
 * ([ADR-W-023](../../docs/06w-decisions-workspace.md#adr-w-023), *"the buttons are not located in
 * same locations"*) produced `shell/ToolButton`, which unified how the buttons LOOK. It did not
 * unify the order, because the order lives in each product's JSX — so when #1372 added
 * «העתק קישור», three trees were edited with one anchor (after 📂 טען) and analytic with another
 * (before the manual button), and it shipped 5th in one builder and 3rd in the others.
 *
 * Nothing decided that. Prose in a docblock stated the rule — *"שמור/טען FIRST, the image exports
 * next, the manual last"* — and prose is not a mechanism. So the order becomes data here, and each
 * product supplies its actions by ID and gets them back in the one canonical sequence. A product
 * that lacks an action simply omits it; a product cannot place one differently, because placement
 * is no longer something it expresses.
 */
import type { ReactNode } from 'react';

/**
 * Every tool-row action, in THE order, whether or not a given builder has it.
 *
 * Session actions first (they act on the whole session), then the exports (they act on the current
 * figure), then the manual (it acts on nothing). That grouping is the level model from docs/28 §4a;
 * the sequence within it is 2-D's, which is the row the operator has looked at longest.
 */
export const TOOL_ROW_ORDER = [
  'save',
  'load',
  'share',
  'copyImage',
  'saveImage',
  'saveQuestion',
  'manual',
] as const;

export type ToolActionId = (typeof TOOL_ROW_ORDER)[number];

export interface ToolAction {
  id: ToolActionId;
  node: ReactNode;
}

/**
 * A product's actions, in canonical order.
 *
 * Order-insensitive by construction: the caller may list them however reads best in its own file,
 * and the row still renders the same everywhere. Unknown ids cannot occur (the type forbids them);
 * duplicates keep their relative order, so a product that renders two variants of one action is not
 * silently reordered.
 */
export function orderToolActions(actions: readonly ToolAction[]): ReactNode[] {
  const rank = new Map<ToolActionId, number>(TOOL_ROW_ORDER.map((id, i) => [id, i]));
  return [...actions]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (rank.get(x.a.id)! - rank.get(y.a.id)!) || x.i - y.i)
    .map(({ a }) => a.node);
}
