/**
 * The SHORT link (#1374) — upload a figure and its preview, get `themathbible.com/g/<id>` back.
 *
 * `shell/session/link.ts` stays exactly as it was: it makes the long fragment link, which is still
 * what the figure travels as. This module only trades that fragment for a short id, and it is
 * product-free — the caller supplies the fragment, the tool id and the image.
 *
 * **The fragment link is the FALLBACK, not a legacy path.** The operator's own words were *"too long
 * and ugly"*, not "broken", so when the server is unreachable or full the caller still has a link
 * that works offline and forever. A share feature that fails closed when the network hiccups would
 * be worse than the long URL it replaced.
 *
 * **The clipboard is the caller's problem, and a real one.** Uploading is asynchronous, and Safari
 * rejects a clipboard write issued after an `await` — the user-gesture context is gone by then.
 * So this returns the URL and says nothing about copying; the caller shows it and offers a copy on a
 * fresh gesture. That is why {@link shortLinkFor} does not touch `navigator.clipboard`.
 */

export type ShortLinkResult =
  | { ok: true; url: string }
  /** The store is at the operator's allocation — the caller falls back to the fragment link. */
  | { ok: false; reason: 'store-full' }
  /** Offline, blocked, or the server said no. The fragment link still works. */
  | { ok: false; reason: 'unavailable' };

export interface ShortLinkRequest {
  /** Where the share endpoint lives — the caller's base (`import.meta.env.BASE_URL`). */
  base: string;
  /** Which builder this figure belongs to, so `/g/<id>` reopens the right one. */
  tool: string;
  /** The base64url blob the long link would have carried after `#`. */
  fragment: string;
  /** The rendered preview, base64 (no data: prefix). Optional — a share without one still works. */
  png?: string;
  /** The figure's name, shown in the chat preview. */
  title?: string;
  /** Injected for tests; defaults to the global. */
  fetchImpl?: typeof fetch;
  /** The public origin of the short link. Defaults to the page's own. */
  origin?: string;
}

/**
 * Upload and return the short URL, or a named reason to fall back.
 *
 * Never throws: a share button that explodes on a flaky network is worse than one that quietly
 * hands back the long link.
 */
export async function shortLinkFor(req: ShortLinkRequest): Promise<ShortLinkResult> {
  const doFetch = req.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!doFetch) return { ok: false, reason: 'unavailable' };

  let res: Response;
  try {
    res = await doFetch(`${req.base}api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tool: req.tool,
        fragment: req.fragment,
        ...(req.png ? { png: req.png } : {}),
        ...(req.title ? { title: req.title } : {}),
      }),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  // 507 is the operator's allocation being reached. It is called out separately because the caller
  // should say something different: "the store is full" is actionable by him, "we could not reach
  // the server" is not.
  if (res.status === 507) return { ok: false, reason: 'store-full' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };

  let id: unknown;
  try {
    id = ((await res.json()) as { id?: unknown }).id;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (typeof id !== 'string' || !id) return { ok: false, reason: 'unavailable' };

  const origin = req.origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return { ok: true, url: `${origin}/g/${id}` };
}

/** A canvas PNG blob → base64 without the `data:` prefix, which is what the endpoint takes. */
export async function pngToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  // Chunked: a 100 KB image is ~100k arguments, and String.fromCharCode(...all) overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
