/**
 * The cross-product checks for crash recovery (#1507, ADR-W-195), written per docs/28 §5c.
 *
 * `shell/` may never import a product tree, so "every builder comes back from a crash with the last
 * figure that drew, and a reload offers that one" cannot be checked by calling all four. The §5c
 * pattern, as for the session offer (#1238): the checks live here once as a pure `faults() → string[]`,
 * each tree's thin lock hands over its REAL wiring (its store, its `CrashSession`, its session-offer
 * adapter, its debug log, its own input), and a meta-lock runs these same checks against
 * deliberately broken stubs.
 *
 * **How the crash is driven.** The repo's tests have no DOM renderer (React is rendered statically;
 * neither jsdom nor testing-library is a dependency, ADR-3D-155's precedent), and a static render has
 * no error boundaries. So a crash is driven the way React drives one, step by step, on the real
 * `CrashBoundary` class: its normal output is rendered statically with a child that THROWS, and the
 * error that render raises is handed to the boundary through React's documented sequence,
 * `getDerivedStateFromError` (render) then `componentDidCatch` (commit). The probe's part, which only
 * a client render runs, is the one call `noteCommitted(state)`. The wiring in a real browser is
 * pre-played on the play sheet.
 */
import { createElement, type ErrorInfo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CrashBoundary } from '../../frame/CrashBoundary';
import type { SessionAdapter } from '../../session/adapter';
import type { CrashReport, CrashSession } from '../../session/crash';
import { readSession, writeSession } from '../../session/persist';

/** The undo history members the rows read: what zundo's `temporal` store has. */
interface History<S> {
  pastStates: readonly Partial<S>[];
  undo(steps?: number): void;
  pause(): void;
  resume(): void;
}

export interface CrashRecoverySubject<S = any> {
  /** The builder's real crash wiring (`crashSession…` beside its session adapter). */
  session: CrashSession<S>;
  /** The same store, for its undo history. */
  store: { getState(): S; temporal: { getState(): History<S> } };
  /** The builder's session-offer wiring: the reload path (#1238). */
  adapter: SessionAdapter;
  /** The builder's debug log for a caught error (its real `logCrash…`). */
  onCrash: (report: CrashReport) => void;
  /** A genuine, non-empty construction, through the builder's own input. */
  populate: () => void | Promise<void>;
  /** One more step through the builder's own input: the change the crash follows. */
  step: () => void | Promise<void>;
  /** The construction as plain, comparable data (the fact texts, the lines). */
  construction: () => unknown;
}

const ERROR_TEXT = 'crash rows: the drawing failed';

/** A child that throws while it renders, as the reported crash did. */
function Broken(): never {
  throw new TypeError(ERROR_TEXT);
}

/** A `CrashBoundary` driven outside React: `setState` applies at once, as a committed update would. */
function boundaryOf(session: CrashSession, onCrash: (r: CrashReport) => void): CrashBoundary {
  const b = new CrashBoundary({ children: createElement(Broken), session, onCrash });
  b.setState = ((u: unknown) => {
    const patch = typeof u === 'function' ? (u as (s: CrashBoundary['state'], p: CrashBoundary['props']) => unknown)(b.state, b.props) : u;
    if (patch) b.state = { ...b.state, ...(patch as object) };
  }) as CrashBoundary['setState'];
  return b;
}

/**
 * The child throws inside the boundary's own render output, and the thrown error goes through
 * React's sequence. Returns the error, so a row can check it is the CHILD's error that was caught.
 */
export function crashInsideChild(b: CrashBoundary): unknown {
  let thrown: unknown = null;
  try {
    renderToStaticMarkup(createElement('div', null, b.render()));
  } catch (e) {
    thrown = e;
  }
  if (thrown === null) return null;
  b.state = { ...b.state, ...CrashBoundary.getDerivedStateFromError(thrown) };
  b.componentDidCatch(thrown, { componentStack: '\n    at Broken' } as ErrorInfo);
  return thrown;
}

/** Every POST the debug log makes while `run` runs. */
async function postsDuring(run: () => void | Promise<void>): Promise<Record<string, unknown>[]> {
  const posts: Record<string, unknown>[] = [];
  const g = globalThis as { fetch?: typeof fetch };
  const real = g.fetch;
  g.fetch = ((_url: unknown, init?: { body?: unknown }) => {
    try {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    } catch {
      /* not a log line */
    }
    return Promise.resolve(new Response('{}'));
  }) as typeof fetch;
  try {
    await run();
  } finally {
    g.fetch = real;
  }
  return posts;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Every violated property, named. Empty array = the builder conforms. */
export async function crashRecoveryFaults(sub: CrashRecoverySubject): Promise<string[]> {
  const faults: string[] = [];
  const check = (ok: boolean, fault: string) => {
    if (!ok) faults.push(fault);
  };
  const { session, store, adapter } = sub;
  const history = () => store.temporal.getState();

  // 1 — the store state is a stable reference until it changes (the probe re-renders on identity)
  adapter.reset();
  await sub.populate();
  check(!adapter.isEmpty(), 'populate() left the session empty — the rest of the checks would prove nothing');
  check(session.getState() === session.getState(), 'getState() is not a stable reference — the probe would re-render forever');
  const tracked = Object.keys(history().pastStates[history().pastStates.length - 1] ?? {});
  check(tracked.length > 0, 'populate() left no undo history — the coverage check would prove nothing');

  // 2 — a rollback to the state on screen undoes nothing
  const good = session.getState();
  const goodConstruction = sub.construction();
  check(session.rollback(good) === false, 'a rollback to the state on screen reported that it undid something');
  check(same(sub.construction(), goodConstruction), 'a rollback to the state on screen changed the construction');

  // 3 — the store's change reaches a subscriber (the probe and the dev trigger listen this way)
  let heard = 0;
  const stop = session.subscribe(() => heard++);
  await sub.step();
  stop();
  check(heard > 0, "subscribe() did not hear the builder's own input");
  const failing = sub.construction();
  check(!same(failing, goodConstruction), 'step() did not change the construction — the rollback rows would prove nothing');
  check(session.changed(good, session.getState()), 'changed() does not see the step as a change of the session');
  // the autosave runs on every store change, so by the crash it has written the FAILING state
  const failingPayload = adapter.snapshot();
  if (failingPayload) writeSession(adapter.spec, failingPayload);

  // 4 — a child throws while drawing: the boundary catches it, rolls back, says so, and logs it
  const b = boundaryOf(session, sub.onCrash);
  b.noteCommitted(good); // the last render that committed drew `good`
  let caught: unknown = null;
  const posts = await postsDuring(() => {
    caught = crashInsideChild(b);
  });
  check(caught instanceof TypeError && caught.message === ERROR_TEXT, "the error the boundary caught is not the child's");
  check(same(sub.construction(), goodConstruction), 'after the crash the construction is not the last one that drew');
  for (const k of tracked) {
    const now = session.getState() as Record<string, unknown>;
    check(now[k] === (good as Record<string, unknown>)[k], `after the crash the undo-tracked field «${k}» is not the last good one`);
  }
  check(b.state.crash?.undone === true, 'the notice does not say the last change was undone');
  check(b.state.crash?.text.includes(ERROR_TEXT) === true, "the notice does not carry the error's text");
  const line = posts.find((p) => p.kind === 'crash');
  check(line !== undefined, 'the debug log holds no crash line');
  check(typeof line?.message === 'string' && line.message.includes(ERROR_TEXT), "the debug log's crash line does not hold the error's text");
  check(typeof line?.componentStack === 'string', "the debug log's crash line does not say which component was rendering");

  // 5 — nothing retries on its own: the boundary keeps the notice until «שחזור»
  const shown = b.render() as { type?: unknown } | null;
  check(shown !== null && shown.type !== undefined && (shown as { props?: { onRecover?: unknown } }).props?.onRecover !== undefined, 'the boundary does not show the notice after a crash');
  const gen = b.state.generation;
  b.recover();
  check(b.state.crash === null && b.state.generation === gen + 1, '«שחזור» does not re-mount the app');
  check(same(sub.construction(), goodConstruction), '«שחזור» did not come back with the last construction that drew');

  // 6 — an undo after recovery goes on BEHIND the last good state, never forward into the crash
  history().undo();
  check(!same(sub.construction(), failing), 'an undo after recovery brought back the state that crashed');

  // 7 — a reload offers the last construction that drew, not the one that failed
  const stored = readSession(adapter.spec);
  check(stored !== null, 'after the crash nothing is stored for a reload to offer');
  if (stored) {
    adapter.reset();
    check((await adapter.restore(stored.payload)) === true, 'the stored session after a crash does not load');
    check(same(sub.construction(), goodConstruction), 'a reload after the crash offers the state that failed, not the last one that drew');
  }

  // 8 — a crash whose step the undo history does not hold (a load cleared it) still restores every tracked field
  adapter.reset();
  await sub.populate();
  const good2 = session.getState();
  history().pause();
  await sub.step();
  history().resume();
  const b2 = boundaryOf(session, () => {});
  b2.noteCommitted(good2);
  crashInsideChild(b2);
  for (const k of tracked) {
    const now = session.getState() as Record<string, unknown>;
    check(now[k] === (good2 as Record<string, unknown>)[k], `a rollback without the history leaves the undo-tracked field «${k}» as it failed`);
  }

  // 9 — a crash with the construction unchanged (transient UI state) undoes nothing
  const b3 = boundaryOf(session, () => {});
  b3.noteCommitted(session.getState());
  const before = sub.construction();
  crashInsideChild(b3);
  check(b3.state.crash?.undone === false, 'a crash with nothing changed claims the last change was undone');
  check(same(sub.construction(), before), 'a crash with nothing changed changed the construction');

  adapter.reset();
  return faults;
}

/**
 * The builder's `main.tsx` mounts the boundary around the whole app, with its own session and log,
 * and the dev trigger gated on `import.meta.env.DEV` (a production build never renders it).
 */
export function crashMountFaults(mainSource: string, names: { session: string; log: string; app: string }): string[] {
  const faults: string[] = [];
  const open = mainSource.indexOf('<CrashBoundary');
  const close = mainSource.indexOf('</CrashBoundary>');
  const app = mainSource.indexOf(`<${names.app} />`);
  if (open < 0 || close < 0) return ['main.tsx does not mount the CrashBoundary'];
  if (!(open < app && app < close)) faults.push(`the CrashBoundary does not wrap <${names.app} />`);
  const tag = mainSource.slice(open, mainSource.indexOf('>', open));
  if (!tag.includes(`session={${names.session}}`)) faults.push(`the CrashBoundary is not handed ${names.session}`);
  if (!tag.includes(`onCrash={${names.log}}`)) faults.push(`the CrashBoundary does not log to ${names.log}`);
  if (!tag.includes('devCrash={import.meta.env.DEV ? devCrashMode(window.location.search) : null}')) {
    faults.push('the dev trigger is not gated on import.meta.env.DEV');
  }
  return faults;
}
