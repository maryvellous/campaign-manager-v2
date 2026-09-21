import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { BoardDocument, BoardElement, BoardSnapshot, BoardTool } from '../infrastructure/board-repository';
import { Icon } from './shell-components';

type Reply = { ok: boolean; data?: unknown };
type BoardState = BoardDocument & { relativePath: string; revision: string };
type Command = (input: Record<string, unknown>) => Promise<boolean>;
type RawCommand = (input: Record<string, unknown>) => Promise<Reply>;

export function BoardView({ board, boards = [], status, error, disk, onCommand, onRawCommand }: { board?: BoardState; boards?: BoardSnapshot[]; status?: string; error?: string; disk?: BoardSnapshot; onCommand: Command; onRawCommand: RawCommand }) {
  const [tool, setTool] = useState<BoardTool>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(board?.viewport.zoom ?? 1);
  const [newTitle, setNewTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [past, setPast] = useState<BoardElement[][]>([]);
  const [future, setFuture] = useState<BoardElement[][]>([]);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number }>();
  const stage = useRef<HTMLDivElement>(null);
  const [gestureViewport, setGestureViewport] = useState<BoardDocument['viewport']>();
  const [gestureElements, setGestureElements] = useState<BoardElement[]>();
  const selected = selectedIds[0];

  useEffect(() => {
    let cancelled = false;
    const assets = (board?.elements ?? []).filter(element => element.kind === 'image' && element.assetPath);
    void Promise.all(assets.map(async element => {
      const reply = await onRawCommand({ action: 'boardAsset', relativePath: element.assetPath });
      return reply.ok && typeof reply.data === 'string' ? [element.assetPath!, reply.data] as const : undefined;
    })).then(values => { if (!cancelled) setAssetUrls(Object.fromEntries(values.filter((value): value is readonly [string, string] => !!value))); });
    return () => { cancelled = true; };
  }, [board?.boardId, board?.revision]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!board || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable=true]'))) return;
      if (event.key === 'Escape') setSelectedIds([]);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      if (event.key === 'Delete') { event.preventDefault(); remove(); }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selectedIds.length) { event.preventDefault(); const dx = event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0; const dy = event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0; changeSelected(element => element.locked ? element : { ...element, x: element.x + dx, y: element.y + dy }); }
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  });

  if (!board) {
    return <section className="board-empty">
      <Icon name="graph" size={38} />
      <h1>Le tue board</h1>
      <p>Crea una board per preparare mappe, scene e materiale visivo.</p>
      <div className="board-list">{boards.map(item => <button key={item.relativePath} onClick={() => void onCommand({ action: 'boardOpen', relativePath: item.relativePath })}><Icon name="graph" /><span>{item.title}</span><small>{item.relativePath}</small></button>)}</div>
      <form onSubmit={event => { event.preventDefault(); if (newTitle.trim()) void onCommand({ action: 'boardCreate', title: newTitle.trim() }).then(() => setNewTitle('')); }}>
        <input aria-label="Nome nuova board" placeholder="Nome nuova board" value={newTitle} onChange={event => setNewTitle(event.target.value)} />
        <button className="primary" type="submit"><Icon name="plus" />Nuova board</button>
      </form>
    </section>;
  }

  const update = (elements: BoardElement[], viewport = board.viewport, record = true) => { if (record) { setPast(items => [...items.slice(-49), board.elements]); setFuture([]); } void onRawCommand({ action: 'boardUpdate', board: { ...board, elements, viewport } }); };
  const addElement = (element: BoardElement) => { update([...board.elements, element]); setSelectedIds([element.elementId]); };
  const addText = () => addElement({ elementId: crypto.randomUUID(), kind: 'text', x: 120, y: 100, width: 240, height: 90, z: board.elements.length + 1, locked: false, visibleByDefault: false, text: 'Nuovo testo' });
  const addToken = () => addElement({ elementId: crypto.randomUUID(), kind: 'token', x: 180, y: 180, width: 80, height: 80, z: board.elements.length + 1, locked: false, visibleByDefault: false, title: 'Token' });
  const addLink = () => addElement({ elementId: crypto.randomUUID(), kind: 'link', x: 240, y: 240, width: 220, height: 4, z: board.elements.length + 1, locked: false, visibleByDefault: false, title: 'Collegamento' });
  const addImage = async () => {
    const reply = await onRawCommand({ action: 'boardImportAsset' });
    if (!reply.ok || typeof reply.data !== 'string') return;
    addElement({ elementId: crypto.randomUUID(), kind: 'image', x: 160, y: 120, width: 260, height: 180, z: board.elements.length + 1, locked: false, visibleByDefault: false, assetPath: reply.data });
  };
  const beginMove = (event: PointerEvent<HTMLDivElement>, element: BoardElement) => {
    if (element.locked || tool !== 'select' || (event.target instanceof HTMLElement && event.target.closest('textarea, input'))) return;
    event.stopPropagation();
    const ids = new Set(selectedIds.includes(element.elementId) ? selectedIds : [element.elementId]);
    if (element.groupId) board.elements.filter(item => item.groupId === element.groupId).forEach(item => ids.add(item.elementId));
    setSelectedIds([...ids]);
    const startX = event.clientX; const startY = event.clientY;
    const moved = (end: globalThis.PointerEvent) => board.elements.map(item => ids.has(item.elementId) && !item.locked ? { ...item, x: item.x + (end.clientX - startX) / zoom, y: item.y + (end.clientY - startY) / zoom } : item);
    const preview = (end: globalThis.PointerEvent) => setGestureElements(moved(end));
    const finish = (end: globalThis.PointerEvent) => { if (Math.hypot(end.clientX-startX, end.clientY-startY) > 2) update(moved(end)); setGestureElements(undefined); window.removeEventListener('pointermove', preview); window.removeEventListener('pointerup', finish); };
    window.addEventListener('pointermove', preview); window.addEventListener('pointerup', finish);
  };
  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (tool !== 'hand') { beginMarquee(event); return; }
    event.preventDefault();
    const startX = event.clientX; const startY = event.clientY;
    const viewportAt = (end: globalThis.PointerEvent) => ({ ...board.viewport, x: board.viewport.x + end.clientX-startX, y: board.viewport.y + end.clientY-startY });
    const preview = (end: globalThis.PointerEvent) => setGestureViewport(viewportAt(end));
    const finish = (end: globalThis.PointerEvent) => { update(board.elements, viewportAt(end), false); setGestureViewport(undefined); window.removeEventListener('pointermove', preview); window.removeEventListener('pointerup', finish); };
    window.addEventListener('pointermove', preview); window.addEventListener('pointerup', finish);
  };
  const remove = () => { if (selectedIds.length) update(board.elements.filter(item => !selectedIds.includes(item.elementId))); setSelectedIds([]); };
  const undo = () => { const previous = past.at(-1); if (!previous) return; setPast(items => items.slice(0, -1)); setFuture(items => [...items, board.elements]); update(previous, board.viewport, false); };
  const redo = () => { const next = future.at(-1); if (!next) return; setFuture(items => items.slice(0, -1)); setPast(items => [...items, board.elements]); update(next, board.viewport, false); };
  const changeSelected = (change: (element: BoardElement) => BoardElement) => { if (!selectedIds.length) return; update(board.elements.map(element => selectedIds.includes(element.elementId) ? change(element) : element)); };
  const groupSelected = () => { if (selectedIds.length < 2) return; const groupId = crypto.randomUUID(); changeSelected(element => ({ ...element, groupId })); };
  const centerContent = () => { if (!board.elements.length) return; const minX = Math.min(...board.elements.map(element => element.x)); const minY = Math.min(...board.elements.map(element => element.y)); const maxX = Math.max(...board.elements.map(element => element.x + element.width)); const maxY = Math.max(...board.elements.map(element => element.y + element.height)); update(board.elements, { ...board.viewport, x: (stage.current?.clientWidth ?? 800) / 2 - (minX + maxX) * zoom / 2, y: (stage.current?.clientHeight ?? 500) / 2 - (minY + maxY) * zoom / 2 }, false); };
  const setViewportZoom = (next: number) => { setZoom(next); update(board.elements, { ...board.viewport, zoom: next }, false); };
  const beginMarquee = (event: PointerEvent<HTMLDivElement>) => {
    if (tool !== 'select' || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect(); const startX = (event.clientX - bounds.left - board.viewport.x) / zoom; const startY = (event.clientY - bounds.top - board.viewport.y) / zoom;
    const moveEvent = (move: globalThis.PointerEvent) => { const x = (move.clientX - bounds.left - board.viewport.x) / zoom; const y = (move.clientY - bounds.top - board.viewport.y) / zoom; setMarquee({ x: Math.min(startX, x), y: Math.min(startY, y), width: Math.abs(x - startX), height: Math.abs(y - startY) }); };
    const upEvent = (up: globalThis.PointerEvent) => { const x = (up.clientX - bounds.left - board.viewport.x) / zoom; const y = (up.clientY - bounds.top - board.viewport.y) / zoom; const left = Math.min(startX, x); const top = Math.min(startY, y); const right = Math.max(startX, x); const bottom = Math.max(startY, y); const hits = board.elements.filter(element => element.x < right && element.x + element.width > left && element.y < bottom && element.y + element.height > top).map(element => element.elementId); setSelectedIds(event.shiftKey ? [...new Set([...selectedIds, ...hits])] : hits); setMarquee(undefined); window.removeEventListener('pointermove', moveEvent); window.removeEventListener('pointerup', upEvent); };
    window.addEventListener('pointermove', moveEvent); window.addEventListener('pointerup', upEvent);
  };
  const elementContent = (element: BoardElement) => {
    if (element.kind === 'image') return <img alt={element.title ?? 'Immagine board'} src={assetUrls[element.assetPath ?? '']} />;
    if (element.kind === 'link') return <span>{element.title}</span>;
    if (element.kind === 'token') return <><strong>{element.title}</strong><small>token</small></>;
    if (element.kind === 'note-card') return <><strong>{element.title}</strong><p>{element.excerpt}</p></>;
    return <textarea aria-label="Testo board" value={element.text ?? ''} onChange={event => update(board.elements.map(item => item.elementId === element.elementId ? { ...item, text: event.target.value } : item))} />;
  };


  return <section className="board-view">
    <header className="board-header"><div><span className="eyebrow">BOARD PREPARATA</span>{editingTitle ? <input aria-label="Nome board" autoFocus defaultValue={board.title} onKeyDown={event => { if (event.key === 'Escape') setEditingTitle(false); if (event.key === 'Enter') { event.preventDefault(); void onCommand({ action: 'boardRename', title: event.currentTarget.value }).then(() => setEditingTitle(false)); } }} onBlur={event => { if (event.currentTarget.value.trim() && event.currentTarget.value !== board.title) void onCommand({ action: 'boardRename', title: event.currentTarget.value }); setEditingTitle(false); }} /> : <button className="title-button" onClick={() => setEditingTitle(true)}><h1>{board.title}</h1><Icon name="rename" size={15} /></button>}</div><div className="board-status" role="status">{status === 'dirty' ? 'Modifiche da salvare' : status === 'saving' ? 'Salvataggio…' : status === 'conflict' ? 'Conflitto con il disco' : status === 'error' ? 'Salvataggio non riuscito' : 'Salvato'}{error && <small>{error}</small>}</div></header>
    {status === 'conflict' && <section className="notice" role="alert"><h2>La board è cambiata sul disco</h2><p>Le modifiche locali sono conservate. Scegli quale versione mantenere.</p><details><summary>Confronta le versioni</summary><h3>Modifiche locali</h3><pre>{JSON.stringify({ title: board.title, elements: board.elements }, null, 2)}</pre><h3>Versione sul disco</h3><pre>{disk ? JSON.stringify({ title: disk.title, elements: disk.elements }, null, 2) : 'Versione non disponibile'}</pre></details><button disabled={!disk} onClick={() => void onCommand({ action: 'boardResolve', choice: 'local', revision: disk?.revision })}>Mantieni modifiche locali</button><button onClick={() => void onCommand({ action: 'boardResolve', choice: 'disk' })}>Usa versione sul disco</button></section>}
    <div className="board-toolbar" role="toolbar" aria-label="Strumenti board">
      <button aria-pressed={tool === 'select'} aria-label="Seleziona" title="Seleziona" onClick={() => setTool('select')}><Icon name="note" /></button>
      <button aria-pressed={tool === 'hand'} aria-label="Mano" title="Mano" onClick={() => setTool('hand')}><Icon name="move" /></button>
      <button aria-pressed={tool === 'text'} aria-label="Nota e testo" title="Nota e testo" onClick={() => { setTool('text'); addText(); }}><Icon name="note" /></button>
      <button aria-pressed={tool === 'image'} aria-label="Immagine" title="Immagine" onClick={() => { setTool('image'); void addImage(); }}><Icon name="folder" /></button>
      <button aria-pressed={tool === 'token'} aria-label="Token" title="Token" onClick={() => { setTool('token'); addToken(); }}><Icon name="star" /></button>
      <button aria-pressed={tool === 'link'} aria-label="Collegamento" title="Collegamento" onClick={() => { setTool('link'); addLink(); }}><Icon name="forward" /></button>
      <span className="toolbar-spacer" />
      <button aria-label="Zoom indietro" onClick={() => setViewportZoom(Math.max(.4, zoom - .1))}>-</button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button aria-label="Zoom avanti" onClick={() => setViewportZoom(Math.min(2.5, zoom + .1))}>+</button>
      <button aria-label="Annulla" disabled={!past.length} onClick={undo}>Undo</button><button aria-label="Ripeti" disabled={!future.length} onClick={redo}>Redo</button><button aria-label="Raggruppa" disabled={selectedIds.length < 2} onClick={groupSelected}>Gruppo</button><button aria-label="Centra contenuto" onClick={centerContent}>Centra</button><button aria-label="Porta avanti" disabled={!selected} onClick={() => changeSelected(element => ({ ...element, z: Math.max(...board.elements.map(item => item.z), 0) + 1 }))}>Avanti</button><button aria-label="Blocca elemento" disabled={!selected} onClick={() => changeSelected(element => ({ ...element, locked: !element.locked }))}>{selected && board.elements.find(element => element.elementId === selected)?.locked ? 'Sblocca' : 'Blocca'}</button><button aria-label="Elimina elemento" disabled={!selected} onClick={remove}><Icon name="trash" /></button><button aria-label="Salva board" onClick={() => void onCommand({ action: 'boardSave' })}>Salva</button>
    </div>
    <div ref={stage} className="board-canvas" onPointerDown={beginPan}>
      <div className="board-world" style={{ transform: `translate(${(gestureViewport ?? board.viewport).x}px, ${(gestureViewport ?? board.viewport).y}px) scale(${zoom})` }}>
      {marquee && <div className="board-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
      {[...(gestureElements ?? board.elements)].sort((left, right) => left.z - right.z).map(element => <div key={element.elementId} className={`board-element board-${element.kind} ${selectedIds.includes(element.elementId) ? 'selected' : ''} ${element.locked ? 'locked' : ''}`} style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.z, resize: element.kind === 'text' || element.kind === 'image' ? 'both' : 'none' }} onPointerDown={event => beginMove(event, element)} onClick={event => { event.stopPropagation(); setSelectedIds(previous => event.shiftKey ? previous.includes(element.elementId) ? previous.filter(id => id !== element.elementId) : [...previous, element.elementId] : [element.elementId]); }}>{elementContent(element)}</div>)}
      </div>
    </div>
  </section>;
}
