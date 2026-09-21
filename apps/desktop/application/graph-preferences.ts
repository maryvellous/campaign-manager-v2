export interface GraphPreferences { x: number; y: number; zoom: number; filters: string[]; selected?: string; positions: Record<string, { x: number; y: number }> }
export const defaultGraph = (): GraphPreferences => ({ x: 0, y: 0, zoom: 1, filters: [], positions: {} });
export function readGraph(value: unknown): GraphPreferences {
  const result = defaultGraph(); if (!value || typeof value !== 'object') return result;
  const input = value as Record<string, unknown>;
  for (const key of ['x', 'y', 'zoom'] as const) if (typeof input[key] === 'number' && Number.isFinite(input[key])) result[key] = key === 'zoom' ? Math.min(4, Math.max(.05, input[key])) : Math.min(100000, Math.max(-100000, input[key]));
  if (Array.isArray(input.filters)) result.filters = [...new Set(input.filters.filter((id): id is string => typeof id === 'string'))];
  if (typeof input.selected === 'string') result.selected = input.selected;
  if (input.positions && typeof input.positions === 'object') for (const [id, point] of Object.entries(input.positions)) {
    if (!point || typeof point !== 'object') continue;
    const p = point as Record<string, unknown>;
    if (typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 100000 && Math.abs(p.y) < 100000) result.positions[id] = { x: p.x, y: p.y };
  }
  return result;
}
export function readFolderColors(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter(([, color]) => typeof color === 'string' && /^graph-[1-5]$/u.test(color)));
}
