/**
 * A figure travels as a LINK (#1189, ADR-W-079) — the encoder, the decoder, and the refusal.
 *
 * A teacher builds a figure and sends a WhatsApp message; the student taps it and lands in the
 * builder with that figure, fully editable. The delivery decision was the operator's: **a link, not
 * a file.** A `.geo.json` attachment costs download → "open with" → file manager and students drop
 * out at every step; on a phone a `.json` is close to unopenable, and a web app cannot register a
 * file association.
 *
 * Four properties, each load-bearing:
 *
 *  - **The payload is the product's save envelope**, so a link and a file carry the same thing and
 *    opening one is the same LOAD — the audit, the re-lowering and the refusals all apply.
 *    `shell/` never parses it (ADR-W-016 rule 2).
 *  - **base64url** (`A–Z a–z 0–9 - _`), because every character has to survive a chat client's link
 *    detector. Plain base64's `+ / =` would let it chop the payload mid-blob.
 *  - **A `#` fragment, never a query parameter.** A fragment is never sent to any server, so no
 *    student's figure is logged anywhere and a link-preview fetch sees only the bare app URL.
 *  - **Compressed SYNCHRONOUSLY** (`fflate`'s `deflateSync` — fflate's "deflate" IS the raw stream,
 *    no zlib header), never through `CompressionStream`. Both reasons are about phones: Safari
 *    rejects a clipboard write issued after an `await`, because the user-gesture context is gone by
 *    then, and `CompressionStream` does not exist before iOS 16.4, which would strand students on
 *    older iPhones. ⚠️ Both are from knowledge rather than a device — the synchronous route is
 *    correct under either, which is exactly why it costs nothing to take.
 *
 * And the refusal, which matters more than the encoding: **the caller measures before it copies**
 * ({@link linkFits}). Emitting a URL that some client truncates would hand a student a figure
 * missing its last statements, silently — the cardinal sin here. A link is whole or it is refused.
 */
import { Inflate, deflateSync, strFromU8, strToU8 } from 'fflate';

/**
 * The longest link this will emit. Not a transport limit — WhatsApp's message limit is ~65,000
 * characters and Safari's URL ceiling ~80,000 — but the conservative figure that survives every
 * channel a teacher might use, including ones that wrap or rewrite. Measured over the corpus: the
 * biggest figure (23 facts) encodes to ~1,200 characters, typical ones to 330–530.
 */
export const LINK_MAX_CHARS = 2000;

/**
 * The ARRIVAL ceilings (#1379). `LINK_MAX_CHARS` bounds what this code EMITS — and a link is hand-
 * buildable, so an emit-side cap protects nobody who opens one. A stranger's link is untrusted input,
 * and the decoder used to inflate it with no output bound: measured, a 1,416-character fragment
 * inflated to 1 MB and an 87 KB one to 64 MB, all before anything was validated.
 *
 * - **Characters, before decoding at all.** Nothing this code emits is longer than `LINK_MAX_CHARS`;
 *   the factor of four is headroom for a future raise of the emit cap, never a size a figure needs.
 * - **Bytes, while inflating.** The biggest corpus figure is ~6 KB raw; 256 KB is forty times that.
 *   The inflate is STREAMED in small slices and abandoned the moment it crosses the line, so a
 *   decompression bomb costs about a millisecond instead of its whole expansion.
 *
 * ⚠️ MIRRORED in `server/shareStore.ts` (`server/` may not import `shell/`) — the store refuses to
 * hold a fragment these would refuse to open. A lock in `server/__tests__` holds the two equal.
 */
export const LINK_ARRIVAL_MAX_CHARS = LINK_MAX_CHARS * 4;
export const PAYLOAD_MAX_BYTES = 256 * 1024;
/** Input fed to the inflater per step — small enough that one step's output (≤ ~1,032× its input
 *  for raw deflate) cannot itself be the bomb. */
const INFLATE_SLICE = 512;

const BASE64URL_ONLY = /^[A-Za-z0-9_-]+$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!BASE64URL_ONLY.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** A save-envelope text → the fragment payload. Synchronous by design (see the module docblock). */
export function encodeFigurePayload(payload: string): string {
  return toBase64Url(deflateSync(strToU8(payload)));
}

/** Why an arriving payload was not opened. The two are different messages to the student: a
 *  broken link is the sender's mistake, a too-large one is a link this tool will not open. */
export type PayloadRefusal = 'malformed' | 'too-large';

export type PayloadRead = { ok: true; text: string } | { ok: false; reason: PayloadRefusal };

/** Inflate with an output ceiling — `too-large` past it, and past it NOTHING more is inflated. */
function inflateBounded(bytes: Uint8Array, maxBytes: number): Uint8Array | 'too-large' {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let over = false;
  const inflater = new Inflate((chunk) => {
    total += chunk.length;
    if (total > maxBytes) over = true;
    else chunks.push(chunk);
  });
  for (let i = 0; i < bytes.length && !over; i += INFLATE_SLICE) {
    inflater.push(bytes.subarray(i, i + INFLATE_SLICE), i + INFLATE_SLICE >= bytes.length);
  }
  if (over) return 'too-large';
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * The inverse, tolerant of what a chat client does to a link — a leading `#`, a tracking tail,
 * surrounding whitespace — and BOUNDED against what a stranger can put in one (#1379). Refuses,
 * naming which: `malformed` for anything that is not one of our payloads (a truncated blob, a
 * foreign fragment, an inflate that fails), `too-large` for a fragment or an expansion past the
 * arrival ceilings. The caller REFUSES in both cases instead of half-loading.
 */
export function readFigurePayload(fragment: string): PayloadRead {
  const cleaned = fragment.trim().replace(/^#+/, '').split(/[?&]/)[0];
  if (!cleaned) return { ok: false, reason: 'malformed' };
  if (cleaned.length > LINK_ARRIVAL_MAX_CHARS) return { ok: false, reason: 'too-large' };
  const bytes = fromBase64Url(cleaned);
  if (!bytes || bytes.length === 0) return { ok: false, reason: 'malformed' };
  try {
    const inflated = inflateBounded(bytes, PAYLOAD_MAX_BYTES);
    if (inflated === 'too-large') return { ok: false, reason: 'too-large' };
    const text = strFromU8(inflated);
    return text.length > 0 ? { ok: true, text } : { ok: false, reason: 'malformed' };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

/** {@link readFigurePayload} for a caller that only needs the text — null for either refusal. */
export function decodeFigurePayload(fragment: string): string | null {
  const r = readFigurePayload(fragment);
  return r.ok ? r.text : null;
}

/**
 * The shareable URL. `base` is the caller's — each builder is served from its own path
 * (`/geo-builder/`, `/3d.html`, …) and dev serves 2-D from `/`, so it is never hardcoded here.
 */
export function figureLinkUrl(base: string, payload: string): string {
  return `${base}#${encodeFigurePayload(payload)}`;
}

/** Would this link be emitted, or refused for length? The caller asks BEFORE it copies. */
export function linkFits(url: string, max: number = LINK_MAX_CHARS): boolean {
  return url.length <= max;
}

/**
 * The payload a page was opened with, or null when the URL carries none — and null is also what a
 * MALFORMED fragment gives, so the caller distinguishes the two by whether a fragment was present
 * at all. "You followed a broken link" and "you opened the app normally" are different messages.
 *
 * Product-independent, and deliberately here rather than in each builder: the first copy lived in
 * 2-D, and the sibling port (#1372) would have made four.
 */
export function payloadInHash(hash: string): string | null {
  return hash && hash !== '#' ? decodeFigurePayload(hash) : null;
}

/**
 * Drop the fragment once it has been read.
 *
 * Without this, a refresh — or the session persistence (ADR-W-078) restoring the student's LATER
 * edits — would sit behind a URL still saying "open this original figure", and the next reload would
 * quietly throw their work away. The link delivers the figure once; after that the session is theirs.
 */
export function consumeFragment(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  } catch {
    /* a sandboxed history is not a reason to fail the load that just succeeded */
  }
}

/**
 * Where a builder lives, for a link that must reopen THIS builder.
 *
 * It reads `location.pathname`, not the build's configured base, and that is a correction rather
 * than a preference. In production each builder is built with its own base (`/geo-builder/`,
 * `/3d-builder/`, …) and the two agree. **In development all four are served by one server from
 * `/`**, with the siblings on `/3d.html`, `/complex.html`, `/analytic.html` — so
 * `import.meta.env.BASE_URL` is `/` for every one of them, and a link copied from 3-D reopened the
 * 2-D app. Measured, not reasoned: an analytic link built that way round-tripped to an empty canvas.
 *
 * `pathname` is right in both: `/analytic.html` in dev, `/analytic-builder/` in production. The
 * query is deliberately dropped — a shared figure should not carry the sender's tracking tail — and
 * `base` remains the fallback for a non-browser caller.
 */
export function appBaseUrl(base: string): string {
  if (typeof window === 'undefined') return base;
  return `${window.location.origin}${window.location.pathname || base}`;
}

/** What arrived, and what the caller must decide about it. */
export interface SharedLinkArrival {
  /** The decoded payload, or null when the fragment was present but unreadable (refuse out loud). */
  payload: string | null;
  /** When `payload` is null, why — so «too large to open» is not shown as «broken link» (#1379). */
  refusal?: PayloadRefusal;
}

/**
 * SUBSCRIBE to shared links — the mount read plus every later one (#1373).
 *
 * The first implementation read `location.hash` once, in a mount effect. Measured against
 * `prod/2026-09-23-2`: a URL differing from the current one only by its `#` is a **same-document
 * navigation** — the browser fires `hashchange` and does NOT reload the document, so React never
 * remounts and the effect never runs again. The operator hit it on the refusal case («on an existing
 * browser window just did nothing»); the same cause silently broke the SUCCESS case, which is the
 * feature itself: a student who already has the builder open in that tab taps a teacher's link and
 * gets no figure, no message, and a fragment left sitting in the URL.
 *
 * So the fragment is a stream, not a boot value. `handler` runs for the fragment present at
 * subscribe time (the cold-load case) and again on every `hashchange` (the open-tab case).
 *
 * **No loop:** the fragment is consumed with `replaceState`, which by specification does not fire
 * `hashchange`. Asserted by a lock, because "it does not loop" is exactly the property that would
 * fail silently and expensively.
 */
export function onSharedLink(handler: (arrival: SharedLinkArrival) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const read = () => {
    const hash = window.location.hash;
    if (!hash || hash === '#') return; // an ordinary visit, not a shared link
    const got = readFigurePayload(hash);
    consumeFragment(); // the link delivers once; after that the session is the student's
    handler(got.ok ? { payload: got.text } : { payload: null, refusal: got.reason });
  };
  read();
  window.addEventListener('hashchange', read);
  return () => window.removeEventListener('hashchange', read);
}
