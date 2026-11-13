/**
 * The management console's GitHub client (#2868, ADR-W-208).
 *
 * GitHub is the record: the console keeps no copy of it. Every page view reads through this client, which
 * caches GET responses for a few minutes so a page load stays inside the REST rate limit (the open queue
 * alone is four pages of 100), and drops the cache after every write so the next view shows the write.
 *
 * `fetch` is injected: tests drive a fake GitHub, production passes the global one. REST only, never
 * GraphQL, and only the paths the console's allow-list of reads and actions names.
 */

export interface GhOpts {
  token: string;
  repo: string; // "owner/name"
  fetchImpl?: typeof fetch;
  ttlMs?: number;
  now?: () => number;
}

export interface GhClient {
  readonly repo: string;
  /** `fresh` skips the cache (a read that a write depends on). */
  get<T = unknown>(path: string, fresh?: boolean): Promise<T>;
  /** Pages of 100 until a short page or `maxPages`. `path` must not carry `page=`. */
  getAll<T = unknown>(path: string, maxPages?: number): Promise<T[]>;
  /** A repository file at `ref`, as text; `null` when it does not exist. */
  file(path: string, ref?: string): Promise<string | null>;
  send<T = unknown>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T>;
  /** Forget every cached read (after a write, or on the operator's "refresh"). */
  clear(): void;
}

export class GhError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(`GitHub ${status} on ${path}: ${message}`);
  }
}

const API = 'https://api.github.com';

export function makeGh(opts: GhOpts): GhClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ttl = opts.ttlMs ?? 3 * 60_000;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();
  const headers = (accept = 'application/vnd.github+json'): Record<string, string> => ({
    accept,
    authorization: `Bearer ${opts.token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'geo-builder-management',
  });
  const url = (p: string) => (p.startsWith('/') ? `${API}${p}` : `${API}/repos/${opts.repo}/${p}`);

  async function raw(path: string, accept?: string): Promise<Response> {
    const res = await fetchImpl(url(path), { headers: headers(accept) });
    return res;
  }

  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit.value as Promise<T>;
    const value = load();
    cache.set(key, { at: now(), value });
    // A failed read is not cached: the next view tries again.
    value.catch(() => cache.delete(key));
    return value;
  }

  async function get<T>(path: string, fresh = false): Promise<T> {
    if (fresh) cache.delete(path);
    return cached(path, async () => {
      const res = await raw(path);
      if (!res.ok) throw new GhError(res.status, path, (await res.text()).slice(0, 200));
      return (await res.json()) as T;
    });
  }

  return {
    repo: opts.repo,
    get,
    async getAll<T>(path: string, maxPages = 10): Promise<T[]> {
      const out: T[] = [];
      const sep = path.includes('?') ? '&' : '?';
      for (let page = 1; page <= maxPages; page++) {
        const rows = await get<T[]>(`${path}${sep}per_page=100&page=${page}`);
        out.push(...rows);
        if (rows.length < 100) break;
      }
      return out;
    },
    file(path: string, ref = 'main'): Promise<string | null> {
      const p = `contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`;
      return cached(`file:${p}`, async () => {
        const res = await raw(p, 'application/vnd.github.raw+json');
        if (res.status === 404) return null;
        if (!res.ok) throw new GhError(res.status, p, (await res.text()).slice(0, 200));
        return res.text();
      });
    },
    async send<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
      const res = await fetchImpl(url(path), {
        method,
        headers: { ...headers(), 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      cache.clear();
      if (!res.ok) throw new GhError(res.status, path, (await res.text()).slice(0, 300));
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    },
    clear: () => cache.clear(),
  };
}
