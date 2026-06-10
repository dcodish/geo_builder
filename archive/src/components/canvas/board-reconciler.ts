/**
 * BoardReconciler: bridges declarative GeoElement[] state with imperative JSXGraph API.
 * Creates, updates, and removes JSXGraph objects to match the store state.
 *
 * Supports two modes:
 * - Position-only update: animates points to new positions via moveTo (smooth)
 * - Full rebuild: clears and recreates all objects (when topology changes)
 */

import type { GeoElement, Constraint } from '@/types/geometry';

// JSXGraph is loaded globally via script tag
declare const JXG: {
  JSXGraph: {
    initBoard(id: string, opts: Record<string, unknown>): JXGBoard;
    freeBoard(board: JXGBoard): void;
  };
};

interface JXGBoard {
  create(type: string, parents: unknown[], attrs?: Record<string, unknown>): JXGElement;
  removeObject(obj: JXGElement | string): void;
  update(): void;
  setBoundingBox(bbox: [number, number, number, number], keepAspectRatio?: boolean): void;
  zoomIn(x?: number, y?: number): void;
  zoomOut(x?: number, y?: number): void;
  zoom100(): void;
}

interface JXGElement {
  id: string;
  name: string;
  moveTo(coords: [number, number], time?: number): void;
  setAttribute(attrs: Record<string, unknown>): void;
}

export class BoardReconciler {
  board: JXGBoard;
  private managedPoints = new Map<string, JXGElement>();
  private managedSegments = new Map<string, JXGElement>();
  private managedAngles = new Map<string, JXGElement>();
  private managedLabels = new Map<string, JXGElement>();

  /** Track element IDs from last sync to detect topology changes. */
  private lastPointIds = new Set<string>();
  private lastSegmentAndLineIds = new Set<string>();
  private lastAngleIds = new Set<string>();
  private lastConstraintKeys = new Set<string>();

  constructor(containerId: string) {
    this.board = JXG.JSXGraph.initBoard(containerId, {
      boundingbox: [-8, 8, 8, -8],
      axis: false,
      grid: true,
      showCopyright: false,
      showNavigation: false,
      keepAspectRatio: true,
      pan: { enabled: true, needShift: false },
      zoom: { factorX: 1.25, factorY: 1.25, wheel: true, needShift: false },
    });
  }

  sync(elements: GeoElement[], constraints: Constraint[]): void {
    // Compute what the new topology looks like
    const newPointIds = new Set<string>();
    const newSegLineIds = new Set<string>();
    const newAngleIds = new Set<string>();
    const newConstraintKeys = new Set<string>();

    for (const el of elements) {
      if (el.kind === 'point') newPointIds.add(el.id);
      if (el.kind === 'segment' || el.kind === 'line') newSegLineIds.add(el.id);
      if (el.kind === 'angle' && el.measure != null) newAngleIds.add(el.id);
    }
    for (const c of constraints) {
      if (c.type === 'distance') newConstraintKeys.add(`dist-${c.points[0]}-${c.points[1]}-${c.value}`);
    }

    const topologyChanged =
      !setsEqual(newPointIds, this.lastPointIds) ||
      !setsEqual(newSegLineIds, this.lastSegmentAndLineIds) ||
      !setsEqual(newAngleIds, this.lastAngleIds) ||
      !setsEqual(newConstraintKeys, this.lastConstraintKeys);

    if (!topologyChanged && this.managedPoints.size > 0) {
      // Position-only update: animate existing points
      for (const el of elements) {
        if (el.kind === 'point') {
          const jxgPt = this.managedPoints.get(el.id);
          if (jxgPt) {
            jxgPt.moveTo([el.position.x, el.position.y], 300);
          }
        }
      }
    } else {
      // Topology changed: full rebuild
      this.fullRebuild(elements, constraints);
    }

    // Remember current topology
    this.lastPointIds = newPointIds;
    this.lastSegmentAndLineIds = newSegLineIds;
    this.lastAngleIds = newAngleIds;
    this.lastConstraintKeys = newConstraintKeys;
  }

  private fullRebuild(elements: GeoElement[], constraints: Constraint[]): void {
    this.clearAll();

    // 1. Create points
    for (const el of elements) {
      if (el.kind === 'point') {
        const pt = this.board.create('point', [el.position.x, el.position.y], {
          name: el.label,
          size: 4,
          fixed: true,
          color: '#3b82f6',
          label: {
            fontSize: 18,
            fontWeight: 'bold',
            offset: [10, 10],
            color: '#0f172a',
          },
        });
        this.managedPoints.set(el.id, pt);
      }
    }

    // 2. Create segments and lines
    for (const el of elements) {
      if (el.kind === 'segment') {
        const p1 = this.managedPoints.get(el.endpoints[0]);
        const p2 = this.managedPoints.get(el.endpoints[1]);
        if (p1 && p2) {
          const seg = this.board.create('segment', [p1, p2], {
            strokeWidth: 2.5,
            strokeColor: '#334155',
          });
          this.managedSegments.set(el.id, seg);
        }
      }
      if (el.kind === 'line') {
        const p1 = this.managedPoints.get(el.through[0]);
        const p2 = this.managedPoints.get(el.through[1]);
        if (p1 && p2) {
          const isDashed = el.role != null;
          const seg = this.board.create('segment', [p1, p2], {
            strokeWidth: isDashed ? 1.5 : 2.5,
            strokeColor: isDashed ? '#8b5cf6' : '#334155',
            dash: isDashed ? 2 : 0,
          });
          this.managedSegments.set(el.id, seg);
        }
      }
    }

    // 3. Create angle arcs for angles with known measures
    for (const el of elements) {
      if (el.kind === 'angle' && el.measure != null) {
        const pRay1 = this.managedPoints.get(el.ray1Point);
        const pVertex = this.managedPoints.get(el.vertex);
        const pRay2 = this.managedPoints.get(el.ray2Point);
        if (pRay1 && pVertex && pRay2) {
          const isRight = Math.abs(el.measure - 90) < 1;
          if (isRight) {
            const angle = this.board.create('nonreflexangle', [pRay1, pVertex, pRay2], {
              type: 'square',
              orthoType: 'square',
              radius: 0.6,
              fillColor: 'transparent',
              strokeColor: '#3b82f6',
              strokeWidth: 2,
              name: '',
            });
            this.managedAngles.set(el.id, angle);
          } else {
            const angle = this.board.create('nonreflexangle', [pRay1, pVertex, pRay2], {
              radius: 0.8,
              fillColor: 'rgba(59, 130, 246, 0.1)',
              strokeColor: '#3b82f6',
              strokeWidth: 2,
              name: `${Math.round(el.measure)}°`,
              label: { fontSize: 14, color: '#3b82f6', fontWeight: 'bold' },
            });
            this.managedAngles.set(el.id, angle);
          }
        }
      }
    }

    // 4. Distance labels on constrained segments
    for (const c of constraints) {
      if (c.type === 'distance') {
        const labelId = `label-${c.points[0]}${c.points[1]}`;
        const p1 = this.managedPoints.get(c.points[0]);
        const p2 = this.managedPoints.get(c.points[1]);
        if (p1 && p2) {
          const label = this.board.create('midpoint', [p1, p2], {
            visible: true,
            name: `${c.value}`,
            size: 0,
            label: {
              fontSize: 15,
              color: '#dc2626',
              fontWeight: 'bold',
              offset: [0, -16],
              anchorX: 'middle',
            },
          });
          this.managedLabels.set(labelId, label);
        }
      }
    }

    this.board.update();
  }

  private clearAll(): void {
    for (const [, obj] of this.managedLabels) this.board.removeObject(obj);
    for (const [, obj] of this.managedAngles) this.board.removeObject(obj);
    for (const [, obj] of this.managedSegments) this.board.removeObject(obj);
    for (const [, obj] of this.managedPoints) this.board.removeObject(obj);
    this.managedPoints.clear();
    this.managedSegments.clear();
    this.managedAngles.clear();
    this.managedLabels.clear();
  }

  zoomIn(): void {
    this.board.zoomIn();
  }

  zoomOut(): void {
    this.board.zoomOut();
  }

  resetView(): void {
    this.board.setBoundingBox([-8, 8, 8, -8], true);
  }

  destroy(): void {
    JXG.JSXGraph.freeBoard(this.board);
    this.managedPoints.clear();
    this.managedSegments.clear();
    this.managedAngles.clear();
    this.managedLabels.clear();
  }
}

/** Check if two sets contain the same elements. */
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}
