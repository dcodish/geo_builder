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
import { encodeFigurePayload, onSharedLink } from '../session/link';

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
