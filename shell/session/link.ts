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
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

/**
 * The longest link this will emit. Not a transport limit — WhatsApp's message limit is ~65,000
 * characters and Safari's URL ceiling ~80,000 — but the conservative figure that survives every
 * channel a teacher might use, including ones that wrap or rewrite. Measured over the corpus: the
 * biggest figure (23 facts) encodes to ~1,200 characters, typical ones to 330–530.
 */
export const LINK_MAX_CHARS = 2000;

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

/**
 * The inverse, tolerant of what a chat client does to a link — a leading `#`, a tracking tail,
 * surrounding whitespace. Returns null for anything that is not one of our payloads (a truncated
 * blob, a foreign fragment, an inflate that fails), so the caller REFUSES instead of half-loading.
 */
export function decodeFigurePayload(fragment: string): string | null {
  const cleaned = fragment.trim().replace(/^#+/, '').split(/[?&]/)[0];
  if (!cleaned) return null;
  const bytes = fromBase64Url(cleaned);
  if (!bytes || bytes.length === 0) return null;
  try {
    const text = strFromU8(inflateSync(bytes));
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
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
