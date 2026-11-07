/**
 * #2739 (ADR-W-191) — what KIND of test a file is, read from its name and its imports. Pure, no I/O.
 *
 * Two questions, answered separately:
 *  - Is the file NAMED after one fix? (`issue-1234-…`, or a trailing `-1234` / `-1234-2` before `.test.ts`)
 *  - Does it enter through a FRONT DOOR: a module whose job is the whole "sentences in, figure out" route
 *    of its builder (parse → fold → evaluate → verify)? A test that enters there replays a whole figure,
 *    whatever it then asserts.
 *
 * A file that is both is a CASE FILE: one fix's figure, replayed whole, in its own cold worker. The
 * operator ruled on 2026-11-07 that a fix's own test is a unit test of the module that was fixed, and
 * that its figure is locked once, in a fixture or the scenario corpus (#2739). A fix-round item's check skips the
 * case files it did not touch, those whose figure is already locked are folded away, and
 * `server/__tests__/fix-test-shape.test.ts` stops new ones appearing
 * without a stated reason (`pipeline-lock: <why a shared net cannot make this check>`).
 *
 * The front doors are per builder. They are listed here, once; a new builder adds its own.
 */

/** Import specifiers (resolved suffixes) that are a builder's sentences-in, figure-out route. */
export const FRONT_DOORS = [
  // 2-D
  /(^|\/)app\/decideDeterministic$/,
  /(^|\/)decideDeterministic$/,
  /(^|\/)submitPipeline$/,
  /(^|\/)editPipeline$/,
  /(^|\/)submit-gate$/,
  /(^|\/)scenarios-harness$/,
  /(^|\/)scenario-pipeline$/,
  /(^|\/)scenarios-corpus(-\d+)?$/,
  // 3-D
  /(^|\/)store\/store3$/,
  /(^|\/)decideDeterministic3$/,
  // analytic
  /(^|\/)engine\/derive$/,
  /(^|\/)store\/useAnalyticStore$/,
  // complex
  /(^|\/)app\/deriveLines$/,
  /(^|\/)store\/useComplexStore$/,
  // analytic + complex: the submit decision module of each tree
  /(^|\/)app\/submit$/,
];

/**
 * The same route assembled by hand: a file that imports a builder's PARSER and its REPLAY/EVALUATE
 * turns sentences into a figure without naming a front door (`parse(...)` then `replay(facts)`).
 * The bare `engine` index is left out of REPLAY on purpose: parser tests import its types.
 */
export const PARSERS = [/(^|\/)parser$/, /(^|\/)parser\/(index|parse)$/, /^parse$/, /(^|\/)parse3$/, /(^|\/)parseAnalytic$/];
export const REPLAYS = [/(^|\/)store\/geoStore$/, /(^|\/)replay\/core$/, /(^|\/)replay$/, /(^|\/)engine\/evaluate$/, /^evaluate$/];

/** The marker a front-door file named after a fix carries to say why a shared net cannot do its job. */
export const PIPELINE_LOCK = /pipeline-lock:\s*\S/;

const FIX_NAMED = /(?:^|[/\\])(?:[^/\\]*?issue-?\d{3,4}[^/\\]*|[^/\\]*-\d{3,4}(?:-\d+)?)\.test\.tsx?$/;
const IMPORT = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** Pure: is this path a test file named after one fix? */
export function isFixNamed(file) {
  return FIX_NAMED.test(file.replace(/\\/g, '/'));
}

/** Pure: the import specifiers of a source text, with relative `./` `../` prefixes and extensions stripped. */
export function importsOf(source) {
  return [...String(source ?? '').matchAll(IMPORT)].map((m) => m[1].replace(/^(\.\.?\/)+/, '').replace(/^@\//, '').replace(/\.[cm]?[jt]sx?$/, ''));
}

/** Pure: does this source enter through a front door? */
export function entersFrontDoor(source) {
  const imports = importsOf(source);
  const any = (res) => imports.some((s) => res.some((re) => re.test(s)));
  return any(FRONT_DOORS) || (any(PARSERS) && any(REPLAYS));
}

/**
 * Pure: the file's kind.
 *  - `case`     named after a fix and enters through a front door (what an item's check skips, #2739)
 *  - `pipeline` enters through a front door but is not named after a fix (nets, corpora, module suites)
 *  - `unit`     does not enter through a front door
 */
export function testKind(file, source) {
  const door = entersFrontDoor(source);
  if (door) return isFixNamed(file) ? 'case' : 'pipeline';
  return 'unit';
}
