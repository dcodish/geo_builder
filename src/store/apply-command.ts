/**
 * Apply a GeometryCommand to a Construction, producing a new Construction.
 */

import type { Construction, GeometryCommand, GeoPoint, GeoPolygon, GeoSegment, GeoAngle } from '@/types/geometry';
import { nanoid } from 'nanoid';

export function applyCommand(
  construction: Construction,
  command: GeometryCommand,
): Construction {
  const elements = [...construction.elements];
  const constraints = [...construction.constraints];

  switch (command.action) {
    case 'create-polygon': {
      const { vertices, polygonType } = command;

      // Create points if they don't exist
      for (const v of vertices) {
        if (!elements.some(e => e.kind === 'point' && e.id === v)) {
          elements.push({
            kind: 'point',
            id: v,
            label: v,
            position: { x: 0, y: 0 }, // Will be resolved by solver
            isFree: false,
          } satisfies GeoPoint);
        }
      }

      // Create segments for each side
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const segId = `seg-${a}${b}`;
        if (!elements.some(e => e.kind === 'segment' && e.id === segId)) {
          elements.push({
            kind: 'segment',
            id: segId,
            endpoints: [a, b],
          } satisfies GeoSegment);
        }
      }

      // Create the polygon
      const polyId = `poly-${vertices.join('')}`;
      if (!elements.some(e => e.kind === 'polygon' && e.id === polyId)) {
        elements.push({
          kind: 'polygon',
          id: polyId,
          vertices,
          polygonType: polygonType as GeoPolygon['polygonType'],
        } satisfies GeoPolygon);
      }

      // Create angle elements at each vertex (polygon-specific IDs)
      for (let i = 0; i < vertices.length; i++) {
        const prev = vertices[(i + vertices.length - 1) % vertices.length];
        const curr = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        const angleId = `angle-${prev}${curr}${next}`;
        if (!elements.some(e => e.kind === 'angle' && e.id === angleId)) {
          elements.push({
            kind: 'angle',
            id: angleId,
            vertex: curr,
            ray1Point: prev,
            ray2Point: next,
          } satisfies GeoAngle);
        }
      }
      break;
    }

    case 'set-distance': {
      const { point1, point2, value } = command;
      // Remove existing distance constraint for this pair if any
      const idx = constraints.findIndex(
        c => c.type === 'distance' &&
          ((c.points[0] === point1 && c.points[1] === point2) ||
           (c.points[0] === point2 && c.points[1] === point1))
      );
      if (idx >= 0) constraints.splice(idx, 1);

      constraints.push({ type: 'distance', points: [point1, point2], value });
      break;
    }

    case 'set-angle': {
      const { vertex, value } = command;
      let { ray1, ray2 } = command;

      // If ray points not specified, infer from polygon
      if (!ray1 || !ray2) {
        const polygon = elements.find(
          (e): e is GeoPolygon => e.kind === 'polygon' && e.vertices.includes(vertex)
        );
        if (polygon) {
          const idx = polygon.vertices.indexOf(vertex);
          const n = polygon.vertices.length;
          ray1 = polygon.vertices[(idx + n - 1) % n];
          ray2 = polygon.vertices[(idx + 1) % n];
        }
      }

      if (ray1 && ray2) {
        constraints.push({
          type: 'angle-measure',
          vertex,
          ray1,
          ray2,
          value,
        });
      }
      break;
    }

    case 'set-right-angle': {
      constraints.push({ type: 'right-angle', vertex: command.vertex });
      break;
    }

    case 'set-equal-segments': {
      constraints.push({
        type: 'equal-segments',
        seg1: command.seg1,
        seg2: command.seg2,
      });
      break;
    }

    case 'set-parallel': {
      constraints.push({
        type: 'parallel',
        line1: command.line1,
        line2: command.line2,
      });
      break;
    }

    case 'set-perpendicular': {
      constraints.push({
        type: 'perpendicular',
        line1: command.line1,
        line2: command.line2,
      });
      break;
    }

    case 'add-special-line': {
      // Find the polygon and add the special line
      const polygon = elements.find(
        (e): e is GeoPolygon => e.kind === 'polygon'
      );
      if (polygon && command.fromVertex) {
        const lineId = `${command.lineType}-${command.fromVertex}-${nanoid(4)}`;
        const idx = polygon.vertices.indexOf(command.fromVertex);
        if (idx >= 0) {
          const n = polygon.vertices.length;
          // Default: the opposite side
          const opp1 = polygon.vertices[(idx + 1) % n];
          const opp2 = polygon.vertices[(idx + n - 1) % n];
          const toSide = command.toSide || [opp1, opp2];

          // Create the foot point (approximate, solver will refine)
          const footId = `${command.lineType[0].toUpperCase()}${command.fromVertex}`;
          if (!elements.some(e => e.kind === 'point' && e.id === footId)) {
            elements.push({
              kind: 'point',
              id: footId,
              label: footId,
              position: { x: 0, y: 0 },
              isFree: false,
            });
          }

          elements.push({
            kind: 'line',
            id: lineId,
            through: [command.fromVertex, footId],
            role: command.lineType,
          });

          // Add perpendicular constraint for height
          if (command.lineType === 'height') {
            constraints.push({
              type: 'perpendicular',
              line1: [command.fromVertex, footId],
              line2: toSide as [string, string],
            });
          }
        }
      }
      break;
    }

    case 'flip-polygon': {
      const flipVerts = command.vertices.join('');
      const idx = elements.findIndex(
        (e): e is GeoPolygon => e.kind === 'polygon' && e.vertices.join('') === flipVerts
      );
      if (idx >= 0) {
        const poly = elements[idx] as GeoPolygon;
        elements[idx] = { ...poly, flipped: !poly.flipped };
      }
      break;
    }

    case 'clarification':
      // No-op for state, handled by UI
      break;
  }

  return { ...construction, elements, constraints, computed: construction.computed, steps: construction.steps };
}
