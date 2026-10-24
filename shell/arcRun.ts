/**
 * WHICH LETTER OF AN ARC'S THREE IS THE CENTRE — ONE READER FOR EVERY ARC NOUN AND EVERY BUILDER (#2486).
 *
 * Operator ruling, 2026-10-24 (ballot card e8, answer A): *"The middle letter is the centre, for the whole
 * family. «רבע מעגל AOB», «חצי מעגל AOB» and «גזרה AOB» all have centre O, as in ∠AOB."*
 *
 * Before this module the reading was hand-written five times — 2-D's quarter circle (first letter), 2-D's
 * semicircle (first letter), 2-D's sector (middle letter with an O-family override, ADR-357 Am.), the #1012
 * re-reader's rewrite (first letter, for every noun) and analytic's sector/quarter rule (its own two copies).
 * When ADR-357's amendment flipped the sector, the other four stayed behind and the same three letters drew a
 * different centre in a different noun, a different builder, and in the sentence the tool taught back.
 *
 * The reading is the sector's MEASURED rule, kept exactly, so no «גזרה» changes: the MIDDLE letter is the
 * centre, except that an O-family letter (O, P, Q, optionally indexed: O1) written FIRST is the centre when
 * the middle letter is not O-family («רבע מעגל OAB» keeps centre O). The two ends keep their written order,
 * which is the direction every rule draws its arc in (from the first end to the second).
 *
 * Text only: it reasons about label runs, never about points, so it is shell (BOUNDARIES.json), like the
 * other shared readers here. A central ANGLE («זוית מרכזית XYZ») is a different construct with its own
 * vertex rule and does not use this.
 */

/** O, P, Q (optionally indexed) — the letters a textbook reserves for a centre. */
const O_FAMILY = /^[OPQ]\d*$/i;

/** The roles a 3-run names: the centre, and the two ends in written order. */
export interface ArcRunRoles {
  centre: string;
  ends: [string, string];
}

/**
 * e8 A (2026-10-24) + ADR-357 Am.: the MIDDLE letter is the centre, unless the FIRST is an O-family letter
 * and the middle is not. The returned strings are the caller's, unchanged (no case folding).
 */
export function arcRunRoles(run: readonly [string, string, string] | readonly string[]): ArcRunRoles {
  const [x, y, z] = run;
  return O_FAMILY.test(x) && !O_FAMILY.test(y) ? { centre: x, ends: [y, z] } : { centre: y, ends: [x, z] };
}

/**
 * The inverse: a 3-run that `arcRunRoles` reads back as exactly this centre with these two ends, or `null`
 * when no bare run can say it (both ends O-family around a centre that is not — «OCP», «PCO» and «COP» all
 * read another letter). Tried in order `a·centre·b`, `b·centre·a`, `centre·a·b`, so the taught spelling is
 * the angle notation whenever it reads back, and keeps the ends' given order when it can.
 */
export function spellArcRun(centre: string, a: string, b: string): string | null {
  const same = (x: string, y: string) => x.toUpperCase() === y.toUpperCase();
  for (const run of [[a, centre, b], [b, centre, a], [centre, a, b]] as const) {
    const roles = arcRunRoles(run);
    if (!same(roles.centre, centre)) continue;
    const ends = roles.ends.map((e) => e.toUpperCase()).sort().join(',');
    if (ends === [a, b].map((e) => e.toUpperCase()).sort().join(',')) return run.join('');
  }
  return null;
}
