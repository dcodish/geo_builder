/**
 * The SHARE STORE (#1374) — a figure gets a short link and a WhatsApp preview.
 *
 * `POST .../api/share` takes a figure's save envelope plus a rendered PNG, writes both, and returns
 * a short id. `GET /g/<id>` then serves a small HTML page carrying the OpenGraph tags a chat client
 * reads, which hands the figure to the builder.
 *
 * **Why the server has to hold the figure at all.** ADR-W-079 put the payload in the URL's `#`
 * fragment precisely so it never reached us — and a fragment is invisible to a link-preview crawler.
 * The operator asked for a preview; a preview therefore REQUIRES server-side storage. That is a
 * trade, and he made it knowingly (#1374, 2026-09-23). The fragment link stays as the offline path.
 *
 * Four properties, each one a decision rather than an implementation detail:
 *
 * **What is stored is the FRAGMENT, not the envelope.** The client uploads exactly the base64url
 * blob it would otherwise have put after the `#`, so the server stays unable to read a figure at
 * all — it moves an opaque string and a picture. `/g/<id>` hands that blob straight back as a
 * fragment, which means the builders' existing loader opens a short link with no new code path and
 * no second format to keep in step.
 *
 *  - **Append-only.** Operator ruling: *"a user cannot access an existing diagram and change and
 *    overwrite a diagram. he can only create a new version."* Nothing here updates or deletes a
 *    stored share. So there is no overwrite attack, no ownership to authenticate, and a link's
 *    content can never change under the person holding it — a teacher's link means the same figure
 *    forever.
 *  - **Unguessable ids.** A share URL is public to whoever holds it, so short must not mean
 *    enumerable: 12 base32 characters from `randomBytes` is ~60 bits, which cannot be walked.
 *  - **A hard ceiling, because an allocation with no ceiling is a wish.** The operator allocated
 *    2 GB. Past it the store REFUSES new shares (507) and says so; it never evicts, because eviction
 *    would silently kill links already sent — the one failure a teacher could not diagnose. Refusing
 *    is loud and lands on the person who can act on it.
 *  - **Per-request caps and a rate limit**, distinct from the total: an open "store this blob"
 *    endpoint without them is an abuse surface.
 *
 * The content itself is non-personal by ruling — geometry statements and a picture of shapes, no
 * names and no accounts. The in-app privacy note is updated in the same change to say a SHARED
 * figure is stored, because the previous wording ("nothing leaves your machine") would otherwise be
 * untrue, harmless content or not.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { clientIp, makeRateLimiter, readBody } from './http';
import { PRODUCT_IDS, DEFAULT_TOOL } from './toolRouting';
import registry from '../products.json';

/** ~60 bits over an unambiguous alphabet (no 0/O/1/l) — short to read aloud, impossible to walk. */
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_LENGTH = 12;

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20; // shares/minute/IP — a teacher shares a handful; a script does not
/**
 * The ARRIVAL ceilings (#1379), MIRRORED from `shell/session/link.ts` (`LINK_ARRIVAL_MAX_CHARS`,
 * `PAYLOAD_MAX_BYTES`) — `server/` may not import `shell/`, so the contract lives on both sides and a
 * lock in `server/__tests__` holds them equal. The store refuses exactly what a builder would refuse
 * to open: holding a fragment no builder opens serves nobody, and serving one from `/g/` would hand
 * the student's tab the decompression bomb the builders now refuse.
 */
export const SHARE_FRAGMENT_MAX_CHARS = 8000;
export const SHARE_INFLATED_MAX_BYTES = 256 * 1024;
const MAX_PAYLOAD_BYTES = SHARE_FRAGMENT_MAX_CHARS; // base64url is ASCII: one byte per character
const MAX_PNG_BYTES = 512 * 1024; // measured: a busy figure at ×2 is ~74 KB, ×3 ~128 KB
const MAX_BODY = MAX_PAYLOAD_BYTES + MAX_PNG_BYTES * 2; // base64 inflates by 4/3, plus JSON framing

/** The operator's allocation (#1374): 2 GB, ~40,000 shares at the measured ~50 KB each. */
export const DEFAULT_STORE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

const rateLimited = makeRateLimiter(MAX_PER_WINDOW, WINDOW_MS);

/** Where shares live: `SHARE_STORE_PATH` env, else `./logs/shares` beside the other data. */
export function shareStorePath(): string {
  return process.env.SHARE_STORE_PATH || path.resolve(process.cwd(), 'logs', 'shares');
}

export function storeMaxBytes(): number {
  const raw = Number(process.env.SHARE_STORE_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STORE_MAX_BYTES;
}

export function newShareId(): string {
  const bytes = randomBytes(ID_LENGTH);
  let out = '';
  for (let i = 0; i < ID_LENGTH; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

/** An id is only ever consumed as a FILENAME, so anything outside the alphabet is refused — this is
 *  the path-traversal guard, and it is a whitelist rather than a blacklist on purpose. */
export function isShareId(id: unknown): id is string {
  return typeof id === 'string' && id.length === ID_LENGTH && [...id].every((c) => ID_ALPHABET.includes(c));
}

export interface StoreUsage {
  bytes: number;
  shares: number;
  maxBytes: number;
}

/** What the store currently holds — the number the dashboard reports, in BYTES and count, because
 *  the PNG is what grows and a count alone hides it. */
export async function storeUsage(dir = shareStorePath()): Promise<StoreUsage> {
  const maxBytes = storeMaxBytes();
  try {
    const names = await readdir(dir);
    let bytes = 0;
    let shares = 0;
    for (const name of names) {
      try {
        const s = await stat(path.join(dir, name));
        bytes += s.size;
        if (name.endsWith('.json')) shares++;
      } catch {
        /* a file vanishing mid-scan is not an error worth failing a usage read over */
      }
    }
    return { bytes, shares, maxBytes };
  } catch {
    return { bytes: 0, shares: 0, maxBytes }; // no directory yet = an empty store
  }
}

export interface SharedFigure {
  /** The product this figure belongs to — decides which builder the link opens. */
  tool: string;
  /** The base64url FRAGMENT the client would otherwise have put after `#`. Opaque here. */
  fragment: string;
  /** A one-line description for the link preview, supplied by the client (the figure's name). */
  title?: string;
  savedAt: string;
}

/** Read one share, or null when the id is unknown / unreadable. */
export async function readShare(id: string, dir = shareStorePath()): Promise<SharedFigure | null> {
  if (!isShareId(id)) return null;
  try {
    const raw = await readFile(path.join(dir, `${id}.json`), 'utf8');
    const rec = JSON.parse(raw) as SharedFigure;
    return typeof rec?.fragment === 'string' && rec.fragment ? rec : null;
  } catch {
    return null;
  }
}

export async function readShareImage(id: string, dir = shareStorePath()): Promise<Buffer | null> {
  if (!isShareId(id)) return null;
  try {
    return await readFile(path.join(dir, `${id}.png`));
  } catch {
    return null;
  }
}

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};

/**
 * `POST .../api/share` — store a figure + its preview, answer with the id.
 *
 * Refuses, in this order and each with its own reason so a client can tell them apart: a wrong
 * method, too many requests, a body over the cap, a malformed body, an unknown tool, an oversized
 * payload or image, and finally a FULL store.
 */
export async function handleShare(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { dir?: string; now?: () => Date } = {},
): Promise<void> {
  const dir = opts.dir ?? shareStorePath();
  const now = opts.now ?? (() => new Date());

  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  if (rateLimited(clientIp(req))) return json(res, 429, { error: 'rate' });

  const body = await readBody(req, MAX_BODY);
  if (body === null) return json(res, 413, { error: 'too-large' });

  let parsed: { tool?: unknown; fragment?: unknown; png?: unknown; title?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return json(res, 400, { error: 'bad-json' });
  }

  const tool = typeof parsed.tool === 'string' && parsed.tool ? parsed.tool : DEFAULT_TOOL;
  // Unknown tag REFUSES rather than defaulting — ADR-W-077's rule, for the same reason: a default
  // arm silently files a third product's data under the first product's name.
  if (!PRODUCT_IDS.includes(tool)) return json(res, 400, { error: 'unknown-tool' });

  const fragment = parsed.fragment;
  if (typeof fragment !== 'string' || !fragment) return json(res, 400, { error: 'no-payload' });
  if (Buffer.byteLength(fragment, 'utf8') > MAX_PAYLOAD_BYTES) return json(res, 413, { error: 'payload-too-large' });
  // base64url ONLY: it is echoed into a URL fragment and into HTML, so anything else is refused at
  // the door rather than escaped later. This is the injection guard for the /g/ page.
  if (!/^[A-Za-z0-9_-]+$/.test(fragment)) return json(res, 400, { error: 'bad-payload' });
  // #1379 — a short fragment can still inflate to megabytes (measured 768:1). Inflate it here with an
  // output ceiling, so a bomb is refused at the door rather than stored and served from /g/.
  if (inflatesPastCeiling(fragment)) return json(res, 413, { error: 'payload-too-large' });

  let png: Buffer | null = null;
  if (typeof parsed.png === 'string' && parsed.png) {
    png = Buffer.from(parsed.png, 'base64');
    if (png.length > MAX_PNG_BYTES) return json(res, 413, { error: 'image-too-large' });
    // A preview that is not a PNG would be served as one; check the magic bytes rather than trust.
    if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) return json(res, 400, { error: 'not-a-png' });
  }

  const usage = await storeUsage(dir);
  const incoming = Buffer.byteLength(fragment, 'utf8') + (png?.length ?? 0);
  if (usage.bytes + incoming > usage.maxBytes) {
    // FULL. Never evict — a link already sent must not stop working (#1374 ruling).
    return json(res, 507, { error: 'store-full', bytes: usage.bytes, maxBytes: usage.maxBytes });
  }

  const title = typeof parsed.title === 'string' ? parsed.title.slice(0, 120) : undefined;
  const record: SharedFigure = { tool, fragment, savedAt: now().toISOString(), ...(title ? { title } : {}) };

  /**
   * EVERY write failure is caught here, and that is not defensive habit — it is a defect this
   * endpoint already caused. On its first production request the store path resolved to `/logs`
   * (the service's cwd is `/`), `mkdir` threw EACCES, and the rejection escaped the handler and
   * **killed the whole proxy process** — taking the LLM fallback down with it until systemd
   * restarted it. A sharing feature must never be able to stop the tool from parsing.
   *
   * So: the share fails, says so, and the process lives. The path itself is configured through
   * `SHARE_STORE_PATH` beside `EVENTS_LOG_PATH`, which is the fix for the original cause.
   */
  try {
    await mkdir(dir, { recursive: true });
    // Append-only: a fresh id every time, and an existing one is never overwritten. The retry
    // covers the (vanishingly unlikely) collision rather than pretending it cannot happen.
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = newShareId();
      try {
        await writeFile(path.join(dir, `${id}.json`), JSON.stringify(record), { flag: 'wx' });
        if (png) await writeFile(path.join(dir, `${id}.png`), png);
        return json(res, 200, { id });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      }
    }
    return json(res, 500, { error: 'no-id' });
  } catch (err) {
    // Named on the server so the operator can see WHY in the journal; the client only learns that
    // storing failed, and falls back to the long link that needs no server at all.
    console.error('[geo-proxy] share write failed:', (err as Error)?.message ?? err);
    return json(res, 500, { error: 'write-failed' });
  }
}

/**
 * Does this base64url fragment inflate past {@link SHARE_INFLATED_MAX_BYTES}? zlib stops at the
 * ceiling (`maxOutputLength`), so the check costs the ceiling at most, never the bomb. Only the SIZE is
 * judged: a fragment that fails to inflate for another reason is left to the builder, which refuses it
 * as a broken link — the server still never reads a figure.
 */
function inflatesPastCeiling(fragment: string): boolean {
  try {
    inflateRawSync(Buffer.from(fragment, 'base64url'), { maxOutputLength: SHARE_INFLATED_MAX_BYTES });
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE';
  }
}

/** HTML-escape for the few values that reach the page (a title the client supplied). */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * The path of a builder, from the ONE registry (`products.json`) — never hardcoded here.
 *
 * `url` is the PRODUCTION path (`/geo-builder/`); `devUrl` is where `npm run dev` serves the same
 * app (`/`, `/3d.html`, …). They differ, so a page that always used `url` would hand a developer a
 * 404 — and a feature only testable after deploy is how #1373 reached production.
 */
function builderUrl(tool: string, dev = false): string {
  const entry = (registry.products as { id?: string; url?: string; devUrl?: string }[]).find((p) => p.id === tool);
  return (dev ? entry?.devUrl : entry?.url) ?? (dev ? '/' : '/geo-builder/');
}

/**
 * `GET /g/<id>` — the shareable page, and the whole reason the store exists.
 *
 * It serves two audiences from one URL:
 *
 *  - **a link-preview crawler** (WhatsApp, Telegram, Slack…), which reads the OpenGraph tags and
 *    the image and never runs JavaScript. This is the half a `#` fragment could never provide;
 *  - **a student**, who is sent straight on to the builder with the figure in the fragment, which
 *    is the path ADR-W-079 already proved. Both a `<meta http-equiv="refresh">` and a script, so
 *    the hand-off does not depend on JS running — an iOS in-app preview sandbox may not run it.
 *
 * `GET /g/<id>.png` serves the preview image itself.
 */
export async function handleSharePage(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { dir?: string; origin?: string; dev?: boolean } = {},
): Promise<void> {
  const dir = opts.dir ?? shareStorePath();
  const raw = (req.url ?? '').split('?')[0];
  const tail = raw.slice(raw.lastIndexOf('/g/') + 3);

  /**
   * NOTHING under `/g/` belongs in a search index (#1384) — set once, here, so every branch below
   * carries it: the page, the image, and the dead-link 404.
   *
   * A share page is a redirect with a title the UPLOADER chose (120 characters, stored as given), so
   * an indexable one lets anyone put their own words on a themathbible.com result; and a legitimate
   * one is a thin duplicate of the builder it hands off to. Instant refresh usually makes Google
   * treat the page as a redirect — "usually" is why this is a header and not a hope.
   *
   * It is a header, NOT a `Disallow: /g/` in robots.txt, on purpose (operator ruling on #1384): a
   * disallowed page is never fetched, so its noindex is never read — and a chat app's preview
   * crawler that honours robots.txt would lose the preview #1374 exists for. OG tags are untouched.
   */
  res.setHeader('x-robots-tag', 'noindex');

  if (tail.endsWith('.png')) {
    const png = await readShareImage(tail.slice(0, -4), dir);
    if (!png) {
      res.statusCode = 404;
      return void res.end('not found');
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    // Immutable by construction: a share is append-only, so its image can never change (#1374).
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    return void res.end(png);
  }

  const share = await readShare(tail, dir);
  if (!share) {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    // A dead id is a STUDENT-facing page, so it says something a student can act on, in their
    // language, rather than the bare "not found" a proxy would emit.
    return void res.end(
      '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>הקישור לא נמצא</title>' +
        '<body style="font-family:system-ui;margin:3rem auto;max-width:34rem;line-height:1.6;color:#0f172a">' +
        '<h1 style="font-size:1.25rem">הקישור אינו תקין או שפג תוקפו</h1>' +
        '<p>בקשו מהשולח לשלוח את הקישור שוב.</p></body></html>',
    );
  }

  const origin = opts.origin ?? process.env.PUBLIC_ORIGIN ?? 'https://themathbible.com';
  const target = `${origin}${builderUrl(share.tool, opts.dev)}#${share.fragment}`;
  const title = share.title ? esc(share.title) : 'שרטוט גאומטרי';
  const image = `${origin}/g/${tail}.png`;

  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  // The PAGE is not cached: it is tiny, and a stale copy would outlive a change to how the
  // hand-off works. The image beside it is immutable and cached hard.
  res.setHeader('cache-control', 'no-cache');
  res.end(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="שרטוט גאומטרי — לחצו לפתיחה ולעריכה">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${origin}/g/${tail}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
</head><body style="font-family:system-ui;margin:3rem auto;max-width:34rem;line-height:1.6;color:#0f172a">
<p>פותח את השרטוט…</p>
<p><a href="${esc(target)}">אם הדף לא נפתח, לחצו כאן</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`,
  );
}
