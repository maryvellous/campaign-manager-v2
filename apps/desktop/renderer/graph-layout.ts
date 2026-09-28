export type GraphNodeRef = { noteId: string };
export type GraphEdgeRef = { source: string; target: string; occurrences?: number };
export type GraphPoint = { x: number; y: number; degree: number };

export function graphDegrees(nodes: GraphNodeRef[], edges: GraphEdgeRef[]): Record<string, number> {
  const degrees: Record<string, number> = Object.fromEntries(nodes.map(node => [node.noteId, 0]));
  for (const edge of edges) {
    if (edge.source in degrees) degrees[edge.source] += 1;
    if (edge.target in degrees) degrees[edge.target] += 1;
  }
  return degrees;
}

export function layoutGraph(
  nodes: GraphNodeRef[],
  edges: GraphEdgeRef[],
  width = 900,
  height = 520,
): Record<string, GraphPoint> {
  if (!nodes.length) return {};

  const degrees = graphDegrees(nodes, edges);
  const ordered = [...nodes]
    .map(node => node.noteId)
    .sort((a, b) => (degrees[b] - degrees[a]) || a.localeCompare(b, 'it'));

  const centerX = width / 2;
  const centerY = height / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const positions = new Map<string, { x: number; y: number }>();
  const velocity = new Map<string, { x: number; y: number }>();

  ordered.forEach((id, index) => {
    const radius = index === 0 ? 0 : 34 + 25 * Math.sqrt(index);
    const angle = index * goldenAngle;
    positions.set(id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius * 0.72,
    });
    velocity.set(id, { x: 0, y: 0 });
  });

  // A small deterministic force pass gives the legacy graph's useful clustering
  // without adding a graph-rendering dependency to the desktop bundle.
  if (ordered.length <= 180) {
    const iterations = ordered.length <= 80 ? 80 : 48;
    const idSet = new Set(ordered);
    const usableEdges = edges.filter(edge => idSet.has(edge.source) && idSet.has(edge.target));

    for (let iteration = 0; iteration < iterations; iteration++) {
      const cooling = 1 - iteration / iterations;

      for (let i = 0; i < ordered.length; i += 1) {
        const a = positions.get(ordered[i])!;
        const va = velocity.get(ordered[i])!;
        for (let j = i + 1; j < ordered.length; j += 1) {
          const b = positions.get(ordered[j])!;
          const vb = velocity.get(ordered[j])!;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < 1) {
            dx = (i % 2 ? 1 : -1) * 0.5;
            dy = (j % 2 ? 1 : -1) * 0.5;
            distanceSquared = dx * dx + dy * dy;
          }
          const distance = Math.sqrt(distanceSquared);
          const repulsion = (1850 / Math.max(distanceSquared, 225)) * cooling;
          const fx = (dx / distance) * repulsion;
          const fy = (dy / distance) * repulsion;
          va.x += fx; va.y += fy;
          vb.x -= fx; vb.y -= fy;
        }
      }

      for (const edge of usableEdges) {
        const source = positions.get(edge.source)!;
        const target = positions.get(edge.target)!;
        const sourceVelocity = velocity.get(edge.source)!;
        const targetVelocity = velocity.get(edge.target)!;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const preferred = 82 + Math.min(30, 8 * Math.abs((degrees[edge.source] ?? 0) - (degrees[edge.target] ?? 0)));
        const spring = (distance - preferred) * 0.012 * cooling;
        const fx = (dx / distance) * spring;
        const fy = (dy / distance) * spring;
        sourceVelocity.x += fx; sourceVelocity.y += fy;
        targetVelocity.x -= fx; targetVelocity.y -= fy;
      }

      for (const id of ordered) {
        const point = positions.get(id)!;
        const motion = velocity.get(id)!;
        motion.x += (centerX - point.x) * 0.0015 * cooling;
        motion.y += (centerY - point.y) * 0.0015 * cooling;
        motion.x *= 0.78;
        motion.y *= 0.78;
        point.x += motion.x;
        point.y += motion.y;
      }
    }
  }

  const values = [...positions.values()];
  const minX = Math.min(...values.map(point => point.x));
  const maxX = Math.max(...values.map(point => point.x));
  const minY = Math.min(...values.map(point => point.y));
  const maxY = Math.max(...values.map(point => point.y));
  const margin = 58;
  const scale = Math.min(
    (width - margin * 2) / Math.max(1, maxX - minX),
    (height - margin * 2) / Math.max(1, maxY - minY),
    1.25,
  );
  const graphWidth = (maxX - minX) * scale;
  const graphHeight = (maxY - minY) * scale;
  const offsetX = (width - graphWidth) / 2 - minX * scale;
  const offsetY = (height - graphHeight) / 2 - minY * scale;

  return Object.fromEntries(ordered.map(id => {
    const point = positions.get(id)!;
    return [id, {
      x: point.x * scale + offsetX,
      y: point.y * scale + offsetY,
      degree: degrees[id] ?? 0,
    }];
  }));
}
