import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { GraphPreferences } from '../application/graph-preferences';
import './graph-view.css';
export const folderPalette: Record<string, string> = { 'graph-1': '#9A85C0', 'graph-2': '#A8C6DE', 'graph-3': '#9CA98B', 'graph-4': '#EFDEBD', 'graph-5': '#8F5A5A' };
export function folderColor(id: string, colors: Record<string, string>): string {
  const segments = id.split('/').slice(0, -1);
  while (segments.length) { const token = colors[segments.join('/')]; if (folderPalette[token]) return folderPalette[token]; segments.pop(); }
  return '#b8b2c1';
}
type Data = { nodes: { noteId: string }[]; edges: { source: string; target: string; occurrences: number }[] };
export function GraphView({ data, folders, folderColors, preferences, onPreferences, onOpen }: { data: Data; folders: string[]; folderColors: Record<string,string>; preferences: GraphPreferences; onPreferences: (value: GraphPreferences) => void; onOpen: (id: string) => void }) {
  const [state, setState] = useState(preferences); const current = useRef(state); current.current = state;
  const svg = useRef<SVGSVGElement>(null);
  const prefKey = JSON.stringify(preferences);
  useEffect(() => { setState(preferences); }, [prefKey]);
  const columns = Math.max(1, Math.ceil(Math.sqrt(data.nodes.length)));
  const positions = new Map(data.nodes.map((node, i) => [node.noteId, state.positions[node.noteId] ?? { x: 90 + i % columns * 140, y: 65 + Math.floor(i / columns) * 100 }]));
  const fit = () => { const points = [...positions.values()]; if (!points.length) return { x: 0, y: 0, zoom: 1 }; const minX = Math.min(...points.map(p => p.x)) - 70; const minY = Math.min(...points.map(p => p.y)) - 50; const width = Math.max(...points.map(p => p.x)) - minX + 70; const height = Math.max(...points.map(p => p.y)) - minY + 50; return { x: minX, y: minY, zoom: Math.min(2, 1000 / width, 600 / height) }; };
  const camera = state.x === 0 && state.y === 0 && state.zoom === 1 ? fit() : state;
  const matches = (id: string) => !state.filters.length || state.filters.some(folder => id.startsWith(folder + '/'));
  const commit = (patch: Partial<GraphPreferences>) => { const next = { ...current.current, ...patch }; setState(next); onPreferences(next); };
  const selectedEdges = data.edges.filter(edge => edge.source === state.selected || edge.target === state.selected);
  const begin = (event: PointerEvent<SVGElement>, id?: string) => {
    if (event.button !== 0 || !svg.current) return;
    event.preventDefault(); event.stopPropagation(); const start = { x: event.clientX, y: event.clientY }; const bounds = svg.current.getBoundingClientRect(); const base = { ...state, ...camera }; const point = id ? positions.get(id)! : undefined;
    let moved = false; let latest = base;
    const move = (e: globalThis.PointerEvent) => { const dx = (e.clientX - start.x) * 1000 / bounds.width / camera.zoom; const dy = (e.clientY - start.y) * 600 / bounds.height / camera.zoom; moved ||= Math.abs(dx) + Math.abs(dy) > 3; latest = id && point ? { ...base, selected: id, positions: { ...base.positions, [id]: { x: point.x + dx, y: point.y + dy } } } : { ...base, x: base.x - dx, y: base.y - dy }; setState(latest); };
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); if (!moved && id) latest = { ...base, selected: id }; setState(latest); onPreferences(latest); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true });
  };
  return <section className="graph-workspace" aria-label="Grafo delle note"><header><h1>Grafo</h1><span>{data.nodes.length} note · {data.edges.length} relazioni</span></header>
    <div className="graph-controls"><button onClick={() => commit(fit())}>Centra vista</button><button onClick={() => commit({ ...camera, zoom: Math.min(4, camera.zoom * 1.25) })} aria-label="Ingrandisci grafo">+</button><button onClick={() => commit({ ...camera, zoom: Math.max(.05, camera.zoom / 1.25) })} aria-label="Riduci grafo">−</button><button onClick={() => commit({ selected: undefined })}>Cancella selezione</button><button onClick={() => commit({ filters: [] })}>Ripristina filtri</button></div>
    <details className="graph-filters"><summary>Filtra cartelle ({state.filters.length})</summary>{folders.map(folder => <label key={folder}><input type="checkbox" checked={state.filters.includes(folder)} onChange={e => commit({ filters: e.target.checked ? [...state.filters, folder] : state.filters.filter(f => f !== folder) })}/>{folder}</label>)}</details>
    {!data.nodes.length ? <p>Nessuna nota nella campagna. Crea una nota per iniziare.</p> : <div className="graph-stage"><svg ref={svg} aria-label="Mappa dei collegamenti: frecce per spostare la vista" tabIndex={0} viewBox={`${camera.x} ${camera.y} ${1000 / camera.zoom} ${600 / camera.zoom}`} preserveAspectRatio="none" onPointerDown={e => begin(e)} onWheel={e => { e.preventDefault(); commit({ ...camera, zoom: Math.min(4, Math.max(.05, camera.zoom * (e.deltaY > 0 ? .9 : 1.1))) }); }} onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key.startsWith('Arrow')) { e.preventDefault(); commit({ ...camera, x: camera.x + (e.key === 'ArrowRight' ? 40 : e.key === 'ArrowLeft' ? -40 : 0) / camera.zoom, y: camera.y + (e.key === 'ArrowDown' ? 40 : e.key === 'ArrowUp' ? -40 : 0) / camera.zoom }); } }}>
      <defs><marker id="graph-arrow" markerWidth="6" markerHeight="6" refX="12" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6" fill="#b8b2c1"/></marker></defs>
      {data.edges.map(edge => { const a=positions.get(edge.source), b=positions.get(edge.target); if (!a || !b) return null; const highlighted = edge.source === state.selected || edge.target === state.selected; return <line key={edge.source + ':' + edge.target} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b8b2c1" strokeWidth={highlighted ? 2.5 : 1} opacity={highlighted ? .95 : matches(edge.source) || matches(edge.target) ? .4 : .15} markerEnd="url(#graph-arrow)"/>; })}
      {data.nodes.map((node, index) => { const p=positions.get(node.noteId)!; return <g key={node.noteId} tabIndex={0} role="button" aria-label={node.noteId} aria-pressed={state.selected === node.noteId} data-node={index} opacity={matches(node.noteId) ? 1 : .28} onPointerDown={e => begin(e, node.noteId)} onDoubleClick={() => onOpen(node.noteId)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit({ selected: node.noteId }); } else if (e.key.startsWith('Arrow')) { e.preventDefault(); if (e.altKey) commit({ positions: { ...state.positions, [node.noteId]: { x: p.x + (e.key === 'ArrowRight' ? 10 : e.key === 'ArrowLeft' ? -10 : 0), y: p.y + (e.key === 'ArrowDown' ? 10 : e.key === 'ArrowUp' ? -10 : 0) } } }); else (svg.current?.querySelector(`[data-node="${(index + (['ArrowRight','ArrowDown'].includes(e.key) ? 1 : data.nodes.length - 1)) % data.nodes.length}"]`) as SVGElement | null)?.focus(); } }}>
        <circle cx={p.x} cy={p.y} r={state.selected === node.noteId ? 12 : 8} fill={folderColor(node.noteId, folderColors)} stroke={state.selected === node.noteId ? '#fff' : 'transparent'} strokeWidth="3"/><text x={p.x} y={p.y+25} textAnchor="middle" fill="#fff" fontSize="12">{node.noteId.split('/').at(-1)!.replace(/\.md$/iu,'').slice(0,24)}</text></g>; })}
    </svg></div>}
    <label className="graph-node-picker">Seleziona nota <select aria-label="Seleziona nodo del grafo" value={state.selected ?? ''} onChange={e => commit({ selected: e.target.value || undefined })}><option value="">Nessuna selezione</option>{data.nodes.map(node => <option key={node.noteId}>{node.noteId}</option>)}</select></label>
    {state.selected && positions.has(state.selected) && <aside className="graph-node-detail"><strong>{state.selected.split('/').at(-1)?.replace(/\.md$/iu,'')}</strong><p>{state.selected}</p><p>{selectedEdges.length} relazioni · {selectedEdges.filter(e => e.source === state.selected).length} in uscita</p><button onClick={() => onOpen(state.selected!)}>Apri nota</button></aside>}
  </section>;
}
