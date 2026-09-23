/**
 * #1373 — the fragment is a STREAM, not a boot value.
 *
 * The operator's report: *"T11 ... did show the banner in a new window but on an existing browser
 * window just did nothing."* Measured against `prod/2026-09-23-2`, the cause was worse than the
 * symptom he saw — a URL differing only by its `#` is a same-document navigation, so the app never
 * remounts and a mount-only read never fires again. The REFUSAL went quiet, and so did the success
 * path: a good link opened in an already-open tab drew nothing and left the fragment in the URL.
 *
 * These rows drive `onSharedLink` against a stand-in `window`, because the property under test is
 * exactly the browser event plumbing: subscribe, fire, consume, unsubscribe, and — the one that
 * would be expensive to get wrong — do not re-enter when the consume rewrites the URL.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appBaseUrl, encodeFigurePayload, onSharedLink } from '../session/link';

const PAYLOAD = '{"app":"geo-builder","schemaVersion":1,"seed":0,"facts":[]}';

interface FakeWindow {
  location: { hash: string; pathname: string; search: string };
  history: { replaceState: (a: unknown, b: string, url: string) => void };
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
  /** Drive a same-document navigation, the way pasting a link into an open tab does. */
  navigateToHash: (hash: string) => void;
  listeners: number;
}

function installWindow(initialHash = ''): FakeWindow {
  const handlers = new Set<() => void>();
  const w: FakeWindow = {
    location: { hash: initialHash, pathname: '/geo-builder/', search: '' },
    history: {
      replaceState: (_a, _b, url) => {
        // The real replaceState updates the URL and, by specification, does NOT fire hashchange.
        w.location.hash = String(url).includes('#') ? String(url).slice(String(url).indexOf('#')) : '';
      },
    },
    addEventListener: (type, fn) => {
      if (type === 'hashchange') handlers.add(fn);
    },
    removeEventListener: (type, fn) => {
      if (type === 'hashchange') handlers.delete(fn);
    },
    navigateToHash: (hash) => {
      w.location.hash = hash;
      for (const fn of [...handlers]) fn();
    },
    get listeners() {
      return handlers.size;
    },
  };
  (globalThis as { window?: unknown }).window = w;
  return w;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('#1373 — a link arriving in an ALREADY-OPEN tab is handled', () => {
  it('THE REPORTED DEFECT: a good link pasted into an open tab delivers its payload', () => {
    const w = installWindow(''); // the student is on the app, no fragment
    const seen: (string | null)[] = [];
    onSharedLink(({ payload }) => seen.push(payload));
    expect(seen, 'an ordinary visit is not a shared link').toEqual([]);

    w.navigateToHash(`#${encodeFigurePayload(PAYLOAD)}`);
    expect(seen).toEqual([PAYLOAD]);
  });

  it('and an UNREADABLE fragment in an open tab refuses out loud — the operator’s T11', () => {
    const w = installWindow('');
    const seen: (string | null)[] = [];
    onSharedLink(({ payload }) => seen.push(payload));
    w.navigateToHash('#not-a-real-payload');
    expect(seen, 'null is the caller’s cue to say the link is broken').toEqual([null]);
  });

  it('still handles the COLD load, which is what already worked', () => {
    installWindow(`#${encodeFigurePayload(PAYLOAD)}`);
    const seen: (string | null)[] = [];
    onSharedLink(({ payload }) => seen.push(payload));
    expect(seen).toEqual([PAYLOAD]);
  });

  it('handles a SECOND link in the same tab — the realistic case of two links from one teacher', () => {
    const w = installWindow('');
    const seen: (string | null)[] = [];
    onSharedLink(({ payload }) => seen.push(payload));
    w.navigateToHash(`#${encodeFigurePayload(PAYLOAD)}`);
    w.navigateToHash(`#${encodeFigurePayload('{"app":"geo-builder","schemaVersion":1,"seed":7,"facts":[]}')}`);
    expect(seen.length).toBe(2);
    expect(seen[1]).toContain('"seed":7');
  });
});

describe('#1373 — the consume, and the loop that must not happen', () => {
  it('the fragment is consumed, so a refresh does not re-open the shared figure', () => {
    const w = installWindow(`#${encodeFigurePayload(PAYLOAD)}`);
    onSharedLink(() => {});
    expect(w.location.hash, 'the URL stops being in charge after one delivery').toBe('');
  });

  it('consuming does NOT re-enter the handler — the expensive failure to get wrong', () => {
    const w = installWindow('');
    const handler = vi.fn();
    onSharedLink(handler);
    w.navigateToHash(`#${encodeFigurePayload(PAYLOAD)}`);
    expect(handler, 'replaceState must not fire hashchange').toHaveBeenCalledTimes(1);
  });

  it('unsubscribing really detaches — a remount must not stack listeners', () => {
    const w = installWindow('');
    const handler = vi.fn();
    const stop = onSharedLink(handler);
    expect(w.listeners).toBe(1);
    stop();
    expect(w.listeners).toBe(0);
    w.navigateToHash(`#${encodeFigurePayload(PAYLOAD)}`);
    expect(handler).not.toHaveBeenCalled();
  });

  it('a bare "#" is an ordinary visit, not a broken link', () => {
    const w = installWindow('');
    const seen: unknown[] = [];
    onSharedLink((a) => seen.push(a));
    w.navigateToHash('#');
    expect(seen).toEqual([]);
  });

  it('survives an environment with no window at all (node, tests, SSR)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => onSharedLink(() => {})()).not.toThrow();
  });
});

/**
 * The link must reopen THIS builder — the defect a browser found and the suite could not.
 *
 * Measured on the branch dev server: an analytic link built from `import.meta.env.BASE_URL`
 * round-tripped to an EMPTY canvas. In production each builder is built with its own base and the
 * two agree, but in development all four are served by one server from `/`, so BASE_URL is `/` for
 * every one of them and a sibling's link reopened the 2-D app. `pathname` is correct in both.
 */
describe('#1372 — a link points at the builder it was copied from', () => {
  const withLocation = (pathname: string, search = '') => {
    (globalThis as { window?: unknown }).window = {
      location: { origin: 'https://themathbible.com', pathname, search, hash: '' },
      history: { replaceState: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  };

  it.each([
    ['dev, a sibling entry point', '/analytic.html', '/', 'https://themathbible.com/analytic.html'],
    ['dev, 2-D at the root', '/', '/', 'https://themathbible.com/'],
    ['production, 3-D', '/3d-builder/', '/3d-builder/', 'https://themathbible.com/3d-builder/'],
    ['production, 2-D', '/geo-builder/', '/geo-builder/', 'https://themathbible.com/geo-builder/'],
  ])('%s', (_label, pathname, base, expected) => {
    withLocation(pathname);
    expect(appBaseUrl(base)).toBe(expected);
  });

  it("drops the sender's query tail — a shared figure carries no tracking", () => {
    withLocation('/analytic.html', '?utm=whatsapp');
    expect(appBaseUrl('/')).toBe('https://themathbible.com/analytic.html');
  });

  it('falls back to the configured base with no window (node, SSR)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(appBaseUrl('/geo-builder/')).toBe('/geo-builder/');
  });
});
