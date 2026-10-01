/**
 * The cross-product checks for the LETTER POPOVER's rename + swap (#1631), written per docs/28 §5c.
 *
 * Operator, 2026-10-01: *"if a letter is occupied, it offers to switch letters … we want that same
 * mechanism now for analytics and also for the 3d tool"*. The popover is one component
 * (`shell/frame/LetterPopover`), but what it OFFERS rides on each product's own answers — a store whose
 * rename refused without a holder would hide the swap button in that builder alone, and a swap that
 * dropped a statement would be a delete wearing a swap's name (#1013). Neither is visible from `shell/`,
 * which may not import a product, so each tree hands its REAL operations over and these checks run once.
 *
 * The rows are the properties the rulings rest on:
 *
 *  - **a taken letter is refused WITH its holder, in both directions** (ADR-520 / #238 the holder;
 *    ADR-532 / #1199 «always allow switching names of nodes» — the offer must not depend on which of the
 *    two points the student clicked first). The offer is decided by the popover's own `swapOffered`, the
 *    function its JSX calls — never a copy.
 *  - **the refusal changes nothing.**
 *  - **the swap exchanges, it never deletes**: every statement survives, the figure keeps the same set of
 *    point letters and the same number of points, and the two letters really did change places.
 *  - **one undo restores the session exactly**, and the swap works the other way round too.
 *
 * ## Plugging a builder in
 *
 * A tree adds a thin lock that builds a {@link LetterSwapSubject} from its own store and calls
 * {@link letterSwapFaults} per case. Live: `src/__tests__/letter-swap-1631.test.ts` (2-D),
 * `src3d/__tests__/letter-swap-1631.test.ts` (3-D). The analytic builder joins with the same file in its
 * own tree when its popover lands (#1631 part 3) — nothing here changes for it.
 */
import { swapOffered, type LetterRenameResult, type LetterSwapResult } from '../../frame/letterOffer';

export interface LetterSwapSubject {
  /** Reset the session and build a figure in which `a` and `b` are both taken, through the product's own input. */
  setup: () => void;
  /** the two letters to exchange */
  a: string;
  b: string;
  /** The product's REAL rename, answered in the popover's vocabulary — the same callable its popover wiring uses. */
  rename: (from: string, to: string) => LetterRenameResult;
  /** The product's REAL swap — the same callable its popover's offer and its typed form reach. */
  swap: (a: string, b: string) => LetterSwapResult;
  /** One step of the product's undo. */
  undo: () => void;
  /** The session's statements as the student reads them (the step rows' text), in order. */
  statements: () => string[];
  /** The letters of the figure's points (derived, not read off the statements). */
  points: () => string[];
}

const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
const sorted = (x: readonly string[]) => [...x].sort();

/** Every violated property, named. Empty array = the builder conforms. */
export function letterSwapFaults(s: LetterSwapSubject): string[] {
  const faults: string[] = [];
  const check = (ok: boolean, fault: string) => {
    if (!ok) faults.push(fault);
  };
  const { a, b } = s;

  s.setup();
  const S0 = s.statements();
  const P0 = sorted(s.points());
  check(S0.length > 0, 'setup() built no statements — the rest of the checks would prove nothing');
  check(P0.includes(a) && P0.includes(b), `setup() did not draw both ${a} and ${b} — the rest of the checks would prove nothing`);

  // 1 — a taken letter is refused WITH its holder, and the swap is offered, in BOTH directions
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    const r = s.rename(from, to);
    check(!r.ok, `rename ${from}→${to} onto a TAKEN letter was accepted — it would merge two points`);
    if (!r.ok) {
      check(r.reason === 'taken', `rename ${from}→${to} was refused as «${r.reason}», not as a taken letter`);
      check(!!r.holder && r.holder.text.trim().length > 0, `rename ${from}→${to} named no holder — «the letter is taken» is a dead end`);
      check(swapOffered(r.holder), `the popover does not OFFER the swap for ${from}→${to}`);
    }
    // 2 — and the refusal changed nothing
    check(same(s.statements(), S0), `the refused rename ${from}→${to} changed the statements`);
  }

  // 3 — the swap exchanges, it never deletes
  const r = s.swap(a, b);
  check(r.ok, `swap ${a}↔${b} was refused`);
  const S1 = s.statements();
  const P1 = sorted(s.points());
  check(S1.length === S0.length, `swap ${a}↔${b} changed the NUMBER of statements (${S0.length} → ${S1.length}) — a swap never deletes`);
  check(P1.length === P0.length, `swap ${a}↔${b} changed the number of points (${P0.length} → ${P1.length})`);
  check(same(P1, P0), `swap ${a}↔${b} changed the figure's set of letters (${P0.join('')} → ${P1.join('')})`);
  check(!same(S1, S0), `swap ${a}↔${b} reported success and changed no statement`);

  // 4 — ONE undo restores the session exactly
  s.undo();
  check(same(s.statements(), S0), `one undo after swap ${a}↔${b} did not restore the statements`);
  check(same(sorted(s.points()), P0), `one undo after swap ${a}↔${b} did not restore the points`);

  // 5 — the other way round is the same exchange
  const back = s.swap(b, a);
  check(back.ok, `swap ${b}↔${a} was refused — the exchange must not depend on the order`);
  check(same(s.statements(), S1), `swap ${b}↔${a} is not the same exchange as ${a}↔${b}`);
  s.undo();
  check(same(s.statements(), S0), `one undo after swap ${b}↔${a} did not restore the statements`);

  return faults;
}
