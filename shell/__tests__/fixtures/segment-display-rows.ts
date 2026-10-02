/**
 * The cross-product checks for the SEGMENT MENU's hide / dashed (#1653), written per docs/28 §5c.
 *
 * Operator, 2026-10-02: *"in the analytic tool we dont have an option to click on a segment and hide it
 * like we have in 2d"*. The menu is one component (`shell/frame/SegmentMenu`), but what it DOES rides on
 * each product's own store, renderer and save file — a store whose hide also dropped the segment from the
 * construction would make a hidden side unmeasurable in that builder alone, and a save file that forgot
 * the dash would undo the student's choice on reload. Neither is visible from `shell/`, which may not
 * import a product, so each tree hands its REAL operations over and these checks run once.
 *
 * The rows are the properties the issue's locks name:
 *
 *  - **hide → not drawn**: the product's own rendered canvas has no ink for the segment (a ghost edit
 *    affordance may stay — `segInk`'s `ghost`);
 *  - **still there**: the statements are unchanged and the product's own measure path still answers;
 *  - **show restores** (the menu's second press), and — where the product records the choice in its undo
 *    history — **one undo restores**;
 *  - **dashed survives save → load**, and so does hidden; un-hiding brings the dash back.
 *
 * ## Plugging a builder in
 *
 * A tree adds a thin lock that builds a {@link SegmentDisplaySubject} from its own store and calls
 * {@link segmentDisplayFaults}. Live: `src/__tests__/segment-display-1653.test.tsx` (2-D),
 * `src-analytic/__tests__/segment-display-1653.test.tsx` (analytic). 3-D has no segment click surface yet
 * (ADR-W-106 "3-D").
 */

/** How the product's REAL canvas inks the segment right now. `absent` = no element for it at all. */
export type InkSeen = 'solid' | 'dashed' | 'ghost' | 'absent';

export interface SegmentDisplaySubject {
  /** Reset the session and build a figure with the segment, through the product's own input. */
  setup: () => void;
  /** The product's REAL toggles — the callables its segment menu is wired to. */
  toggleHidden: () => void;
  toggleDashed: () => void;
  /** Read off the product's real rendered canvas (its renderer, its scene builder, its store's state). */
  ink: () => InkSeen;
  /** The product's own measure path still answers for the segment (or it still exists with both ends placed). */
  measurable: () => boolean;
  /** The session's statements as the student reads them, in order. */
  statements: () => string[];
  /**
   * One step of the product's undo — PRESENT only when the product records a display choice in its undo
   * history. 2-D does not (FR-RN-10: a display preference, undone by the menu's second press); the analytic
   * builder does (its undo slice carries the ask lane's `shown` too). Absent = the undo row is not run.
   */
  undo?: () => void;
  /** The product's real save → clear → load round trip (its serializer, its loader). */
  saveLoad: () => void;
}

const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((v, i) => v === y[i]);

/** Every violated property, named. Empty array = the builder conforms. */
export function segmentDisplayFaults(s: SegmentDisplaySubject): string[] {
  const faults: string[] = [];
  const check = (ok: boolean, fault: string) => {
    if (!ok) faults.push(fault);
  };

  s.setup();
  const S0 = s.statements();
  check(S0.length > 0, 'setup() built no statements — the rest of the checks would prove nothing');
  check(s.ink() === 'solid', `setup() did not draw the segment solid (saw «${s.ink()}») — the rest of the checks would prove nothing`);
  check(s.measurable(), 'the segment is not measurable before any hide — the "still measurable" check would prove nothing');

  // 1 — hide: not drawn, still there
  s.toggleHidden();
  const hiddenInk = s.ink();
  check(hiddenInk === 'ghost' || hiddenInk === 'absent', `a hidden segment is still inked («${hiddenInk}»)`);
  check(same(s.statements(), S0), 'hiding a segment changed the statements — a display choice is not a given');
  check(s.measurable(), 'a hidden segment is no longer measurable — hiding must keep it for every reference');

  // 2 — one undo restores (where the product records it), else the menu's show restores
  if (s.undo) {
    s.undo();
    check(s.ink() === 'solid', `one undo after a hide did not draw the segment again (saw «${s.ink()}»)`);
    check(same(s.statements(), S0), 'the undo of a hide changed the statements');
    s.toggleHidden(); // hide again, for the show row
  }
  s.toggleHidden();
  check(s.ink() === 'solid', `«show» after a hide did not draw the segment solid again (saw «${s.ink()}»)`);

  // 3 — dashed, and it survives save → load
  s.toggleDashed();
  check(s.ink() === 'dashed', `«dashed» did not dash the segment (saw «${s.ink()}»)`);
  if (s.undo) {
    s.undo();
    check(s.ink() === 'solid', `one undo after «dashed» did not restore the solid stroke (saw «${s.ink()}»)`);
    s.toggleDashed();
  }
  s.saveLoad();
  check(s.ink() === 'dashed', `a dashed segment came back «${s.ink()}» after save → load`);
  check(same(s.statements(), S0), 'save → load changed the statements');

  // 4 — hidden survives save → load, and un-hiding remembers the dash
  s.toggleHidden();
  s.saveLoad();
  const reloaded = s.ink();
  check(reloaded === 'ghost' || reloaded === 'absent', `a hidden segment came back inked («${reloaded}») after save → load`);
  s.toggleHidden();
  check(s.ink() === 'dashed', `un-hiding a dashed segment lost its dash (saw «${s.ink()}»)`);

  return faults;
}
