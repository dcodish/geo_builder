/**
 * A `localStorage` stand-in for the node test environment (#1238).
 *
 * The suite runs without a DOM, so every lock that touches the session seam installs one of these.
 * `throwOn` reproduces the failures that are NOT hypothetical in a browser — a private window, a
 * blocked-site-data SecurityError, an exhausted quota — because the seam's contract is that each of
 * them degrades to "no stored session" rather than taking the builder down with it.
 */

export interface FakeStorage extends Storage {
  readonly map: Map<string, string>;
  reads: number;
}

export function installFakeStorage(opts: { throwOn?: ('get' | 'set' | 'remove')[] } = {}): FakeStorage {
  const map = new Map<string, string>();
  const throwOn = new Set(opts.throwOn ?? []);
  const fake = {
    map,
    reads: 0,
    getItem(key: string) {
      if (throwOn.has('get')) throw new DOMException('blocked', 'SecurityError');
      fake.reads++;
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (throwOn.has('set')) throw new DOMException('quota', 'QuotaExceededError');
      map.set(key, value);
    },
    removeItem(key: string) {
      if (throwOn.has('remove')) throw new DOMException('blocked', 'SecurityError');
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as FakeStorage;
  (globalThis as { localStorage?: Storage }).localStorage = fake;
  return fake;
}

export function uninstallFakeStorage(): void {
  delete (globalThis as { localStorage?: Storage }).localStorage;
}
