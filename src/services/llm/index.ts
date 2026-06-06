/**
 * LLM service: sends student input to Claude API and returns GeometryCommands.
 *
 * In production this should go through a server-side proxy to protect the API key.
 * For development, the API key is read from VITE_ANTHROPIC_API_KEY env var.
 */

import type { Construction, GeometryCommand } from '@/types/geometry';
import { geometryTools, toolCallToCommand } from './tools';
import { buildSystemPrompt } from './system-prompt';

const API_URL = 'https://api.anthropic.com/v1/messages';

export async function parseNaturalLanguage(
  input: string,
  construction: Construction,
): Promise<GeometryCommand[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Fallback: try simple regex parsing for demo/offline mode
    return fallbackParse(input);
  }

  const systemPrompt = buildSystemPrompt(construction);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools: geometryTools,
      messages: [
        { role: 'user', content: input },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Claude API error:', error);
    return fallbackParse(input);
  }

  const data = await response.json();
  const commands: GeometryCommand[] = [];

  for (const block of data.content) {
    if (block.type === 'tool_use') {
      commands.push(toolCallToCommand(block.name, block.input));
    }
  }

  if (commands.length === 0) {
    return fallbackParse(input);
  }

  return commands;
}

/**
 * Simple regex-based fallback parser for when the API is unavailable.
 * Handles basic patterns like "Triangle ABC", "AB=5", "angle A = 60".
 */
function fallbackParse(input: string): GeometryCommand[] {
  const commands: GeometryCommand[] = [];
  const normalized = input.trim();

  // Match: "Triangle ABC" or "משולש ABC"
  const triMatch = normalized.match(/(?:triangle|משולש)\s+([A-Z]{3})/i);
  if (triMatch) {
    const vertices = triMatch[1].split('');
    commands.push({ action: 'create-polygon', vertices, polygonType: 'triangle' });
  }

  // Match: "Quadrilateral ABCD" or "מרובע ABCD" or specific types
  const quadMatch = normalized.match(/(?:quadrilateral|מרובע|parallelogram|מקבילית|rectangle|מלבן|rhombus|מעוין|square|ריבוע|trapezoid|טרפז)\s+([A-Z]{4})/i);
  if (quadMatch) {
    const vertices = quadMatch[1].split('');
    commands.push({ action: 'create-polygon', vertices, polygonType: 'quadrilateral' });

    // Add parallelogram constraints if specified
    if (/parallelogram|מקבילית|rectangle|מלבן|rhombus|מעוין|square|ריבוע/i.test(normalized)) {
      commands.push({
        action: 'set-parallel',
        line1: [vertices[0], vertices[1]],
        line2: [vertices[3], vertices[2]],
      });
      commands.push({
        action: 'set-parallel',
        line1: [vertices[0], vertices[3]],
        line2: [vertices[1], vertices[2]],
      });
    }
    // Rectangle / Square: all 4 right angles (with explicit rays)
    if (/rectangle|מלבן|square|ריבוע/i.test(normalized)) {
      for (let i = 0; i < 4; i++) {
        const prev = vertices[(i + 3) % 4];
        const curr = vertices[i];
        const next = vertices[(i + 1) % 4];
        commands.push({ action: 'set-angle', vertex: curr, ray1: prev, ray2: next, value: 90 });
      }
    }
    // Square / Rhombus: adjacent sides equal
    if (/square|ריבוע|rhombus|מעוין/i.test(normalized)) {
      commands.push({
        action: 'set-equal-segments',
        seg1: [vertices[0], vertices[1]],
        seg2: [vertices[1], vertices[2]],
      });
    }
  }

  // Match: "AB=5" or "AB = 5" patterns
  const distMatches = normalized.matchAll(/([A-Z])([A-Z])\s*=\s*(\d+(?:\.\d+)?)/g);
  for (const m of distMatches) {
    commands.push({
      action: 'set-distance',
      point1: m[1],
      point2: m[2],
      value: parseFloat(m[3]),
    });
  }

  // Match: "angle A = 60" or "זווית A = 60"
  const angleMatches = normalized.matchAll(/(?:angle|זווית)\s+([A-Z])\s*=\s*(\d+(?:\.\d+)?)/gi);
  for (const m of angleMatches) {
    commands.push({
      action: 'set-angle',
      vertex: m[1],
      value: parseFloat(m[2]),
    });
  }

  // Match: "right angle at B" or "ישר זווית ב-B"
  const rightMatch = normalized.match(/(?:right\s*angle\s*(?:at)?\s*|ישר\s*זווית\s*(?:ב-?)?\s*)([A-Z])/i);
  if (rightMatch) {
    commands.push({ action: 'set-right-angle', vertex: rightMatch[1] });
  }

  // Match: "flip BCDE" or "הפוך BCDE"
  const flipMatch = normalized.match(/(?:flip|mirror|הפוך)\s+(?:polygon\s+)?([A-Z]+)/i);
  if (flipMatch) {
    commands.push({ action: 'flip-polygon', vertices: flipMatch[1].split('') });
  }

  if (commands.length === 0) {
    commands.push({
      action: 'clarification',
      messageEn: "I couldn't understand that. Try something like: \"Triangle ABC where AB=5 and angle A=60\"",
      messageHe: 'לא הצלחתי להבין. נסה משהו כמו: "משולש ABC כאשר AB=5 וזווית A=60"',
    });
  }

  return commands;
}
