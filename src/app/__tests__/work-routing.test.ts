/**
 * #2874 (ADR-W-210 phase 1) — 2-D's THIN LOCK on the work queue's routing. The checks are shared
 * (`shell/__tests__/fixtures/work-routing-rows.ts`); this file hands over this tree's own store, registry,
 * sources and queued table. A new store action, a free action that writes a basis field, or a component
 * that calls a job action through `useGeoStore` fails here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { actionsOf, routingSuite, sourcesOf } from '../../../shell/__tests__/fixtures/work-routing-rows';
import { BASIS_FIELDS, FREE_ACTIONS, JOB_ACTIONS, act, onBasisChange, work } from '../work';
import { useGeoStore } from '@/store/geoStore';

const TREE = path.resolve(__dirname, '../..');

routingSuite(
  '2-D',
  () => ({
    storeActions: actionsOf(useGeoStore.getState()),
    jobs: JOB_ACTIONS,
    free: FREE_ACTIONS,
    queued: Object.keys(act),
    storeSource: readFileSync(path.join(TREE, 'store/geoStore.ts'), 'utf8'),
    basisFields: BASIS_FIELDS,
    storeName: 'useGeoStore',
    uiSources: sourcesOf(TREE),
  }),
  { queue: work, onBasisChange, viaQueue: () => act.clear(), bare: () => useGeoStore.getState().clear() },
);
