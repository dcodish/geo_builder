import type { GeometryCommand } from '@/types/geometry';

/**
 * Tool definitions for Claude API. Each tool maps to a GeometryCommand.
 */
export const geometryTools = [
  {
    name: 'create_polygon' as const,
    description: 'Create a new polygon (triangle, quadrilateral, etc.) by specifying vertex labels. Use when the student mentions a shape for the first time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vertices: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered vertex labels, e.g. ["A","B","C"] for triangle ABC',
        },
        polygon_type: {
          type: 'string',
          enum: ['triangle', 'quadrilateral', 'general'],
        },
      },
      required: ['vertices', 'polygon_type'],
    },
  },
  {
    name: 'set_distance' as const,
    description: 'Set the distance between two points. Use for "AB=5" or "side AB is 5cm".',
    input_schema: {
      type: 'object' as const,
      properties: {
        point1: { type: 'string' },
        point2: { type: 'string' },
        value: { type: 'number' },
      },
      required: ['point1', 'point2', 'value'],
    },
  },
  {
    name: 'set_angle' as const,
    description: 'Set the measure of an angle at a vertex. Use for "angle A = 60" or "the angle at B is 90 degrees".',
    input_schema: {
      type: 'object' as const,
      properties: {
        vertex: { type: 'string' },
        ray1_point: { type: 'string', description: 'Point on first ray (optional, inferred from polygon)' },
        ray2_point: { type: 'string', description: 'Point on second ray (optional, inferred from polygon)' },
        value: { type: 'number', description: 'Angle in degrees' },
      },
      required: ['vertex', 'value'],
    },
  },
  {
    name: 'set_equal_segments' as const,
    description: 'Declare two segments as equal. Use for "AB=CD" or "isosceles with AB=AC".',
    input_schema: {
      type: 'object' as const,
      properties: {
        segment1: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
        segment2: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
      },
      required: ['segment1', 'segment2'],
    },
  },
  {
    name: 'set_parallel' as const,
    description: 'Declare two lines/segments as parallel.',
    input_schema: {
      type: 'object' as const,
      properties: {
        line1: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
        line2: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
      },
      required: ['line1', 'line2'],
    },
  },
  {
    name: 'set_perpendicular' as const,
    description: 'Declare two lines/segments as perpendicular.',
    input_schema: {
      type: 'object' as const,
      properties: {
        line1: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
        line2: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
      },
      required: ['line1', 'line2'],
    },
  },
  {
    name: 'set_right_angle' as const,
    description: 'Declare a right angle (90°) at a vertex.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vertex: { type: 'string' },
      },
      required: ['vertex'],
    },
  },
  {
    name: 'add_special_line' as const,
    description: 'Add a special line: height, median, angle bisector, perpendicular bisector, or midsegment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        line_type: {
          type: 'string',
          enum: ['height', 'median', 'bisector', 'perpendicular-bisector', 'midsegment'],
        },
        from_vertex: { type: 'string' },
        to_side: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
      },
      required: ['line_type'],
    },
  },
  {
    name: 'flip_polygon' as const,
    description: 'Flip/mirror an attached polygon to the other side of its shared edge. Use when the student says "flip", "mirror", or "הפוך" followed by vertex labels.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vertices: {
          type: 'array',
          items: { type: 'string' },
          description: 'Vertex labels of the polygon to flip, e.g. ["B","C","D","E"]',
        },
      },
      required: ['vertices'],
    },
  },
  {
    name: 'clarification_needed' as const,
    description: 'Use when the input is ambiguous. Return a helpful clarification message.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message_en: { type: 'string' },
        message_he: { type: 'string' },
      },
      required: ['message_en'],
    },
  },
] as const;

/**
 * Convert a Claude tool call result into a GeometryCommand.
 */
export function toolCallToCommand(toolName: string, input: Record<string, unknown>): GeometryCommand {
  switch (toolName) {
    case 'create_polygon':
      return {
        action: 'create-polygon',
        vertices: input.vertices as string[],
        polygonType: input.polygon_type as 'triangle' | 'quadrilateral' | 'general',
      };
    case 'set_distance':
      return {
        action: 'set-distance',
        point1: input.point1 as string,
        point2: input.point2 as string,
        value: input.value as number,
      };
    case 'set_angle':
      return {
        action: 'set-angle',
        vertex: input.vertex as string,
        ray1: input.ray1_point as string | undefined,
        ray2: input.ray2_point as string | undefined,
        value: input.value as number,
      };
    case 'set_equal_segments':
      return {
        action: 'set-equal-segments',
        seg1: input.segment1 as [string, string],
        seg2: input.segment2 as [string, string],
      };
    case 'set_parallel':
      return {
        action: 'set-parallel',
        line1: input.line1 as [string, string],
        line2: input.line2 as [string, string],
      };
    case 'set_perpendicular':
      return {
        action: 'set-perpendicular',
        line1: input.line1 as [string, string],
        line2: input.line2 as [string, string],
      };
    case 'set_right_angle':
      return { action: 'set-right-angle', vertex: input.vertex as string };
    case 'add_special_line':
      return {
        action: 'add-special-line',
        lineType: input.line_type as GeometryCommand & { action: 'add-special-line' } extends { lineType: infer T } ? T : never,
        fromVertex: input.from_vertex as string | undefined,
        toSide: input.to_side as [string, string] | undefined,
      };
    case 'flip_polygon':
      return {
        action: 'flip-polygon',
        vertices: input.vertices as string[],
      };
    case 'clarification_needed':
      return {
        action: 'clarification',
        messageEn: input.message_en as string,
        messageHe: input.message_he as string | undefined,
      };
    default:
      return { action: 'clarification', messageEn: `Unknown tool: ${toolName}` };
  }
}
