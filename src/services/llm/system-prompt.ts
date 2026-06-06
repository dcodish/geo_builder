import type { Construction } from '@/types/geometry';

export function buildSystemPrompt(construction: Construction): string {
  const stateJson = buildStateContext(construction);

  return `You are a geometry parsing assistant for an Israeli high school geometry app.
Your job is to convert the student's natural language input into structured geometry commands using the provided tools.

CURRENT CONSTRUCTION STATE:
${stateJson}

RULES:
1. Parse the student's input and call the appropriate tool(s).
2. You may call MULTIPLE tools for a single input. For example,
   "Triangle ABC where AB=5 and angle A=60" should produce:
   - create_polygon(vertices=["A","B","C"], polygon_type="triangle")
   - set_distance(point1="A", point2="B", value=5)
   - set_angle(vertex="A", value=60)
3. If a polygon already exists in the current state, do NOT create it again.
4. Hebrew geometry terms mapping:
   - משולש = triangle
   - מרובע = quadrilateral
   - צלע = side
   - זווית = angle
   - אלכסון = diagonal
   - גובה = height/altitude
   - תיכון = median
   - חוצה זווית = angle bisector
   - אנך אמצעי = perpendicular bisector
   - קטע אמצעי = midsegment
   - מקבילית = parallelogram
   - מלבן = rectangle
   - מעוין = rhombus
   - ריבוע = square
   - טרפז = trapezoid
   - עפיפון = kite
   - שווה שוקיים = isosceles
   - שווה צלעות = equilateral
   - ישר זווית = right angle / right-angled
   - מעגל = circle
   - רדיוס = radius
   - קוטר = diameter
   - מקביל = parallel
   - מאונך / ניצב = perpendicular
5. If the input is ambiguous, use the clarification_needed tool.
6. Point labels are always single uppercase Latin letters (A-Z).
7. When the student says "angle A" in a triangle ABC, this means the angle at vertex A between sides AB and AC.
8. When the student says a shape is a specific type (e.g., "ABCD is a parallelogram"), create the polygon AND add the relevant constraints (e.g., parallel sides).
9. Numbers can be integers or decimals. Ignore units (cm, m, etc.).
10. When the student says "flip", "mirror", or "הפוך" followed by vertex labels, use flip_polygon to mirror that polygon to the other side of its shared edge.
11. Keep your responses minimal - only call tools, no extra text.`;
}

function buildStateContext(construction: Construction): string {
  if (construction.elements.length === 0) {
    return 'Empty - no shapes have been created yet.';
  }

  const parts: string[] = [];

  const polygons = construction.elements.filter(e => e.kind === 'polygon');
  for (const p of polygons) {
    if (p.kind === 'polygon') {
      parts.push(`Polygon: ${p.vertices.join('')} (${p.polygonType || 'general'})`);
    }
  }

  const points = construction.elements.filter(e => e.kind === 'point').map(e => e.id);
  if (points.length > 0) {
    parts.push(`Points: ${points.join(', ')}`);
  }

  for (const c of construction.constraints) {
    switch (c.type) {
      case 'distance':
        parts.push(`${c.points[0]}${c.points[1]} = ${c.value}`);
        break;
      case 'angle-measure':
        parts.push(`Angle at ${c.vertex} = ${c.value}°`);
        break;
      case 'right-angle':
        parts.push(`Right angle at ${c.vertex}`);
        break;
      case 'parallel':
        parts.push(`${c.line1.join('')} ∥ ${c.line2.join('')}`);
        break;
      case 'perpendicular':
        parts.push(`${c.line1.join('')} ⊥ ${c.line2.join('')}`);
        break;
      case 'equal-segments':
        parts.push(`${c.seg1.join('')} = ${c.seg2.join('')}`);
        break;
      case 'midpoint':
        parts.push(`${c.point} is midpoint of ${c.of.join('')}`);
        break;
    }
  }

  return parts.join('\n');
}
