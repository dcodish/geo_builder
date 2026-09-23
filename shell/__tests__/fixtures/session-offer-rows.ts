/**
 * The cross-product checks for the session OFFER (#1238, ADR-W-068), written per docs/28 §5c.
 *
 * `shell/` may never import a product tree, so "every builder offers rather than restores, and none
 * of them erases the session it is about to offer" cannot be checked by calling all four. The §5c
 * pattern: the product's decision is a callable (its {@link SessionAdapter}), the checks live here
 * once as a pure `faults() → string[]`, each tree has a thin lock that hands its own adapter over,
 * and a meta-lock runs these same checks against deliberately broken stubs.
 *
 * The rows are the properties the ruling actually rests on, not the shape of anyone's code:
 *
 *  - **an empty session is never persistable.** This is the load-bearing one. Every builder opens
 *    empty by design (ADR-W-046); a persister that mirrored that boot state would overwrite the
 *    stored session milliseconds before the banner could offer it, and the feature would look like
 *    it "sometimes" works.
 *  - **a payload the product wrote is a payload the product can read back** — the round trip, run
 *    through the real save envelope and the real load path, not a mock of either.
 *  - **a refused payload changes nothing.** A foreign or corrupt stored session must leave the
 *    student's canvas exactly as it was; a half-load is the cardinal sin here.
 */
import type { SessionAdapter } from '../../session/adapter';

export interface SessionOfferSubject {
  /** The product's real wiring. */
  adapter: SessionAdapter;
  /** Put a genuine, non-empty session into the store, the way the product's own input does. */
  populate: () => Promise<void> | void;
  /** A payload this product must REFUSE — another builder's envelope. */
  foreign: string;
}

/** Every violated property, named. Empty array = the builder conforms. */
export async function sessionOfferFaults({ adapter, populate, foreign }: SessionOfferSubject): Promise<string[]> {
  const faults: string[] = [];
  const check = (ok: boolean, fault: string) => {
    if (!ok) faults.push(fault);
  };

  // 1 — an empty session is never persistable
  adapter.reset();
  check(adapter.isEmpty(), 'reset() left the session non-empty');
  check(adapter.snapshot() === null, 'an EMPTY session produced a payload — persisting it would erase the offer');

  // 2 — a populated session is persistable
  await populate();
  check(!adapter.isEmpty(), 'populate() left the session empty — the rest of the checks would prove nothing');
  const payload = adapter.snapshot();
  check(typeof payload === 'string' && payload.length > 0, 'a populated session produced no payload');

  // 3 — the round trip: what it wrote, it can read back
  if (typeof payload === 'string' && payload.length > 0) {
    adapter.reset();
    const restored = await adapter.restore(payload);
    check(restored === true, 'the product REFUSED a payload it had just written');
    check(!adapter.isEmpty(), 'restore() reported success but left the session empty');
    const again = adapter.snapshot();
    check(typeof again === 'string' && again.length > 0, 'a RESTORED session is not itself persistable');
  }

  // 4 — a refused payload changes nothing
  for (const [label, bad] of [
    ['nonsense', 'not json at all'],
    ['an empty payload', ''],
    ["another builder's file", foreign],
  ] as const) {
    adapter.reset();
    // Compared against the state BEFORE the attempt, not against "empty": a builder whose reset is
    // broken must fail on the reset row, not be misreported here as accepting a bad payload.
    const before = adapter.isEmpty();
    const accepted = await adapter.restore(bad);
    check(accepted === false, `${label} was ACCEPTED as a session`);
    check(adapter.isEmpty() === before, `${label} was refused but the session changed anyway`);
  }

  // 5 — reset empties, so «start fresh» really is fresh
  await populate();
  adapter.reset();
  check(adapter.isEmpty() && adapter.snapshot() === null, 'reset() after a populated session did not clear it');

  return faults;
}
