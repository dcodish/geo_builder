/**
 * THE USAGE-EVENT POSTER, ONCE (#1243) — fire-and-forget, and it may never break the app.
 *
 * Every builder that reports usage posts the same lean JSON to the same `${BASE_URL}api/log`
 * endpoint, tagged with its own product id. 2-D and 3-D each carried their own byte-identical copy of
 * this function; analytic's would have been the third and complex's the fourth, which is the mistake
 * the operator named on [#1358](https://github.com/dcodish/geo_builder/issues/1358).
 *
 * `shell/` is the right home: every product tree may import it (`BOUNDARIES.json`) and it imports
 * none. Nothing here knows a product — the id and the URL arrive from the caller.
 *
 * ## Two properties that are not incidental
 *
 * **It never throws.** A logger that can break a submit is worse than no logger, so the `fetch` is
 * wrapped and its rejection swallowed. Both shipped copies do exactly this and the comment is kept.
 *
 * **`keepalive`** lets the last event of a session survive the page unloading — without it a
 * session's final submit, often the interesting one, is the event most likely to be lost.
 */

/** What a product tells the poster about itself. Nothing product-specific lives in this module. */
export interface UsagePosterSpec {
  /**
   * The product's registry id (`'3d'`, `'analytic'`, …), sent as the `tool` tag so the server files
   * the event under the right product.
   *
   * **Omit it for 2-D.** That client has never tagged its events and the server reads an absent tag as
   * 2-D; adding the tag now would be a behaviour change in the one product with live historical data.
   */
  tool?: string;
  /**
   * The endpoint, which the caller builds from its own `import.meta.env.BASE_URL` — `/api/log` in dev,
   * `/<product>-builder/api/log` under a deployed subpath. Passed in rather than computed here so this
   * module needs no build-time knowledge of who is bundling it.
   */
  url: string;
}

/**
 * Build a `post(body)` for one product.
 *
 * The returned function is the ONLY thing that reaches the network in this lane, so "logging cannot
 * break the app" is a property of one function rather than a habit repeated per tree.
 */
export function makeUsagePoster({ tool, url }: UsagePosterSpec): (body: Record<string, unknown>) => void {
  return (body: Record<string, unknown>): void => {
    try {
      void fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // the tag goes FIRST so a body that carries its own `tool` wins — a caller forwarding an
        // already-tagged event is not silently re-tagged
        body: JSON.stringify(tool === undefined ? body : { tool, ...body }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* logging must never break the app */
    }
  };
}
