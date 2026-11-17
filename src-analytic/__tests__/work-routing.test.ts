/**
 * #2874 (ADR-W-210 phase 1) — the analytic builder's THIN LOCK on the work queue's routing. The checks are shared
 * (`shell/__tests__/fixtures/work-routing-rows.ts`); this file hands over this tree's own store, registry,
 * sources and queued table. A new store action, a free action that writes a basis field, or a component
 * that calls a job action through `useAnalyticStore` fails here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { actionsOf, routingSuite, sourcesOf } from '../../shell/__tests__/fixtures/work-routing-rows';
import { BASIS_FIELDS_AN, FREE_ACTIONS_AN, JOB_ACTIONS_AN, actAn, onBasisChangeAn, workAn } from '../app/workAn';
import { useAnalyticStore } from '../store/useAnalyticStore';

const TREE = path.resolve(__dirname, '..');

routingSuite(
  'analytic',
  () => ({
    storeActions: actionsOf(useAnalyticStore.getState()),
    jobs: JOB_ACTIONS_AN,
    free: FREE_ACTIONS_AN,
    queued: Object.keys(actAn),
    storeSource: readFileSync(path.join(TREE, 'store/useAnalyticStore.ts'), 'utf8'),
    basisFields: BASIS_FIELDS_AN,
    storeName: 'useAnalyticStore',
    uiSources: sourcesOf(TREE),
  }),
  { queue: workAn, onBasisChange: onBasisChangeAn, viaQueue: () => actAn.clearAll(), bare: () => useAnalyticStore.getState().clearAll() },
);
