/**
 * THE POINT-NAME ATOM, ONCE (#2621 C, [ADR-AG-395](../../docs/06c-decisions-analytic.md#adr-ag-395)).
 *
 * A point is named by a capital Latin letter with an optional index, a digit run (#2075: «A», «F1», «D₂», «X₁₂»), and an optional PRIME
 * («A'»: the book's «A ו-A' הן נקודות החיתוך…», p10-9 ב). The atom was spelled inline in every reader — the grammar's
 * `NAME`, the length tokenizer's pair, the rename dialog's `POINT_NAME`, the store's, the ask lane's — so a prime had
 * to be taught to some thirty copies, and a copy that missed it would read «A'B» as «A» and «B» (2-D's silent drop,
 * #2621's finding). That is docs/17 §3's "inline lexical fragments" chokepoint (the #267 lesson): every reader
 * composes this one atom, and `analytic-name-atom-ratchet.test.ts` counts the inline copies left, which may only go
 * down.
 *
 * The prime is ASCII `'` here: the boundary (`orthography`) folds every prime glyph to it through the shared
 * `shell/primes` fold, so a reader never sees ′ or ’. A prime glued to a LOWERCASE letter is an English possessive
 * («A's»), never a prime, so the atom does not take it. The drawn label renders it as A′ ({@link displayPointName}).
 *
 * Regex SOURCE with no capture group and no anchor, so composing it never renumbers a rule.
 */
import { displayPrimes } from '../../shell/primes';
import { NAME_ATOM, isPointName as isNameAtom, splitPointNames as splitNameAtoms } from '../../shell/indexedName';

/**
 * One point name: a capital, an optional index (a digit run, ADR-AG-398), an optional prime — the SHARED atom since #2624
 * ([ADR-AG-446](../../docs/06c-decisions-analytic.md#adr-ag-446), [ADR-W-197](../../docs/06w-decisions-workspace.md#adr-w-197)):
 * 2-D reads the same name, so the atom moved to `shell/indexedName` and this module composes it. Its possessive guard is
 * case-blind safe (a rule compiled with `i` keeps «A'B'»), where the inline copy's `(?![a-z])` was not.
 */
export const POINT_NAME = NAME_ATOM;

/** "Is this whole string one point name?" */
export const isPointName = (s: string): boolean => isNameAtom(s);

/** A run of point names split into its names: «AA'B» → A, A', B. */
export const splitPointNames = (run: string): string[] => splitNameAtoms(run);

/**
 * A REGEX LITERAL with `ℕ` standing for the atom — so a grammar pattern that carries Hebrew stays a regex literal (the
 * inline-Hebrew ratchet counts string literals, never a pattern) and still composes the one atom. Flags are kept.
 */
export const withPointName = (re: RegExp): RegExp => new RegExp(re.source.split('ℕ').join(POINT_NAME), re.flags);

/** How a point name is DRAWN — the prime as ′ (U+2032), the glyph 3-D's canvas uses. */
export const displayPointName = (id: string): string => displayPrimes(id);
