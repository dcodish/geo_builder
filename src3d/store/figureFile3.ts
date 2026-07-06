/**
 * Save/load a 3-D figure as a portable `.geo3.json` (ADR-3D-005 — the 2-D tool's
 * ADR-232 pattern transplanted): the file IS the replay inputs — each fact keeps
 * the student's utterance (human-readable) AND its lowered commands (load replays
 * the COMMANDS, so parser evolution can never break an old file), plus the seed
 * (the sampled configuration reloads as saved). Positions are NEVER stored — the
 * figure re-derives, so a file can't smuggle a stale drawing.
 *
 * Deserialisation is strict and total: anything shape-invalid refuses `bad-file`,
 * a future schema refuses `newer-schema` — never a half-loaded session.
 */

import { nanoid } from 'nanoid';
import type { Command3 } from '../engine/types';
import type { Fact3 } from './store3';

export const SCHEMA_VERSION_3D = 1;

export interface FigureFile3 {
  schemaVersion: number;
  app: '3d-builder';
  savedAt?: string;
  seed: number;
  facts: { utterance: string; cmds: Command3[]; enabled?: boolean }[];
}

const COMMAND_TYPES = new Set<Command3['type']>([
  'solid',
  'point-on-segment3',
  'name-vector',
  'segment3',
  'centroid3',
  'point-in-span',
  'claim',
  'point3',
  'plane3',
  'plane-angle',
  'on-planes',
  'foot-on-plane',
  'plane-plane-line',
  'foot-on-line',
]);

export function serializeFigure3(facts: Fact3[], seed: number): string {
  const file: FigureFile3 = {
    schemaVersion: SCHEMA_VERSION_3D,
    app: '3d-builder',
    savedAt: new Date().toISOString(),
    seed,
    facts: facts.map((f) => ({ utterance: f.utterance, cmds: f.cmds, ...(f.enabled ? {} : { enabled: false }) })),
  };
  return JSON.stringify(file, null, 2);
}

export type LoadResult3 =
  | { ok: true; facts: Fact3[]; seed: number }
  | { ok: false; reason: 'bad-file' | 'newer-schema' };

export function deserializeFigure3(text: string): LoadResult3 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'bad-file' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'bad-file' };
  const file = raw as Partial<FigureFile3>;
  if (typeof file.schemaVersion !== 'number' || file.app !== '3d-builder') return { ok: false, reason: 'bad-file' };
  if (file.schemaVersion > SCHEMA_VERSION_3D) return { ok: false, reason: 'newer-schema' };
  if (!Array.isArray(file.facts) || file.facts.length === 0) return { ok: false, reason: 'bad-file' };
  if (typeof file.seed !== 'number' || !Number.isFinite(file.seed)) return { ok: false, reason: 'bad-file' };

  const facts: Fact3[] = [];
  for (const f of file.facts) {
    if (typeof f !== 'object' || f === null) return { ok: false, reason: 'bad-file' };
    if (typeof f.utterance !== 'string' || !Array.isArray(f.cmds) || f.cmds.length === 0) return { ok: false, reason: 'bad-file' };
    for (const cmd of f.cmds) {
      if (typeof cmd !== 'object' || cmd === null || !COMMAND_TYPES.has((cmd as Command3).type)) {
        return { ok: false, reason: 'bad-file' };
      }
    }
    // ids are session-local — always minted fresh on load
    facts.push({ id: nanoid(8), utterance: f.utterance, cmds: f.cmds, enabled: f.enabled !== false });
  }
  return { ok: true, facts, seed: file.seed };
}
