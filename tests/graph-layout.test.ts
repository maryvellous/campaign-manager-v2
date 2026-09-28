import assert from 'node:assert/strict';
import test from 'node:test';
import { graphDegrees, layoutGraph } from '../apps/desktop/renderer/graph-layout';

test('graph layout is deterministic and keeps every node inside the canvas', () => {
  const nodes = ['A.md', 'B.md', 'C.md', 'D.md', 'E.md'].map(noteId => ({ noteId }));
  const edges = [
    { source: 'A.md', target: 'B.md' },
    { source: 'A.md', target: 'C.md' },
    { source: 'C.md', target: 'D.md' },
  ];
  const first = layoutGraph(nodes, edges);
  const second = layoutGraph(nodes, edges);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), nodes.map(node => node.noteId).sort());
  for (const point of Object.values(first)) {
    assert.ok(point.x >= 0 && point.x <= 900);
    assert.ok(point.y >= 0 && point.y <= 520);
  }
});

test('graph degree counts incoming and outgoing relationships', () => {
  const nodes = ['A.md', 'B.md', 'C.md'].map(noteId => ({ noteId }));
  const degrees = graphDegrees(nodes, [
    { source: 'A.md', target: 'B.md' },
    { source: 'C.md', target: 'B.md' },
  ]);
  assert.deepEqual(degrees, { 'A.md': 1, 'B.md': 2, 'C.md': 1 });
});
