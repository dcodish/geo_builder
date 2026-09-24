/**
 * The cross-product checks for the share LINK (#1372), written per docs/28 §5c.
 *
 * `shell/` may never import a product tree, so "every builder shares the same way" is checked
 * through a subject each tree assembles from its own real wiring. The rows are the properties the
 * feature is sold on, not the shape of anyone's code:
 *
 *  - **an empty canvas offers no link** (there is nothing to send);
 *  - **what it emits, it can read back** — the round trip, through the product's real save envelope
 *    and its real load path;
 *  - **a refused payload changes nothing** — a foreign or corrupt link must leave the student's
 *    canvas exactly as it was, because a half-load is the cardinal sin here;
 *  - **an oversized figure is refused AS too large** (#1379) — a link is a stranger's input and replay
 *    is superlinear, so every builder refuses past `shell/save`'s statement ceiling, before replaying,
 *    and names that reason rather than calling the link broken;
 *  - **the same figure gives the same link twice.** That row exists because it caught a real thing:
 *    3-D's envelope stamps `savedAt`, so sharing the same unchanged figure produced a different URL
 *    on every press, and a teacher who sent it twice appeared to have sent two different figures.
 */
import { decodeFigurePayload } from '../../session/link';
import { MAX_FIGURE_STATEMENTS } from '../../save';

/** What opening a payload did: `true` when it loaded, otherwise the refusal — `broken` for anything
 *  unreadable, `too-large` past the statement ceiling. */
export type OpenOutcome = true | 'broken' | 'too-large';

export type ShareResultLike =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'too-long'; length: number };

export interface ShareSubject {
  /** Put a real, non-empty session into the store, the way the product's own input does. */
  build: () => void;
  /** Return to an empty canvas. */
  clear: () => void;
  isEmpty: () => boolean;
  /** The product's real "copy link" decision. */
  link: () => ShareResultLike;
  /** The product's real "a link arrived" path. `true` when it loaded, else why not. Async in 2-D,
   *  which folds the figure off the main thread, so every caller awaits. */
  open: (payload: string) => OpenOutcome | Promise<OpenOutcome>;
  /** The envelope's statement list (`facts`, `lines`) — how the oversized row grows a real payload. */
  statements: string;
  /** Another builder's envelope — must be refused. */
  foreign: string;
}

const fragmentOf = (url: string) => url.slice(url.indexOf('#') + 1);

/** Every violated property, named. Empty array = the builder conforms. */
export async function shareLinkFaults(s: ShareSubject): Promise<string[]> {
  const faults: string[] = [];
  const check = (ok: boolean, fault: string) => {
    if (!ok) faults.push(fault);
  };

  // 1 — an empty canvas offers no link
  s.clear();
  const empty = s.link();
  check(!empty.ok && empty.reason === 'empty', 'an EMPTY canvas produced a link');

  // 2 — a real figure produces a well-formed one
  s.build();
  check(!s.isEmpty(), 'build() left the session empty — the rest would prove nothing');
  const made = s.link();
  check(made.ok, `a real figure was refused a link: ${JSON.stringify(made)}`);
  if (!made.ok) return faults;

  check(made.url.includes('#'), 'the payload is not in the FRAGMENT — it would reach the server');
  const fragment = fragmentOf(made.url);
  check(/^[A-Za-z0-9_-]+$/.test(fragment), 'the fragment is not base64url — a link detector could chop it');

  // 3 — the same figure gives the same link twice (no timestamp in the payload)
  const again = s.link();
  check(again.ok && again.url === made.url, 'the same unchanged figure produced a DIFFERENT link on a second press');

  // 4 — the round trip, through the real load path
  const payload = decodeFigurePayload(fragment);
  check(payload !== null, 'the product emitted a fragment it cannot decode');
  if (payload !== null) {
    s.clear();
    check((await s.open(payload)) === true, 'the product REFUSED a link it had just produced');
    check(!s.isEmpty(), 'open() reported success but the canvas stayed empty');

    // 6 — an oversized figure is refused AS too large, and changes nothing (#1379). Grown from the
    // product's OWN payload, so the envelope is valid and only the size is wrong.
    const env = JSON.parse(payload) as Record<string, unknown>;
    const list = env[s.statements];
    check(Array.isArray(list) && list.length > 0, `the payload has no "${s.statements}" list to grow — the row would prove nothing`);
    if (Array.isArray(list) && list.length > 0) {
      const oversized = JSON.stringify({ ...env, [s.statements]: Array.from({ length: MAX_FIGURE_STATEMENTS + 1 }, (_, i) => list[i % list.length]) });
      s.clear();
      const got = await s.open(oversized);
      check(got === 'too-large', `a figure over the ${MAX_FIGURE_STATEMENTS}-statement ceiling was not refused as too large (got ${String(got)})`);
      check(s.isEmpty(), 'an oversized figure was refused but the session changed anyway');
      const atCeiling = JSON.stringify({ ...env, [s.statements]: Array.from({ length: MAX_FIGURE_STATEMENTS }, (_, i) => list[i % list.length]) });
      s.clear();
      check((await s.open(atCeiling)) !== 'too-large', `a figure AT the ceiling (${MAX_FIGURE_STATEMENTS}) was refused as too large — the bound is off by one`);
    }
  }

  // 5 — a refused payload changes nothing
  for (const [label, bad] of [
    ['nonsense', 'not a session at all'],
    ['an empty payload', ''],
    ["another builder's envelope", s.foreign],
  ] as const) {
    s.clear();
    const before = s.isEmpty();
    check((await s.open(bad)) !== true, `${label} was ACCEPTED as a shared figure`);
    check(s.isEmpty() === before, `${label} was refused but the session changed anyway`);
  }

  s.clear();
  return faults;
}
