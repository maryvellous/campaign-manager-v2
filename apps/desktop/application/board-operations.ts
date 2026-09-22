import type { BoardConnectionEndpoint, BoardDocument, BoardElement } from './board-types';

export interface BoardRect { x: number; y: number; width: number; height: number }
export type BoardOrderDirection = 'front' | 'back' | 'forward' | 'backward';

const intersects = (element: BoardElement, rect: BoardRect) =>
  element.x < rect.x + rect.width &&
  element.x + element.width > rect.x &&
  element.y < rect.y + rect.height &&
  element.y + element.height > rect.y;

export function expandGroupedSelection(elements: BoardElement[], ids: Iterable<string>): string[] {
  const selected = new Set(ids);
  const groups = new Set(elements.filter(element => selected.has(element.elementId) && element.groupId).map(element => element.groupId!));
  for (const element of elements) if (element.groupId && groups.has(element.groupId)) selected.add(element.elementId);
  return [...selected];
}

export function marqueeSelection(elements: BoardElement[], rect: BoardRect): string[] {
  return expandGroupedSelection(elements, elements.filter(element => intersects(element, rect)).map(element => element.elementId));
}

export function reorderElements(elements: BoardElement[], selectedIds: Iterable<string>, direction: BoardOrderDirection): BoardElement[] {
  const selected = new Set(selectedIds);
  const ordered = [...elements].sort((a, b) => a.z - b.z);
  if (!ordered.some(element => selected.has(element.elementId))) return elements;

  if (direction === 'front' || direction === 'back') {
    const chosen = ordered.filter(element => selected.has(element.elementId));
    const rest = ordered.filter(element => !selected.has(element.elementId));
    const result = direction === 'front' ? [...rest, ...chosen] : [...chosen, ...rest];
    const z = new Map(result.map((element, index) => [element.elementId, index + 1]));
    return elements.map(element => ({ ...element, z: z.get(element.elementId)! }));
  }

  if (direction === 'forward') {
    for (let index = ordered.length - 2; index >= 0; index--) {
      if (selected.has(ordered[index].elementId) && !selected.has(ordered[index + 1].elementId)) {
        [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
      }
    }
  } else {
    for (let index = 1; index < ordered.length; index++) {
      if (selected.has(ordered[index].elementId) && !selected.has(ordered[index - 1].elementId)) {
        [ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]];
      }
    }
  }
  const z = new Map(ordered.map((element, index) => [element.elementId, index + 1]));
  return elements.map(element => ({ ...element, z: z.get(element.elementId)! }));
}

export function endpointPoint(document: BoardDocument, endpoint: BoardConnectionEndpoint): { x: number; y: number } | undefined {
  if (endpoint.kind === 'point') return { x: endpoint.x, y: endpoint.y };
  const element = document.elements.find(candidate => candidate.elementId === endpoint.elementId);
  if (!element) return undefined;
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

export function contentBounds(document: BoardDocument): BoardRect | undefined {
  const points: Array<{ x: number; y: number }> = [];
  for (const element of document.elements) {
    points.push({ x: element.x, y: element.y }, { x: element.x + element.width, y: element.y + element.height });
  }
  for (const connector of document.connectors) {
    const from = endpointPoint(document, connector.from);
    const to = endpointPoint(document, connector.to);
    if (from) points.push(from);
    if (to) points.push(to);
  }
  if (!points.length) return undefined;
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export function connectorsWithoutElements(document: BoardDocument, removedIds: Iterable<string>) {
  const removed = new Set(removedIds);
  return document.connectors.filter(connector =>
    !(connector.from.kind === 'element' && removed.has(connector.from.elementId)) &&
    !(connector.to.kind === 'element' && removed.has(connector.to.elementId))
  );
}
