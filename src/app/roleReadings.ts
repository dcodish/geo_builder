/**
 * WHEN A LETTER RUN ENCODES A ROLE, THE FIGURE DECIDES IT — NOT THE TYPING ORDER (#1012).
 *
 * Operator, 2026-09-15: *"ODC is not drawn but CDO is. When drawing a quarter of a circle, it is not
 * clear what order of nodes to enter so I think the tool should not assume one. So user enters ODC and
 * cannot find a config for that, but it can find a config for CDO so it should propose that one."*
 *
 * ## The class
 *
 * A construct whose letter run encodes a ROLE assignment — «רבע מעגל OAB» means *centre O, ends A and
 * B* — fixes that assignment by POSITION. A student who writes the same three letters in a different
 * order gets an unsatisfiable figure, and a refusal that blames their geometry rather than our
 * reading. The convention is real and was recorded only in a code comment: the catalog row says *"a
 * 90° arc with its two bounding radii"* and never mentions that the first letter is the centre. So the
 * tool asserted a spelling rule it never taught, which is the ADR-W-030 line.
 *
 * Measured on the operator's own figure — «ABC משולש ישר זוית» · «AC=15» · «BC=10» · «O על AC» ·
 * «D על CB» — all six spellings of one drawable quarter:
 *
 * ```
 * ODC  centre O   refused   16.6 s        DOC  centre D   refused   19.5 s
 * OCD  centre O   refused   11.1 s        CDO  centre C   BUILDS     1.1 s
 * DCO  centre D   refused   19.3 s        COD  centre C   BUILDS     0.8 s
 * ```
 *
 * Exactly the two orderings that put C first build. Only the CENTRE matters — the two arms are
 * interchangeable — so three readings, not six.
 *
 * ## The mechanism: re-read, adopt, and TEACH
 *
 * This module answers one question — *what else could that run have meant?* — by **rewriting the
 * utterance** and handing it back to the same parser. Nothing here knows how a quarter circle is
 * built, and no rule grows a second convention; the alternative spelling is a sentence the student
 * could have typed, which is also exactly what we then teach them (ADR-428 obligation 2).
 *
 * Silent adoption would be the #778 violation. The caller commits the reading that builds AND shows
 * its canonical spelling.
 *
 * ## Cost is part of the fix
 *
 * Each WRONG reading is what is expensive (11–19 s of recruiter ladder); the right one costs ~1 s. A
 * naive loop over three centres would turn a 17-second refusal into a 37-second one, so the readings
 * are ordered by a probe that costs nothing: the central angle the construct PINS, measured on the
 * figure the student already has, across the configurations it already samples.
 *
 * On the reported figure the probe is decisive — and this is measured, not assumed:
 *
 * ```
 * centre O:  angle(C,O,D) = 33.7° / 12.7° / 31.2°   at seeds 0,1,2
 * centre D:  angle(C,D,O) = 56.3° / 77.3° / 58.8°
 * centre C:  angle(O,C,D) = 90.0° / 90.0° / 90.0°   <- the quarter's 90°, at every configuration
 * ```
 *
 * `C` rides the triangle's right angle, so its two arms are perpendicular whatever O and D do. The
 * probe puts it first, and the retry costs one second rather than two minutes.
 *
 * **Only readings the probe rates BETTER than the stated one are tried.** A reading no more promising
 * than what the student wrote has not earned a ladder run, and this is what keeps the refusal path —
 * where nothing is satisfiable — close to the cost it has today instead of trebling it.
 */
import type { AnyCommand, Id } from '@/engine';

/** One alternative reading: the sentence to try, and which letter it makes the centre. */
export interface RoleReading {
  /** The utterance rewritten so a different letter leads the run — a sentence a student could type. */
  utterance: string;
  /** The centre this reading proposes. */
  centre: Id;
  /**
   * How far the construct's PINNED central angle is from what this figure already shows, in degrees,
   * at its worst sampled configuration. `null` when the construct pins no angle and the probe has
   * nothing to say. Lower is more promising; 0 means the angle already holds everywhere.
   */
  score: number | null;
}

/** The arc a centre-first construct draws, which is where all three roles are readable. */
type ArcCommand = Extract<AnyCommand, { type: 'arc' }>;

const arcOf = (commands: readonly AnyCommand[]): ArcCommand | null =>
  (commands.find((c) => c.type === 'arc') as ArcCommand | undefined) ?? null;

/**
 * The run of capitals in the utterance that spells these three roles, as written.
 *
 * Matched against the SENTENCE rather than reconstructed, so the rewrite puts the letters back
 * exactly where the student had them and changes nothing else — a radius, a noun, a definite article
 * all survive untouched.
 */
function runIn(utterance: string, letters: readonly Id[]): { at: number; text: string } | null {
  const want = [...letters].sort().join('');
  for (const m of utterance.matchAll(/[A-Z](?:[0-9]?[A-Z]){2}[0-9]?/g)) {
    const parts = m[0].match(/[A-Z][0-9]?/g) ?? [];
    if (parts.length === letters.length && [...parts].sort().join('') === want)
      return { at: m.index ?? 0, text: m[0] };
  }
  return null;
}

/**
 * The central angle this construct PINS, in degrees — the probe's target.
 *
 * A quarter pins 90°, and says so twice: the arc carries `spanDeg`, and an existing-ends quarter also
 * emits the `set-angle`. A general «גזרה» pins nothing (its central angle is a free DOF, ADR-357), and
 * then there is no target and the probe stays silent rather than inventing one.
 */
function pinnedAngle(commands: readonly AnyCommand[]): number | null {
  const set = commands.find((c) => c.type === 'set-angle') as Extract<AnyCommand, { type: 'set-angle' }> | undefined;
  if (set && typeof set.value === 'number') return set.value;
  const arc = arcOf(commands);
  return typeof arc?.spanDeg === 'number' ? arc.spanDeg : null;
}

/** The unsigned angle ∠(a, vertex, b) in degrees, or `null` when a point is missing. */
function angleAt(
  positions: ReadonlyMap<Id, { x: number; y: number }> | Record<Id, { x: number; y: number }>,
  vertex: Id,
  a: Id,
  b: Id,
): number | null {
  const at = (id: Id) =>
    positions instanceof Map ? positions.get(id) : (positions as Record<Id, { x: number; y: number }>)[id];
  const [V, A, B] = [at(vertex), at(a), at(b)];
  if (!V || !A || !B) return null;
  const d = (Math.atan2(A.y - V.y, A.x - V.x) - Math.atan2(B.y - V.y, B.x - V.x)) * (180 / Math.PI);
  return Math.abs(((d + 540) % 360) - 180);
}

/**
 * The other ways this utterance's role run could be read, **best first**, excluding the stated one.
 *
 * `null` when the utterance carries no role-assigned run — the overwhelmingly common case, and the
 * reason this costs nothing on a normal refusal.
 *
 * `sample` is called for each configuration the probe should look at; it returns where the points sit
 * in the figure the student ALREADY has, so the probe adds no solve of its own.
 */
export function roleReadings(
  utterance: string,
  commands: readonly AnyCommand[],
  sample: (seed: number) => ReadonlyMap<Id, { x: number; y: number }> | Record<Id, { x: number; y: number }>,
  seeds: readonly number[] = [0, 1, 2],
): RoleReading[] | null {
  const arc = arcOf(commands);
  if (!arc) return null;
  const roles = [arc.center, arc.from, arc.to];
  if (new Set(roles).size !== 3) return null;
  const run = runIn(utterance, roles);
  if (!run) return null;

  const target = pinnedAngle(commands);
  /** The worst distance from the pinned angle, over the sampled configurations. */
  const score = (centre: Id): number | null => {
    if (target === null) return null;
    const [a, b] = roles.filter((r) => r !== centre);
    let worst: number | null = null;
    for (const seed of seeds) {
      const at = angleAt(sample(seed), centre, a, b);
      if (at === null) return null; // a point the figure has not placed — the probe abstains
      worst = Math.max(worst ?? 0, Math.abs(at - target));
    }
    return worst;
  };

  const stated = score(arc.center);
  const out: RoleReading[] = [];
  for (const centre of roles) {
    if (centre === arc.center) continue;
    const s = score(centre);
    /**
     * A reading no more promising than what the student wrote has not earned a ladder run. This is
     * the whole of the cost control: on the reported figure it means ONE retry (C, which scores 0)
     * rather than two, and on a figure where nothing is satisfiable it usually means none at all.
     */
    if (s !== null && stated !== null && !(s < stated)) continue;
    const [a, b] = roles.filter((r) => r !== centre);
    out.push({
      centre,
      score: s,
      utterance:
        utterance.slice(0, run.at) + `${centre}${a}${b}` + utterance.slice(run.at + run.text.length),
    });
  }
  // Best first: a scored reading beats an unscored one, and a lower score beats a higher one.
  return out.sort((x, y) => (x.score ?? Number.POSITIVE_INFINITY) - (y.score ?? Number.POSITIVE_INFINITY));
}

/**
 * Does the figure this reading built actually HONOUR the construct it claims to be? (#1012)
 *
 * `dryRunOutcome`'s `produced` means *something was built*, not *what you asked for was built* — and
 * for this family the difference is visible. Measured on the operator's triangle, «רבע מעגל CAB»
 * comes back `produced: true` with its two radii at **15 and 10**: a quarter circle cannot have two
 * different radii, and `AC=15` and `BC=10` were both pinned by the student.
 *
 * That is a pre-existing defect on the direct path (filed separately) and it would be a NEW one here:
 * a re-reading that adopts the first thing `produced` accepts would answer a refusal with a wrong
 * figure, which is strictly worse than the refusal it replaced. So an adopted reading is checked
 * against the construct's own promise — equal radii, and the central angle the construct pins.
 *
 * Only ever used to REJECT a candidate. A reading that fails here is simply not adopted, and the step
 * refuses exactly as it does today.
 */
export function honoursConstruct(
  commands: readonly AnyCommand[],
  positions: ReadonlyMap<Id, { x: number; y: number }> | Record<Id, { x: number; y: number }>,
  tolerance = 1e-3,
): boolean {
  const arc = arcOf(commands);
  if (!arc) return true; // not a construct this module speaks for
  const at = (id: Id) =>
    positions instanceof Map ? positions.get(id) : (positions as Record<Id, { x: number; y: number }>)[id];
  const [C, A, B] = [at(arc.center), at(arc.from), at(arc.to)];
  if (!C || !A || !B) return false; // it did not place what it named
  const ra = Math.hypot(A.x - C.x, A.y - C.y);
  const rb = Math.hypot(B.x - C.x, B.y - C.y);
  if (!(ra > 0) || !(rb > 0)) return false;
  // Two radii of one circle. Relative, so a large figure is not judged by an absolute epsilon.
  if (Math.abs(ra - rb) / Math.max(ra, rb) > tolerance) return false;
  const target = pinnedAngle(commands);
  if (target === null) return true; // a general sector pins no angle — nothing more to check
  const held = angleAt(positions, arc.center, arc.from, arc.to);
  return held !== null && Math.abs(held - target) <= 0.5;
}
