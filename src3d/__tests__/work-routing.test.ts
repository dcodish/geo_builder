/**
 * #2874 (ADR-W-210 phase 1) — 3-D's THIN LOCK on the work queue's routing. The checks are shared
 * (`shell/__tests__/fixtures/work-routing-rows.ts`); this file hands over this tree's own store, registry,
 * sources and queued table. A new store action, a free action that writes a basis field, or a component
 * that calls a job action through `useGeo3` (or names `undo3` / `redo3`) fails here.
 *
 * This file holds NO string-array literal, on purpose: the #1394 parity corpus harvests every one in this
 * directory as a sequence a student typed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { actionsOf, routingSuite, sourcesOf } from '../../shell/__tests__/fixtures/work-routing-rows';
import { BASIS_FIELDS_3, FREE_ACTIONS_3, HISTORY_ACTIONS_3, JOB_ACTIONS_3, act3, onBasisChange3, work3 } from '../app/work3';
import { useGeo3 } from '../store/store3';

const TREE = path.resolve(__dirname, '..');

routingSuite(
  '3-D',
  () => ({
    storeActions: actionsOf(useGeo3.getState()),
    jobs: JOB_ACTIONS_3,
    free: FREE_ACTIONS_3,
    queued: Object.keys(act3),
    standaloneJobs: HISTORY_ACTIONS_3,
    storeSource: readFileSync(path.join(TREE, 'store/store3.ts'), 'utf8'),
    basisFields: BASIS_FIELDS_3,
    storeName: 'useGeo3',
    uiSources: sourcesOf(TREE),
  }),
  { queue: work3, onBasisChange: onBasisChange3, viaQueue: () => act3.clear(), bare: () => useGeo3.getState().clear() },
);
