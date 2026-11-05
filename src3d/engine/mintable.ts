/**
 * #1467 ([ADR-3D-382](../../docs/06b-decisions-3d.md#adr-3d-382), ADR-W-162) — MINT ELIGIBILITY: which referenced
 * points the fold's mint pass (`deriveCore3`) may create. Registered in docs/17 §3 ("mint eligibility").
 *
 * The rule is the operator's ruling of 2026-09-27 ("Create everywhere + notice") widened by #2048 ruling A
 * ("whatever is missing is created" — points inside a vector line too): a line that refers to a POINT the figure
 * lacks creates it. Which ids are missing is the engine's own `unknown-point` / `two-unknowns` answer, so nothing
 * here lists command kinds that mint. Two guards remain:
 * - the id must be a point LABEL the figure does not hold: the degenerate-shape returns that report an id which
 *   EXISTS («קטע AA», a short face) are never "minted";
 * - a statement about a solid's own element is not a reference to free points: «אלכסון AB» says AB is a diagonal OF A
 *   SOLID (with no solid it stays refused, #978, ADR-3D-246); «XY גובה הפירמידה» says XY IS the pyramid's height.
 *   Minting would draw a free segment certified as that element (`solidElement3`).
 */
import { UNNAMED_CIRCLE_ID3, type Circle3Def, type Command3, type Construction3, type SolidNoun } from './types';
import { FREE_PLANE_TOKEN } from './freePlane';

/** A 3-D point label as the parser canonicalises it: an uppercase letter, glued digits, primes. */
const POINT_LABEL3 = /^[A-Z]\d*'*$/;

/** May the mint pass create `id` on `c`? */
export const mintableId3 = (id: string, c: Construction3): boolean => POINT_LABEL3.test(id) && !c.points.has(id);

/**
 * Does a line made of `cmds` only DECLARE its points — a solid or polygon run, a quadrilateral noun, a coordinate, a
 * bare «קטע»? Such a line may still need the pass («קטע AB» · «דלתון ABCD»: the kite's other corners), but naming
 * introduces, so its notice announces nothing (ADR-W-162).
 */
export const declaresOnly3 = (cmds: readonly Command3[]): boolean =>
  cmds.every((k) => k.type === 'solid' || k.type === 'quad-shape' || k.type === 'point3' || (k.type === 'segment3' && !!k.bare && !k.diagonal));

/**
 * #1566 ([ADR-3D-399](../../docs/06b-decisions-3d.md#adr-3d-399)) — THE FIELD NAMES that hold a line's or a plane's
 * NAME, at any depth of a command. The slot walks below read a field by its name, so a command whose line sits under a
 * name the walk did not know was never minted: «הישר d מאונך לישר ℓ1 ולישר ℓ2» lowers to `line-common-perp {line1,
 * line2}` and stayed `unknown-line ℓ1` while «ℓ1 מאונך ל-π» built. The lists are CHECKED AGAINST THE TYPE below: every
 * field of `Command3` spelled `line…` must be a line slot and every `plane…` / `pN` a plane slot, so the next such
 * field fails `tsc` here instead of slipping past the mint pass.
 */
export const LINE_SLOT_KEYS3 = ['line', 'line1', 'line2'] as const;
export const PLANE_SLOT_KEYS3 = ['plane', 'p1', 'p2'] as const;
/** Every key at any depth of `T` (bounded, `Command3` nests a few levels). */
type DeepKeys3<T, D extends unknown[] = []> = D['length'] extends 6
  ? never
  : T extends readonly (infer U)[]
    ? DeepKeys3<U, [...D, 1]>
    : T extends object
      ? { [K in keyof T]-?: K | DeepKeys3<T[K], [...D, 1]> }[keyof T]
      : never;
type CommandKeys3 = DeepKeys3<Command3>;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Fails to compile when a `line…` field of `Command3` is missing from {@link LINE_SLOT_KEYS3} (or the list names a dead one). */
export const lineSlotKeysTotal3: Same<Extract<CommandKeys3, `line${string}`>, (typeof LINE_SLOT_KEYS3)[number]> = true;
/** The plane twin: every `plane…` / `pN` field of `Command3` is in {@link PLANE_SLOT_KEYS3}. */
export const planeSlotKeysTotal3: Same<Extract<CommandKeys3, `plane${string}` | `p${number}`>, (typeof PLANE_SLOT_KEYS3)[number]> = true;
const LINE_KEYS: ReadonlySet<string> = new Set(LINE_SLOT_KEYS3);
const PLANE_KEYS: ReadonlySet<string> = new Set(PLANE_SLOT_KEYS3);

/**
 * #2489 ([ADR-3D-383](../../docs/06b-decisions-3d.md#adr-3d-383); operator, 2026-10-24, T45: *"the tool needs to create
 * the line if its referenced with dof"*) — THE LINE SLOTS of a line's commands: every name the parser put where a
 * LINE goes (a {@link LINE_SLOT_KEYS3} field, a `{kind: 'line', name}` operand). The parser reaches those slots only through the noun «הישר» /
 * "line" or the convention token `ℓ`, so the kind is the student's, never guessed. A name reported `unknown-line` is
 * mintable only from such a slot — so a circle reported through that code («A נמצאת על המעגל») is never made a line.
 */
export function lineSlotNames3(cmds: readonly Command3[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.kind === 'line' && typeof o.name === 'string') out.add(o.name);
    for (const [k, x] of Object.entries(o)) {
      if (LINE_KEYS.has(k) && typeof x === 'string') out.add(x);
      else if (typeof x === 'object') walk(x);
    }
  };
  walk(cmds);
  return out;
}

/**
 * #2484 ([ADR-3D-388](../../docs/06b-decisions-3d.md#adr-3d-388); operator ruling 2026-10-24, e10 = A: *"Any relation
 * naming a missing plane creates it. Like ⟂: π3 is created free and the relation places it. Lines already work this
 * way."*) — THE PLANE SLOTS of a line's commands: every name the parser put where a NAMED PLANE goes (a `{kind:
 * 'plane-named', name}` operand, a {@link PLANE_SLOT_KEYS3} name field). The line-slot walk's twin: a structural read of
 * the commands, never a list of command kinds.
 */
export function planeSlotNames3(cmds: readonly Command3[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.kind === 'plane-named' && typeof o.name === 'string') out.add(o.name);
    for (const [k, x] of Object.entries(o)) {
      if (PLANE_KEYS.has(k) && typeof x === 'string') out.add(x);
      else if (typeof x === 'object') walk(x);
    }
  };
  walk(cmds);
  return out;
}

/**
 * #2610 ([ADR-3D-409](../../docs/06b-decisions-3d.md#adr-3d-409)) — WHAT A LINE ASSERTS ABOUT A POINT IT NAMES IN A RUN
 * OF FOUR OR MORE LETTERS. A run that names a plane («המישור BCC'B'») asserts its points are coplanar; a run that names
 * a face or polygon («הפאה ABCD», «המרובע ABCD») asserts that too, and that they are its vertices in order. The mint
 * pass reads this so a missing letter is created as the statement says, never as an independent free point that makes
 * the very statement false at every seed.
 *
 * Read structurally, by the field that holds the run — never a list of claim kinds:
 * - a `face` field, or a `{kind: 'plane-run', face: true}` operand → a polygon run (`polygon: true`);
 * - a `plane-through` declaration's `ids` → a NAMED plane run (`plane` is its name: the pass rides the point on it);
 * - a `{kind: 'plane-run'}` operand or a {@link PLANE_SLOT_KEYS3} field holding letters → an anonymous plane run, which
 *   names no plane a rider could ride, so it reports `plane: undefined` (the pass creates such a letter free, as before).
 * A polygon run wins when the point sits in both.
 */
export type AssertedRun3 = { ids: string[]; polygon: boolean; plane?: string };
export function assertedRunOf3(cmds: readonly Command3[], id: string): AssertedRun3 | null {
  const runs: AssertedRun3[] = [];
  const letters = (x: unknown): x is string[] => Array.isArray(x) && x.length >= 4 && x.every((q) => typeof q === 'string' && POINT_LABEL3.test(q));
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.kind === 'plane-run' && letters(o.ids)) runs.push({ ids: [...o.ids], polygon: o.face === true });
    if (o.type === 'plane-through' && typeof o.name === 'string' && letters(o.ids)) runs.push({ ids: [...o.ids], polygon: false, plane: o.name });
    for (const [k, x] of Object.entries(o)) {
      if (k === 'face' && letters(x)) runs.push({ ids: [...x], polygon: true });
      else if (PLANE_KEYS.has(k) && letters(x)) runs.push({ ids: [...x], polygon: false });
      else if (typeof x === 'object' && k !== 'ids') walk(x);
    }
  };
  walk(cmds);
  const mine = runs.filter((r) => r.ids.includes(id));
  return mine.find((r) => r.polygon) ?? mine.find((r) => r.plane !== undefined) ?? mine[0] ?? null;
}

/**
 * #2681 ([ADR-3D-413](../../docs/06b-decisions-3d.md#adr-3d-413)) — EVERY PLANE A LINE NAMES BY FOUR OR MORE LETTERS IN AN
 * OPERAND POSITION, in reading order, each run once. A plane written by its letters asserts that its points lie in one
 * plane wherever it stands: alone («המישור ABCD», a `plane-through`) or as a side of a relation («המישור ABCD מקביל
 * למישור EFGH», «EF מאונך למישור ABCD», «המרחק בין E למישור ABCD הוא 2»). Read structurally, by the shape that holds
 * the run — never a list of relation kinds:
 * - a `{kind: 'plane-run'}` operand (a face's run included: a face is flat too);
 * - a {@link PLANE_SLOT_KEYS3} field holding letters (`seg-plane-rel`, `line-plane-angle` …);
 * - `plane-line-perp`'s `ids`: the one command that stores a stated plane operand flattened into `ids` (its other
 *   `ids`-holders — `coord-plane-rel`, the `plane-eq` claim — already verify every named point on the stated plane).
 * Runs of three are not read: three points always span a plane, or are a collapse the relation's own gate refuses.
 */
export function statedPlaneRuns3(cmds: readonly Command3[]): string[][] {
  const runs: string[][] = [];
  const add = (ids: readonly string[]) => {
    if (!runs.some((r) => r.join(',') === ids.join(','))) runs.push([...ids]);
  };
  const letters = (x: unknown): x is string[] => Array.isArray(x) && x.length >= 4 && x.every((q) => typeof q === 'string' && POINT_LABEL3.test(q));
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.kind === 'plane-run' && letters(o.ids)) add(o.ids);
    if (o.type === 'plane-line-perp' && letters(o.ids)) add(o.ids);
    for (const [k, x] of Object.entries(o)) {
      if (PLANE_KEYS.has(k) && letters(x)) add(x);
      else if (typeof x === 'object' && k !== 'ids') walk(x);
    }
  };
  walk(cmds);
  return runs;
}

/**
 * May the mint pass create the plane `name` for a line made of `cmds` on `c`? A π-token (`π`, `π3` — the named-plane
 * convention, ADR-3D-124) in one of the line's plane slots that names nothing in the figure. A missing point-run name
 * («ABC») is mistyped letters and stays the point lane's (its letters are minted, never a plane).
 */
export const mintablePlane3 = (name: string, c: Construction3, cmds: readonly Command3[]): boolean =>
  FREE_PLANE_TOKEN.test(name) &&
  !c.planes.has(name) &&
  !c.pointPlanes.has(name) &&
  !c.relPlanes.has(name) &&
  !c.lines.has(name) &&
  planeSlotNames3(cmds).has(name);

/**
 * #1566 ([ADR-3D-399](../../docs/06b-decisions-3d.md#adr-3d-399); #2048 ruling A, S2(c): *"a solid by its letters
 * («נפח הפירמידה ABCDS = 11») … creates it with the notice"*) — A SOLID NAMED BY ITS LETTERS that the figure lacks.
 * The engine's own `no-such-solid` answer names the run it could not find; the run is the solid's when some operand
 * of the line carries that run WITH the solid noun the student used (`{noun, ids}` — a structural read, never a list
 * of claim kinds). A noun that names no family («הגוף») creates nothing: there is no declaration to apply. What the
 * noun DECLARES is the parser's to say (`solidDeclaration3`); this only says the slot asks for one.
 */
export function mintableSolid3(
  st: { code: string; id?: unknown } | null,
  cmds: readonly Command3[],
): { noun: Exclude<SolidNoun, 'any'>; ids: string[] } | null {
  if (!st || st.code !== 'no-such-solid' || typeof st.id !== 'string') return null;
  const run = st.id;
  let found: { noun: Exclude<SolidNoun, 'any'>; ids: string[] } | null = null;
  const walk = (v: unknown): void => {
    if (found) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const ids = o.ids;
    if (typeof o.noun === 'string' && o.noun !== 'any' && Array.isArray(ids) && ids.length > 0 && ids.every((x) => typeof x === 'string' && POINT_LABEL3.test(x)) && ids.join('') === run) {
      found = { noun: o.noun as Exclude<SolidNoun, 'any'>, ids: [...(ids as string[])] };
      return;
    }
    for (const x of Object.values(o)) if (typeof x === 'object') walk(x);
  };
  walk(cmds);
  return found;
}

/**
 * #2611 stage B ([ADR-3D-420](../../docs/06b-decisions-3d.md#adr-3d-420); #2048 ruling A, 2026-10-13: *"A referenced circle
 * that does not exist … is created as a free circle, with the same notice"*) — A CIRCLE A LINE REFERS TO THAT THE FIGURE
 * LACKS. The engine's own `unknown-circle` answer says so, for every statement that resolves a circle; nothing here lists
 * command kinds. What is created is `Circle3Def.free`, as «מעגל O» declares it:
 * - «המעגל», on a figure with no circle: a circle with no centre letter (the V6 unnamed-centre rule, 2-D's FR-RN-8);
 * - «המעגל O», when every circle of the figure already has its letter: the circle on centre O. A letter over a drawn
 *   circle with no letter may name THAT circle (2-D: «משולש ABC חסום במעגל» · «D על המעגל O» names it), so it is no
 *   missing circle, and the refusal stands.
 * «המעגל» over several circles (`several`) is the student's to settle (#2705). `circle` is the centre's label the
 * notice names, `''` for none.
 */
export function mintableCircle3(st: { code: string; name?: unknown; several?: unknown } | null, c: Construction3): { id: string; def: Circle3Def; circle: string } | null {
  if (!st || st.code !== 'unknown-circle' || st.several) return null;
  if (st.name === undefined) return c.circles3.length === 0 ? { id: UNNAMED_CIRCLE_ID3, def: { kind: 'free' }, circle: '' } : null;
  if (typeof st.name !== 'string' || !POINT_LABEL3.test(st.name)) return null;
  if (c.circles3.some((k) => !('center' in k.def) || k.def.center === undefined)) return null;
  return { id: `circle-${st.name}`, def: { kind: 'free', center: st.name }, circle: st.name };
}

/**
 * A command that states something IS AN ELEMENT OF A SOLID (#1467 plan §3.2, "solid-relative statements keep their
 * subject"): a diagonal («אלכסון AB»), the solid's height («XY גובה הפירמידה» — a perpendicular to the solid's own
 * base, `plane: []`), a height to a named base face («גובה מנקודה D לבסיס ABZ»), a tetrahedron's altitude. Free
 * points can never be that element, so a missing letter there stays refused. A relation TO a solid's face
 * («SQ מקביל לבסיס») is not one: Q is an ordinary referenced point.
 */
const solidElement3 = (k: Command3): boolean =>
  (k.type === 'segment3' && !!k.diagonal) ||
  (k.type === 'seg-plane-rel' && k.rel === 'perp' && k.plane.length === 0) ||
  k.type === 'perp-to-base' ||
  k.type === 'tetra-altitude';

/** May a line made of `cmds` have its missing points minted? False for a statement about a solid's own element. */
export const mintEligible3 = (cmds: readonly Command3[]): boolean => !cmds.some(solidElement3);
