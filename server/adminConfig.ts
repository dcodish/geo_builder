/**
 * Operator-editable per-tool config (unify A3, #662; ADR-W-018 decision 7).
 *
 * THE LINE THAT BOUNDS THIS, non-negotiable: config may CHOOSE AMONG what the code already
 * supports; it may never ASSERT support the code lacks. Concretely:
 *
 *  - The switcher fields curate A2's registry (`products.json`, ADR-W-021): hide, reorder,
 *    relabel, re-icon — but an id absent from the registry is REFUSED, so builder 5 cannot be
 *    conjured from a form field.
 *  - A featured quick command is validated at SAVE TIME against the tool's own grammar and
 *    refused if it does not parse, naming the entry and the reason — otherwise the admin page
 *    becomes a way to offer a student a command that fails (#511's asymmetry with a nicer UI).
 *    Today only the complex lane has a context-free parser the server can run (`parseLineV2`);
 *    the 2-D/3-D quick-command lanes arrive with their B4 surface, and until then a quick
 *    command for those tools is refused as unsupported — honestly, not silently.
 *
 * Storage is one JSON document per tool beside the events log, written ATOMICALLY (tmp +
 * rename — the event-log precedent): a torn write must never produce a half-config, because the
 * degraded path treats malformed as absent. DEGRADED PATH: missing / unreadable / malformed
 * config reads as `null`, and every consumer falls back to the static registry — a dead server
 * leaves every builder working (#662's lock).
 *
 * The wire shape is MIRRORED in `shell/switcherConfig.ts` (the client-side overlay merge) —
 * `server/` may not import `shell/` nor vice versa (BOUNDARIES.json), so the contract lives on
 * both sides, each side tolerating unknown fields so the mirror can never hard-break the other.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parseLineV2 } from '../src-complex/parser/rules';
import registry from '../products.json';

export interface SwitcherConfig {
  /** Registry ids listed first, in this order; unlisted enabled builders follow in registry order. */
  order?: string[];
  /** Registry ids hidden from this tool's switcher (the builder still exists; it is curated out). */
  hidden?: string[];
  /** id → display-label override (the builder's own i18n label stays the default). */
  labels?: Record<string, string>;
  /** id → glyph override. */
  icons?: Record<string, string>;
}

export interface ToolConfig {
  switcher?: SwitcherConfig;
  /** Featured quick commands for this tool, one utterance per entry (the B4 surface consumes). */
  quickCommands?: string[];
}

export interface ConfigRefusal {
  field: string;
  entry: string;
  why: string;
}

const REGISTRY_IDS = new Set(registry.products.map((p) => p.id));

/** Tools whose grammar the server can run at save time. The others' lanes arrive with B4. */
const QUICK_COMMAND_LANES: Record<string, (line: string) => string | null> = {
  complex: (line) => {
    const parsed = parseLineV2(line);
    if (parsed.ok) return null;
    return 'reason' in parsed && parsed.reason === 'unaccounted'
      ? `לא זוהה חלק מהשורה: ${parsed.items.join(', ')}`
      : 'הדקדוק אינו מקבל את השורה';
  },
};

/**
 * Validate a candidate config for `tool`. Empty result = acceptable. Every refusal names the
 * offending entry and the reason — the operator fixes THAT, never guesses.
 */
export function validateToolConfig(tool: string, cfg: ToolConfig): ConfigRefusal[] {
  const refusals: ConfigRefusal[] = [];
  const sw = cfg.switcher;
  if (sw) {
    for (const [field, ids] of [
      ['switcher.order', sw.order ?? []],
      ['switcher.hidden', sw.hidden ?? []],
    ] as const) {
      for (const id of ids)
        if (!REGISTRY_IDS.has(id))
          refusals.push({
            field,
            entry: id,
            why: 'אינו מזהה בונה רשום (products.json) — הקונפיגורציה בוחרת מבין הקיים, לעולם לא ממציאה',
          });
    }
    for (const [field, rec] of [
      ['switcher.labels', sw.labels ?? {}],
      ['switcher.icons', sw.icons ?? {}],
    ] as const) {
      for (const [id, value] of Object.entries(rec)) {
        if (!REGISTRY_IDS.has(id))
          refusals.push({ field, entry: id, why: 'אינו מזהה בונה רשום (products.json)' });
        else if (typeof value !== 'string' || value.trim() === '')
          refusals.push({ field, entry: id, why: 'ערך ריק' });
      }
    }
  }
  for (const cmd of cfg.quickCommands ?? []) {
    const lane = QUICK_COMMAND_LANES[tool];
    if (!lane) {
      refusals.push({
        field: 'quickCommands',
        entry: cmd,
        why: `לכלי ${tool} אין עדיין נתיב אימות לפקודות — מגיע עם B4; פקודה שאינה ניתנת לאימות אינה נשמרת`,
      });
      continue;
    }
    const why = lane(cmd.trim());
    if (why) refusals.push({ field: 'quickCommands', entry: cmd, why });
  }
  return refusals;
}

const configPath = (dir: string, tool: string) => path.join(dir, `config-${tool}.json`);

/** Read a tool's config; missing / unreadable / malformed → null (the degraded path). */
export async function readToolConfig(dir: string, tool: string): Promise<ToolConfig | null> {
  try {
    const raw = JSON.parse(await readFile(configPath(dir, tool), 'utf8')) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    return raw as ToolConfig;
  } catch {
    return null;
  }
}

/** Atomic write (tmp + rename): a torn write can never produce a half-config. */
export async function writeToolConfig(dir: string, tool: string, cfg: ToolConfig): Promise<void> {
  await mkdir(dir, { recursive: true });
  const target = configPath(dir, tool);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf8');
  await rename(tmp, target);
}

/**
 * The PUBLIC read: `GET …/api/config?tool=<id>` — unauthenticated by design (it serves students'
 * builders, and it can only ever reveal curation the operator saved for public display). An
 * unknown tool or absent config answers `204` with an empty body: the builder's degraded path
 * treats both exactly like an unreachable server and renders its static roster.
 */
export async function handleConfigRead(
  req: { url?: string },
  res: { statusCode: number; setHeader(n: string, v: string): void; end(b?: string): void },
  opts: { dir: string },
): Promise<void> {
  const tool = new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('tool') ?? '';
  res.setHeader('cache-control', 'no-store');
  if (!REGISTRY_IDS.has(tool)) {
    res.statusCode = 204;
    res.end();
    return;
  }
  const cfg = await readToolConfig(opts.dir, tool);
  if (!cfg) {
    res.statusCode = 204;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(cfg));
}
