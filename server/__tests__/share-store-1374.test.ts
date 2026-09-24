/**
 * The SHARE STORE (#1374) — a figure gets a short link and a chat-client preview.
 *
 * The rows are the properties the operator's rulings rest on, not the shape of the code: shares are
 * APPEND-ONLY (he ruled a diagram can never be overwritten, only re-created), the store REFUSES
 * rather than evicting when full (a link already sent must never die), ids cannot be walked, and
 * every refusal names itself so a client can tell "too big" from "store full" from "not mine".
 *
 * The `/g/<id>` page is tested for the one thing it exists to do that a `#` fragment could not:
 * carry OpenGraph tags a crawler can read WITHOUT running JavaScript.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  DEFAULT_STORE_MAX_BYTES,
  SHARE_FRAGMENT_MAX_CHARS,
  SHARE_INFLATED_MAX_BYTES,
  handleShare,
  handleSharePage,
  isShareId,
  newShareId,
  readShare,
  storeUsage,
} from '../shareStore';

/** A 1×1 PNG — real magic bytes, because the handler checks them rather than trusting the label. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'share-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function mockRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '' as string | Buffer,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    end(b?: string | Buffer) {
      if (b !== undefined) this.body = b;
    },
  };
  return res as typeof res & ServerResponse;
}

async function* chunks(parts: string[]) {
  for (const p of parts) yield Buffer.from(p);
}
let ipSeq = 0;
function mockReq(body: unknown, method = 'POST', url = '/api/share') {
  const req = chunks([typeof body === 'string' ? body : JSON.stringify(body)]) as AsyncGenerator<Buffer> & {
    method: string;
    url: string;
    socket: { remoteAddress: string };
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  // A distinct IP per request: the rate limiter is real, and a shared bucket would make the
  // 20th row of this file fail for a reason that has nothing to do with what it asserts.
  req.socket = { remoteAddress: `10.9.${Math.floor(ipSeq / 250) % 250}.${ipSeq++ % 250}` };
  req.headers = {};
  return req as unknown as IncomingMessage;
}

async function shareOk(body: Record<string, unknown>) {
  const res = mockRes();
  await handleShare(mockReq(body), res, { dir });
  expect(res.statusCode, String(res.body)).toBe(200);
  return JSON.parse(String(res.body)).id as string;
}

const GOOD = { tool: '2d', fragment: 'xVPNSsNAEH6VMOcErD0UAh7SRAulrYK2', png: PNG.toString('base64'), title: 'ריבוע ABCD' };

describe('#1374 — a share round-trips', () => {
  it('stores the fragment and the image, and answers with an id', async () => {
    const id = await shareOk(GOOD);
    expect(isShareId(id)).toBe(true);
    const rec = await readShare(id, dir);
    expect(rec?.fragment).toBe(GOOD.fragment);
    expect(rec?.tool).toBe('2d');
    expect(rec?.title).toBe('ריבוע ABCD');
    expect(readdirSync(dir).sort()).toEqual([`${id}.json`, `${id}.png`]);
  });

  it('a share without an image is still a share (the preview is optional, the figure is not)', async () => {
    const id = await shareOk({ tool: '2d', fragment: 'abc123' });
    expect((await readShare(id, dir))?.fragment).toBe('abc123');
  });
});

describe('#1374 — APPEND-ONLY, per the operator’s ruling', () => {
  it('two shares of the SAME figure get different ids and both survive', async () => {
    const a = await shareOk(GOOD);
    const b = await shareOk(GOOD);
    expect(a).not.toBe(b);
    expect((await readShare(a, dir))?.fragment).toBe(GOOD.fragment);
    expect((await readShare(b, dir))?.fragment).toBe(GOOD.fragment);
  });

  it('nothing in the module can overwrite an existing share', async () => {
    const id = await shareOk(GOOD);
    const before = readFileSync(path.join(dir, `${id}.json`), 'utf8');
    for (let i = 0; i < 5; i++) await shareOk({ ...GOOD, fragment: 'different' });
    expect(readFileSync(path.join(dir, `${id}.json`), 'utf8'), 'a stored figure is immutable').toBe(before);
  });
});

describe('#1374 — ids cannot be walked, and cannot escape the directory', () => {
  it('ids are long, from the declared alphabet, and do not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, newShareId));
    expect(seen.size, 'no collisions in 500 draws').toBe(500);
    for (const id of seen) expect(isShareId(id)).toBe(true);
  });

  it.each([
    ['traversal', '../../etc/passwd'],
    ['a slash', 'abcdefghijk/'],
    ['too short', 'abc'],
    ['a letter outside the alphabet', 'abcdefghijk1'],
    ['not a string', 42],
  ])('rejects %s as an id', (_label, bad) => {
    expect(isShareId(bad)).toBe(false);
  });

  it('a traversal id reads nothing, even when the file exists', async () => {
    writeFileSync(path.join(dir, 'secret.json'), '{"fragment":"x"}');
    expect(await readShare('../secret' as string, dir)).toBeNull();
  });
});

describe('#1374 — every refusal names itself', () => {
  const reason = async (body: unknown, method = 'POST') => {
    const res = mockRes();
    await handleShare(mockReq(body, method), res, { dir });
    return { code: res.statusCode, error: JSON.parse(String(res.body)).error as string };
  };

  it('a GET is refused', async () => expect(await reason(GOOD, 'GET')).toEqual({ code: 405, error: 'method' }));
  it('malformed JSON is refused', async () => expect(await reason('{oops')).toEqual({ code: 400, error: 'bad-json' }));
  it('an unknown tool is refused, never defaulted', async () =>
    expect(await reason({ ...GOOD, tool: 'nope' })).toEqual({ code: 400, error: 'unknown-tool' }));
  it('a missing fragment is refused', async () =>
    expect(await reason({ tool: '2d' })).toEqual({ code: 400, error: 'no-payload' }));
  it('a fragment that is not base64url is refused (the injection guard)', async () =>
    expect(await reason({ tool: '2d', fragment: '<script>alert(1)</script>' })).toEqual({ code: 400, error: 'bad-payload' }));
  it('an oversized fragment is refused', async () =>
    expect(await reason({ tool: '2d', fragment: 'a'.repeat(70_000) })).toEqual({ code: 413, error: 'payload-too-large' }));
  it('an image that is not a PNG is refused', async () =>
    expect(await reason({ ...GOOD, png: Buffer.from('not a png at all').toString('base64') })).toEqual({
      code: 400,
      error: 'not-a-png',
    }));
});

describe('#1374 — a FULL store refuses; it never evicts', () => {
  it('past the ceiling a new share is refused with the numbers, and old shares are untouched', async () => {
    const id = await shareOk(GOOD);
    const before = readdirSync(dir).length;

    // Point the ceiling below what is already stored.
    const prev = process.env.SHARE_STORE_MAX_BYTES;
    process.env.SHARE_STORE_MAX_BYTES = '10';
    try {
      const res = mockRes();
      await handleShare(mockReq(GOOD), res, { dir });
      expect(res.statusCode).toBe(507);
      const body = JSON.parse(String(res.body));
      expect(body.error).toBe('store-full');
      expect(body.maxBytes).toBe(10);
      expect(typeof body.bytes).toBe('number');
    } finally {
      if (prev === undefined) delete process.env.SHARE_STORE_MAX_BYTES;
      else process.env.SHARE_STORE_MAX_BYTES = prev;
    }

    expect(readdirSync(dir).length, 'nothing was deleted to make room').toBe(before);
    expect((await readShare(id, dir))?.fragment, 'the link already sent still resolves').toBe(GOOD.fragment);
  });

  it('the default ceiling is the operator’s 2 GB allocation', () => {
    expect(DEFAULT_STORE_MAX_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });
});

describe('#1374 — usage is reported in BYTES and count', () => {
  it('counts shares, not files, and sums every byte on disk', async () => {
    const empty = await storeUsage(dir);
    expect(empty.shares).toBe(0);
    expect(empty.bytes).toBe(0);

    await shareOk(GOOD);
    await shareOk(GOOD);
    const used = await storeUsage(dir);
    expect(used.shares, 'two shares, four files').toBe(2);
    expect(used.bytes, 'the image is what grows — it must be in the total').toBeGreaterThan(PNG.length);
  });

  it('a missing directory reads as an empty store, not an error', async () => {
    expect((await storeUsage(path.join(dir, 'nope'))).shares).toBe(0);
  });
});

describe('#1374 — /g/<id> is the half a fragment could never provide', () => {
  const page = async (url: string) => {
    const res = mockRes();
    await handleSharePage(mockReq('', 'GET', url), res, { dir, origin: 'https://themathbible.com' });
    return res;
  };

  it('carries OpenGraph tags a crawler reads WITHOUT running JavaScript', async () => {
    const id = await shareOk(GOOD);
    const res = await page(`/g/${id}`);
    const html = String(res.body);
    expect(res.statusCode).toBe(200);
    expect(html).toContain('property="og:image"');
    expect(html).toContain(`https://themathbible.com/g/${id}.png`);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('ריבוע ABCD');
    expect(html).toContain('name="twitter:card"');
    // Both hand-offs: a preview sandbox may not run the script.
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('location.replace');
  });

  it('sends the student to the RIGHT builder, from the product registry', async () => {
    const two = await shareOk({ ...GOOD, tool: '2d' });
    const an = await shareOk({ ...GOOD, tool: 'analytic' });
    expect(String((await page(`/g/${two}`)).body)).toContain('https://themathbible.com/geo-builder/#');
    expect(String((await page(`/g/${an}`)).body)).toContain('https://themathbible.com/analytic-builder/#');
  });

  it('a title is ESCAPED into the page, never injected', async () => {
    const id = await shareOk({ ...GOOD, title: '<img src=x onerror=alert(1)>' });
    const html = String((await page(`/g/${id}`)).body);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('serves the image as an immutable PNG — a share can never change, so nor can its picture', async () => {
    const id = await shareOk(GOOD);
    const res = await page(`/g/${id}.png`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(Buffer.from(res.body as Buffer).equals(PNG)).toBe(true);
  });

  it('an unknown id answers a STUDENT, not a proxy — in their language, with what to do', async () => {
    const res = await page('/g/abcdefghjkmn');
    expect(res.statusCode).toBe(404);
    expect(String(res.body)).toContain('בקשו מהשולח');
  });
});

/**
 * The hand-off must point where the app ACTUALLY is.
 *
 * `products.json` carries two paths per builder — `url` (production) and `devUrl` (the one dev
 * server). A page that always used `url` hands a developer a 404, which makes the feature testable
 * only after deploy; that is precisely how #1373 reached production. Caught here on the dev server
 * before it shipped, and locked so it stays caught.
 */
describe('#1374 — the share page sends the student where the builder really is', () => {
  const target = async (tool: string, dev: boolean) => {
    const res = mockRes();
    const id = await shareOk({ ...GOOD, tool });
    await handleSharePage(mockReq('', 'GET', `/g/${id}`), res, { dir, origin: 'https://x', dev });
    const m = /location\.replace\("([^"]+)"\)/.exec(String(res.body));
    return m?.[1] ?? '(no redirect)';
  };

  it.each([
    ['2d', false, 'https://x/geo-builder/#'],
    ['2d', true, 'https://x/#'],
    ['analytic', false, 'https://x/analytic-builder/#'],
    ['analytic', true, 'https://x/analytic.html#'],
    ['3d', false, 'https://x/3d-builder/#'],
    ['3d', true, 'https://x/3d.html#'],
  ])('%s, dev=%s → %s', async (tool, dev, expected) => {
    expect(await target(tool as string, dev as boolean)).toContain(expected as string);
  });
});

/**
 * A storage failure must NOT take the proxy down.
 *
 * Not hypothetical: on its first production request this endpoint resolved its store to `/logs`
 * (the service's cwd is `/`), `mkdir` threw EACCES, the rejection escaped the handler and **killed
 * the whole proxy process** — the LLM fallback with it — until systemd restarted it. The path is
 * configured through `SHARE_STORE_PATH` now, and the handler catches regardless: a sharing feature
 * must never be able to stop the tool from parsing.
 */
describe('#1374 — an unwritable store fails the SHARE, never the process', () => {
  it('answers 500 write-failed instead of rejecting', async () => {
    const res = mockRes();
    // A path under a FILE cannot be created — the same class as the EACCES that crashed prod.
    const wall = path.join(dir, 'a-file');
    writeFileSync(wall, 'not a directory');
    await expect(handleShare(mockReq(GOOD), res, { dir: path.join(wall, 'shares') })).resolves.toBeUndefined();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(String(res.body)).error).toBe('write-failed');
  });

  it('and the endpoint still works for the next caller', async () => {
    const wall = path.join(dir, 'a-file2');
    writeFileSync(wall, 'x');
    await handleShare(mockReq(GOOD), mockRes(), { dir: path.join(wall, 'shares') });
    expect(isShareId(await shareOk(GOOD))).toBe(true);
  });
});

/**
 * #1379 — the store refuses what a builder would refuse to open. A short fragment can inflate to
 * megabytes (measured 768:1), and `/g/<id>` hands a stored fragment straight to the student's tab.
 */
describe('#1379 — a share that no builder would open is refused at the door', () => {
  const reason = async (body: unknown) => {
    const res = mockRes();
    await handleShare(mockReq(body), res, { dir });
    return { code: res.statusCode, error: JSON.parse(String(res.body)).error as string };
  };
  const fragmentOf = (bytes: Buffer) => deflateRawSync(bytes).toString('base64url');

  it('a 1 MB decompression bomb in a ~1,400-character fragment is refused 413, fast, and nothing is stored', async () => {
    const bomb = fragmentOf(Buffer.alloc(1024 * 1024));
    expect(bomb.length).toBeLessThan(2000);
    const t0 = performance.now();
    expect(await reason({ tool: '2d', fragment: bomb })).toEqual({ code: 413, error: 'payload-too-large' });
    expect(performance.now() - t0).toBeLessThan(100);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('a fragment inflating to exactly the ceiling is stored; one byte more is refused', async () => {
    await shareOk({ tool: '2d', fragment: fragmentOf(Buffer.alloc(SHARE_INFLATED_MAX_BYTES, 120)) });
    expect(await reason({ tool: '2d', fragment: fragmentOf(Buffer.alloc(SHARE_INFLATED_MAX_BYTES + 1, 120)) })).toEqual({
      code: 413,
      error: 'payload-too-large',
    });
  });

  it('a fragment over the character ceiling is refused even when it would inflate small', async () => {
    expect(await reason({ tool: '2d', fragment: 'A'.repeat(SHARE_FRAGMENT_MAX_CHARS + 1) })).toEqual({
      code: 413,
      error: 'payload-too-large',
    });
  });

  it('a real figure fragment is stored as before', async () => {
    const env = JSON.stringify({ app: 'geo-builder', schemaVersion: 1, seed: 0, facts: [{ utterance: 'ריבוע ABCD' }] });
    await shareOk({ tool: '2d', fragment: fragmentOf(Buffer.from(env)) });
  });

  /**
   * The MIRROR lock. `server/` may not import `shell/` (BOUNDARIES.json), so the ceilings are written
   * twice — and a store that accepts what the builders refuse would store links nobody can open, while
   * one that refuses what they accept would break sharing. Read from the shell SOURCE, since importing
   * it here is the edge the boundary forbids.
   */
  it("the server ceilings EQUAL the builders' arrival ceilings in shell/session/link.ts", () => {
    const src = readFileSync(path.join(__dirname, '..', '..', 'shell', 'session', 'link.ts'), 'utf8');
    const num = (re: RegExp) => {
      const m = src.match(re);
      if (!m) throw new Error(`shell/session/link.ts no longer matches ${re} — update this mirror lock with it`);
      return m.slice(1).map(Number).reduce((a, b) => a * b, 1);
    };
    const emitMax = num(/export const LINK_MAX_CHARS = (\d+);/);
    const arrivalFactor = num(/export const LINK_ARRIVAL_MAX_CHARS = LINK_MAX_CHARS \* (\d+);/);
    const payloadMax = num(/export const PAYLOAD_MAX_BYTES = (\d+) \* (\d+);/);
    expect(SHARE_FRAGMENT_MAX_CHARS).toBe(emitMax * arrivalFactor);
    expect(SHARE_INFLATED_MAX_BYTES).toBe(payloadMax);
  });
});
