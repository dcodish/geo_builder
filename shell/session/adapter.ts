/**
 * What a builder must provide for the session OFFER to work the same way in all of them (#1238,
 * ADR-W-068) — and the shape the cross-product lock drives (docs/28 §5c).
 *
 * `shell/` may never import a product tree, so "every builder offers rather than restores" cannot
 * be checked by calling all four. The §5c pattern instead: the product's decision is a CALLABLE,
 * the checks live once in `shell/__tests__/fixtures/`, and each tree has a thin lock that hands its
 * own adapter to the shared suite. An adapter is therefore not test scaffolding — it is the real
 * wiring the app uses, exposed as a value rather than buried in a JSX prop, which is what makes it
 * checkable at all.
 *
 * Every method is the product's own: the payload is its save envelope, the restore is its load
 * path, and "empty" is whatever an empty canvas means in that tool (a fact list, a line list).
 */
import type { SessionSpec } from './persist';

export interface SessionAdapter {
  /** Where this product stores its session. */
  readonly spec: SessionSpec;
  /**
   * The current session's payload — the product's save-envelope text — or **null when the session
   * is empty**. The null is the contract that stops a builder erasing the session it is about to
   * offer: every builder boots empty, so a persister that wrote its boot state would wipe storage
   * before the banner could render.
   */
  snapshot(): string | null;
  /**
   * Load a stored payload through the product's OWN load path — envelope validation, load audit,
   * re-lowering and all. Resolves false when the payload is refused, in which case the current
   * session must be left exactly as it was.
   */
  restore(payload: string): Promise<boolean>;
  /** Is the session empty right now? */
  isEmpty(): boolean;
  /** Return the session to empty (the product's own clear). */
  reset(): void;
}
