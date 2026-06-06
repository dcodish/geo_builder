import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Construction, ConstructionStep, GeometryCommand, Point2D } from '@/types/geometry';
import { applyCommand } from './apply-command';
import { recomputeProperties } from '@/engine/computed';
import { resolvePositions, type FitState } from '@/engine/solver';
import { segmentKey } from '@/engine/solver/utils';
import { nanoid } from 'nanoid';

function createEmptyConstruction(): Construction {
  return {
    elements: [],
    constraints: [],
    computed: {
      distances: new Map(),
      angleMeasures: new Map(),
      polygonClassifications: new Map(),
      parallelPairs: [],
      perpendicularPairs: [],
    },
    steps: [],
  };
}

interface ConstructionState {
  construction: Construction;
  clarificationMessage: string | null;
  lastPositions: Map<string, Point2D>;
  fitState: FitState | null;

  executeCommand: (commands: GeometryCommand[], nlInput: string) => void;
  reset: () => void;
}

export const useConstructionStore = create<ConstructionState>()(
  temporal(
    (set) => ({
      construction: createEmptyConstruction(),
      clarificationMessage: null,
      lastPositions: new Map(),
      fitState: null,

      executeCommand(commands, nlInput) {
        set((state) => {
          let next = { ...state.construction };
          let clarification: string | null = null;

          for (const cmd of commands) {
            if (cmd.action === 'clarification') {
              clarification = cmd.messageEn;
              continue;
            }
            next = applyCommand(next, cmd);
          }

          if (clarification) {
            return { clarificationMessage: clarification };
          }

          // Validate constraints before solving
          const error = validateConstraints(next);
          if (error) {
            // Mark step as error, keep previous construction
            const errorStep: ConstructionStep = {
              id: nanoid(),
              naturalLanguageInput: nlInput,
              commands,
              timestamp: Date.now(),
              isError: true,
            };
            return {
              construction: {
                ...state.construction,
                steps: [...state.construction.steps, errorStep],
              },
              clarificationMessage: error,
            };
          }

          // Resolve point positions with solver, using previous positions for stability
          const solverResult = resolvePositions(
            next,
            state.lastPositions,
            state.fitState ?? undefined,
          );
          const positions = solverResult.positions;

          // Validate positions (no NaN/Infinity)
          let positionsValid = true;
          for (const p of positions.values()) {
            if (!isFinite(p.x) || !isFinite(p.y)) {
              positionsValid = false;
              break;
            }
          }

          if (!positionsValid) {
            const errorStep: ConstructionStep = {
              id: nanoid(),
              naturalLanguageInput: nlInput,
              commands,
              timestamp: Date.now(),
              isError: true,
            };
            return {
              construction: {
                ...state.construction,
                steps: [...state.construction.steps, errorStep],
              },
              clarificationMessage: 'Could not compute a valid shape with these constraints.',
            };
          }

          const updatedElements = next.elements.map((el) => {
            if (el.kind === 'point' && positions.has(el.id)) {
              return { ...el, position: positions.get(el.id)! };
            }
            return el;
          });

          next = { ...next, elements: updatedElements };

          // Recompute derived properties
          const computed = recomputeProperties(next);

          // Propagate angle measures back to GeoAngle elements for rendering.
          // Only show angles that the user explicitly specified via constraints,
          // matched by vertex AND ray points to avoid cross-polygon conflicts.
          const withAngles = next.elements.map((el) => {
            if (el.kind === 'angle') {
              for (const c of next.constraints) {
                if (c.type === 'angle-measure' && c.vertex === el.vertex) {
                  // If constraint has ray info, match precisely
                  if (c.ray1 && c.ray2) {
                    const match =
                      (c.ray1 === el.ray1Point && c.ray2 === el.ray2Point) ||
                      (c.ray1 === el.ray2Point && c.ray2 === el.ray1Point);
                    if (match) return { ...el, measure: c.value };
                  } else {
                    // No ray info: apply to first matching angle at this vertex
                    return { ...el, measure: c.value };
                  }
                }
                if (c.type === 'right-angle' && c.vertex === el.vertex) {
                  return { ...el, measure: 90 };
                }
              }
              // No explicit constraint — don't render an angle measure
              return { ...el, measure: undefined };
            }
            return el;
          });
          next = { ...next, elements: withAngles, computed };

          // Add step to history
          const step: ConstructionStep = {
            id: nanoid(),
            naturalLanguageInput: nlInput,
            commands,
            timestamp: Date.now(),
          };
          next = { ...next, steps: [...next.steps, step] };

          return {
            construction: next,
            clarificationMessage: null,
            lastPositions: new Map(solverResult.rawPositions),
            fitState: solverResult.fitState,
          };
        });
      },

      reset() {
        set({
          construction: createEmptyConstruction(),
          clarificationMessage: null,
          lastPositions: new Map(),
          fitState: null,
        });
      },
    }),
    {
      limit: 50,
      partialize: (state) => ({
        construction: state.construction,
        clarificationMessage: state.clarificationMessage,
      }),
    },
  ),
);

/** Check for contradictory constraints (triangle inequality, duplicate distances, etc.) */
function validateConstraints(construction: Construction): string | null {
  const distMap = new Map<string, number>();

  for (const c of construction.constraints) {
    if (c.type === 'distance') {
      const key = segmentKey(c.points[0], c.points[1]);
      const existing = distMap.get(key);
      if (existing != null && Math.abs(existing - c.value) > 0.01) {
        return `Conflicting distances for ${c.points[0]}${c.points[1]}: ${existing} and ${c.value}`;
      }
      distMap.set(key, c.value);
    }
  }

  // Triangle inequality check
  for (const el of construction.elements) {
    if (el.kind === 'polygon' && el.vertices.length === 3) {
      const [a, b, c] = el.vertices;
      const ab = distMap.get(segmentKey(a, b));
      const bc = distMap.get(segmentKey(b, c));
      const ca = distMap.get(segmentKey(c, a));
      if (ab != null && bc != null && ca != null) {
        const sides = [ab, bc, ca].sort((x, y) => x - y);
        if (sides[0] + sides[1] <= sides[2]) {
          return `These side lengths cannot form a triangle (${sides[0]} + ${sides[1]} ≤ ${sides[2]})`;
        }
      }
    }
  }

  // Angle sum check (3 angles of a triangle must equal 180)
  for (const el of construction.elements) {
    if (el.kind === 'polygon' && el.vertices.length === 3) {
      const triVerts = new Set(el.vertices);
      const angles: number[] = [];
      for (const v of el.vertices) {
        for (const c of construction.constraints) {
          if (c.type === 'angle-measure' && c.vertex === v) {
            // Only count if rays belong to THIS triangle (or no rays specified)
            if (c.ray1 && c.ray2) {
              if (triVerts.has(c.ray1) && triVerts.has(c.ray2)) angles.push(c.value);
            } else {
              angles.push(c.value);
            }
          }
          if (c.type === 'right-angle' && c.vertex === v) angles.push(90);
        }
      }
      if (angles.length === 3 && Math.abs(angles[0] + angles[1] + angles[2] - 180) > 1) {
        return `Triangle angles must sum to 180° (got ${angles[0]}° + ${angles[1]}° + ${angles[2]}° = ${angles[0] + angles[1] + angles[2]}°)`;
      }
    }
  }

  return null;
}

interface UIState {
  language: 'en' | 'he';
  isLLMLoading: boolean;
  theoremPanelOpen: boolean;

  setLanguage: (lang: 'en' | 'he') => void;
  setLLMLoading: (loading: boolean) => void;
  toggleTheoremPanel: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  language: 'he',
  isLLMLoading: false,
  theoremPanelOpen: true,

  setLanguage: (language) => set({ language }),
  setLLMLoading: (isLLMLoading) => set({ isLLMLoading }),
  toggleTheoremPanel: () => set((s) => ({ theoremPanelOpen: !s.theoremPanelOpen })),
}));
