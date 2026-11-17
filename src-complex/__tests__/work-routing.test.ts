/**
 * #2874 (ADR-W-210 phase 1) — the complex builder's THIN LOCK on the work queue's routing. The checks are shared
 * (`shell/__tests__/fixtures/work-routing-rows.ts`); this file hands over this tree's own store, registry,
 * sources and queued table. A new store action, a free action that writes a basis field, or a component
 * that calls a job action through `useComplexStore` fails here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { actionsOf, routingSuite, sourcesOf } from '../../shell/__tests__/fixtures/work-routing-rows';
import { BASIS_FIELDS_CX, FREE_ACTIONS_CX, JOB_ACTIONS_CX, actCx, onBasisChangeCx, workCx } from '../app/workCx';
import { useComplexStore } from '../store/useComplexStore';

const TREE = path.resolve(__dirname, '..');

routingSuite(
  'complex',
  () => ({
    storeActions: actionsOf(useComplexStore.getState()),
    jobs: JOB_ACTIONS_CX,
    free: FREE_ACTIONS_CX,
    queued: Object.keys(actCx),
    storeSource: readFileSync(path.join(TREE, 'store/useComplexStore.ts'), 'utf8'),
    basisFields: BASIS_FIELDS_CX,
    storeName: 'useComplexStore',
    uiSources: sourcesOf(TREE),
  }),
  { queue: workCx, onBasisChange: onBasisChangeCx, viaQueue: () => actCx.clearAll(), bare: () => useComplexStore.getState().clearAll() },
);
