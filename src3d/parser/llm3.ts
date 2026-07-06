/**
 * Client side of the 3-D LLM fallback (V5, ADR-3D-008): out-of-grammar input
 * escalates to the SHARED proxy with `tool: '3d'`; the returned canonical lines
 * are re-parsed by the deterministic `parse3` (the model never speaks commands
 * directly). In dev the Vite middleware serves `/api/parse`; in production the
 * app posts to the existing `/geo-builder/api/parse` reverse proxy.
 */

export async function escalate3(utterance: string, context: string): Promise<string[] | null> {
  try {
    const endpoint = import.meta.env.DEV ? '/api/parse' : '/geo-builder/api/parse';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance, context, tool: '3d' }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { steps?: unknown };
    if (!Array.isArray(j.steps)) return null;
    const steps = j.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    return steps.length > 0 ? steps : null;
  } catch {
    return null;
  }
}
