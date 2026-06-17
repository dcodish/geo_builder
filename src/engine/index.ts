/** Public surface of the constructive engine. */

export * from './types';
export * from './geometry';
export * from './solve';
export { applyCommand } from './apply';
export { evaluate } from './evaluate';
export type { EvalResult, EvalOk, EvalErr } from './evaluate';
export {
  applyStep,
  build,
  branchCount,
  commandConflict,
  cyclableBranch,
  cycleAlternative,
  deepEqual,
  maxDelta,
  emptyConstruction,
} from './step';
export type { StepResult, StepOk, StepErr } from './step';
export { applySeed, freeDofs, freeDofCount } from './sample';
export { lower, lowerOne, buildSymTab, measureLabelText, isMeasure } from './lower';
export type { SymTab } from './lower';
