/**
 * #903 (ADR-W-043) — THE DEPLOY RECIPE IS SELF-ENFORCING, so builder N+1 cannot inherit the hole.
 *
 * The complex builder joined the deploy table with no `deploy/apache-*.conf` at all, so
 * `/complex-builder/api/*` answered 404 from its first deploy. `/api/config` was worse: implemented
 * server-side for every tool and proxied for NONE — a shipped admin feature silently inert.
 *
 * Neither failure could be seen from the repo, because nothing here knew the deploy recipe had a
 * per-product step. Now it does: adding a product to `products.json` without its conf fails the suite
 * rather than failing quietly in production a month later.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import registry from '../../products.json';

const DEPLOY = join(__dirname, '..', '..', 'deploy');
/** `/geo-builder/` → `apache-geo-builder.conf` */
const confFor = (url: string) => `apache${url.replace(/\/$/, '').replace(/\//g, '-')}.conf`;
const enabled = registry.products.filter((p) => p.enabled !== false);

describe('#903 — every deployed builder has a reverse-proxy conf', () => {
  it('the registry is the source: each enabled product names an existing conf', () => {
    const missing = enabled.filter((p) => !existsSync(join(DEPLOY, confFor(p.url))));
    expect(missing.map((p) => `${p.id} → deploy/${confFor(p.url)}`)).toEqual([]);
  });

  it('and every conf proxies api/config — the route that was implemented for all and routed for none', () => {
    for (const p of enabled) {
      const conf = readFileSync(join(DEPLOY, confFor(p.url)), 'utf8');
      const prefix = p.url.replace(/\/$/, '');
      // ProxyPass AND ProxyPassReverse — the existing confs pair them, and a bare ProxyPass would
      // rewrite the response's Location header wrongly on any redirect.
      expect(conf, `${p.id}: ProxyPass for api/config`).toContain(
        `ProxyPass ${prefix}/api/config http://127.0.0.1:8788/api/config`,
      );
      expect(conf, `${p.id}: ProxyPassReverse for api/config`).toContain(
        `ProxyPassReverse ${prefix}/api/config http://127.0.0.1:8788/api/config`,
      );
    }
  });

  it('every ProxyPass has its ProxyPassReverse twin, in every conf', () => {
    for (const name of readdirSync(DEPLOY).filter((f) => f.startsWith('apache-') && f.endsWith('.conf'))) {
      const lines = readFileSync(join(DEPLOY, name), 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('ProxyPass'));
      const fwd = lines.filter((l) => l.startsWith('ProxyPass ')).map((l) => l.slice('ProxyPass '.length));
      const rev = lines.filter((l) => l.startsWith('ProxyPassReverse ')).map((l) => l.slice('ProxyPassReverse '.length));
      expect(fwd.sort(), `${name}: every ProxyPass is paired`).toEqual(rev.sort());
    }
  });

  it('a conf never proxies the bare /admin tail for a builder with no dashboard of its own', () => {
    // Apache strips the product prefix, so `/complex-builder/admin` would reach the 2-D dashboard's
    // `/admin` tail and serve 2-D DATA under the complex prefix — worse than the 404 it replaces.
    // 2-D owns `/admin`; 3-D has the distinct `/admin3`. Anything else must have its own tail first.
    const conf = readFileSync(join(DEPLOY, 'apache-complex-builder.conf'), 'utf8');
    expect(conf).not.toMatch(/^ProxyPass \/complex-builder\/admin /m);
  });
});
