/**
 * A3 (#662) — the operator config, bounded by choose-among-what-exists:
 *  - an id absent from the registry is refused (builder 5 cannot be conjured from a form);
 *  - a quick command the tool's grammar refuses is refused AT SAVE, naming entry + reason;
 *  - a tool with no validation lane refuses quick commands honestly (until B4 brings the lane);
 *  - missing / malformed config reads as null — the degraded path that keeps builders working;
 *  - writes are atomic (tmp + rename), and the public read answers 204 for anything unknown.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleConfigRead,
  readToolConfig,
  validateToolConfig,
  writeToolConfig,
  type ToolConfig,
} from '../adminConfig';
import { configFromForm } from '../admin';

const scratch = () => mkdtempSync(join(tmpdir(), 'geo-config-'));

describe('validateToolConfig — choose among what exists', () => {
  it('accepts an empty config and a registry-true curation', () => {
    expect(validateToolConfig('complex', {})).toEqual([]);
    expect(
      validateToolConfig('complex', {
        switcher: { hidden: ['3d'], order: ['complex', '2d'], labels: { '2d': 'מישור' }, icons: { '2d': '📏' } },
      }),
    ).toEqual([]);
  });

  it('refuses an id the registry does not declare, naming field and entry', () => {
    for (const cfg of [
      { switcher: { order: ['statistics'] } }, // #888: 'analytic' was the example here until it shipped
      { switcher: { hidden: ['builder5'] } },
      { switcher: { labels: { nope: 'x' } } },
    ] as ToolConfig[]) {
      const r = validateToolConfig('complex', cfg);
      expect(r).toHaveLength(1);
      expect(r[0].field.startsWith('switcher.')).toBe(true);
      expect(r[0].why).toContain('רשום');
    }
  });

  it('a complex quick command is validated by the REAL grammar', () => {
    expect(validateToolConfig('complex', { quickCommands: ['z1 = 3+4i', 'z^5 = w^2'] })).toEqual([]);
    const r = validateToolConfig('complex', { quickCommands: ['שורה שאינה נקראת'] });
    expect(r).toHaveLength(1);
    expect(r[0].field).toBe('quickCommands');
    expect(r[0].entry).toBe('שורה שאינה נקראת');
    expect(r[0].why.length).toBeGreaterThan(0);
  });

  it('a tool with no validation lane refuses quick commands honestly (B4 brings the lanes)', () => {
    const r = validateToolConfig('2d', { quickCommands: ['משולש ABC'] });
    expect(r).toHaveLength(1);
    expect(r[0].why).toContain('B4');
  });
});

describe('the store — atomic writes, degraded reads', () => {
  it('roundtrips a config', async () => {
    const dir = scratch();
    const cfg: ToolConfig = { switcher: { hidden: ['3d'] }, quickCommands: ['z1 = 3+4i'] };
    await writeToolConfig(dir, 'complex', cfg);
    expect(await readToolConfig(dir, 'complex')).toEqual(cfg);
  });

  it('missing and malformed both read as null — the degraded path', async () => {
    const dir = scratch();
    expect(await readToolConfig(dir, 'complex')).toBeNull();
    writeFileSync(join(dir, 'config-complex.json'), '{not json', 'utf8');
    expect(await readToolConfig(dir, 'complex')).toBeNull();
    writeFileSync(join(dir, 'config-complex.json'), '[1,2]', 'utf8');
    expect(await readToolConfig(dir, 'complex')).toBeNull();
  });
});

describe('handleConfigRead — the public lane', () => {
  const call = async (dir: string, url: string) => {
    const headers: Record<string, string> = {};
    let body = '';
    const res = {
      statusCode: 0,
      setHeader: (n: string, v: string) => void (headers[n] = v),
      end: (b?: string) => void (body = b ?? ''),
    };
    await handleConfigRead({ url }, res, { dir });
    return { status: res.statusCode, headers, body };
  };

  it('unknown tool and absent config both answer 204 (use your static roster)', async () => {
    const dir = scratch();
    expect((await call(dir, '/api/config?tool=builder5')).status).toBe(204);
    expect((await call(dir, '/api/config?tool=complex')).status).toBe(204);
    expect((await call(dir, '/api/config')).status).toBe(204);
  });

  it('a saved config is served as JSON, no-store', async () => {
    const dir = scratch();
    await writeToolConfig(dir, 'complex', { switcher: { hidden: ['2d'] } });
    const r = await call(dir, '/api/config?tool=complex');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(r.body)).toEqual({ switcher: { hidden: ['2d'] } });
  });
});

describe('configFromForm — the form is curation, nothing more', () => {
  it('builds the config from form fields', () => {
    const cfg = configFromForm(
      new URLSearchParams([
        // show_2d absent → hidden
        ['show_3d', 'on'],
        ['show_complex', 'on'],
        ['show_analytic', 'on'],
        ['order_complex', '1'],
        ['order_3d', '2'],
        ['label_3d', 'מרחב'],
        ['icon_complex', 'ℂ'],
        ['quick', 'z1 = 3+4i\n\n  z2 = 2cis150  \n'],
      ]),
    );
    expect(cfg).toEqual({
      switcher: {
        hidden: ['2d'],
        labels: { '3d': 'מרחב' },
        icons: { complex: 'ℂ' },
        order: ['complex', '3d'],
      },
      quickCommands: ['z1 = 3+4i', 'z2 = 2cis150'],
    });
  });

  it('an untouched form yields an empty config', () => {
    const cfg = configFromForm(
      new URLSearchParams([
        ['show_2d', 'on'],
        ['show_3d', 'on'],
        ['show_complex', 'on'],
        ['show_analytic', 'on'],
        ['quick', ''],
      ]),
    );
    expect(cfg).toEqual({});
  });
});
