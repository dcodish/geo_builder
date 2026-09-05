/**
 * #903 (ADR-W-043) — «UNREACHABLE» IS NOT «UNSET».
 *
 * The complex builder's operator curation was inert for a month and nothing noticed, because
 * `/complex-builder/api/config` had never been added to a reverse-proxy conf (the route had never
 * been proxied for ANY product) and the app's own degraded path swallowed the 404 into the same
 * `null` an empty config produces. The graceful fallback was working exactly as designed — that is
 * what made the hole invisible.
 *
 * The degraded path stays: a student must never see proxy plumbing, and both non-configured outcomes
 * leave the roster untouched. What changes is that the OPERATOR can now be told the difference, since
 * only one of the two means a setting they made is being thrown away.
 *
 * This is the lock the ruling called "the whole point of part 2" — the thing that would silently rot.
 */

import { describe, expect, it } from 'vitest';
import { configOf, readToolConfig, type ConfigRead } from '../switcherConfig';

/** A `fetch` that answers with one canned response — no network, no server. */
const answering = (status: number, body?: unknown): typeof fetch =>
  (async () =>
    ({
      status,
      json: async () => {
        if (body === undefined) throw new Error('no body');
        return body;
      },
    }) as unknown as Response) as unknown as typeof fetch;

const failing = (why: string): typeof fetch =>
  (async () => {
    throw new Error(why);
  }) as unknown as typeof fetch;

describe('#903 — the three outcomes of a config read', () => {
  it('200 with a config ⇒ configured', async () => {
    const r = await readToolConfig('complex', '/complex-builder/', answering(200, { switcher: { hidden: ['3d'] } }));
    expect(r.status).toBe('configured');
    expect(configOf(r)).toEqual({ switcher: { hidden: ['3d'] } });
  });

  it('204 ⇒ UNSET — the server answered, there is simply no curation', async () => {
    const r = await readToolConfig('complex', '/complex-builder/', answering(204));
    expect(r).toEqual({ status: 'unset' });
  });

  it('404 ⇒ UNREACHABLE, never unset — this is the whole point', async () => {
    const r = await readToolConfig('complex', '/complex-builder/', answering(404));
    expect(r.status).toBe('unreachable');
    // the reason names the URL, so an operator can see WHICH path is not routed
    expect((r as Extract<ConfigRead, { status: 'unreachable' }>).why).toContain('/complex-builder/api/config');
    expect((r as Extract<ConfigRead, { status: 'unreachable' }>).why).toContain('404');
  });

  it('a server error and a dead network are unreachable too, not unset', async () => {
    expect((await readToolConfig('2d', '/geo-builder/', answering(500))).status).toBe('unreachable');
    expect((await readToolConfig('2d', '/geo-builder/', failing('ECONNREFUSED'))).status).toBe('unreachable');
  });

  it('200 with a body that is not JSON is unreachable, not a crash', async () => {
    const r = await readToolConfig('2d', '/geo-builder/', answering(200));
    expect(r.status).toBe('unreachable');
  });

  it('THE STUDENT IS UNAFFECTED — every non-configured outcome yields null for the roster merge', async () => {
    for (const f of [answering(204), answering(404), answering(500), failing('down')]) {
      expect(configOf(await readToolConfig('complex', '/complex-builder/', f))).toBeNull();
    }
  });

  it('never throws and never rejects — a caller cannot reintroduce the collapse by forgetting a catch', async () => {
    await expect(readToolConfig('complex', '/complex-builder/', failing('boom'))).resolves.toBeTruthy();
  });

  it('the request goes through the app’s OWN public prefix — which is what makes a proxy hole observable', async () => {
    let seen = '';
    const spy = (async (u: string) => {
      seen = u;
      return { status: 204 } as unknown as Response;
    }) as unknown as typeof fetch;
    await readToolConfig('complex', '/complex-builder/', spy);
    expect(seen).toBe('/complex-builder/api/config?tool=complex');
  });
});
