import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { BoardDocument, BoardElement, BoardImageElement, BoardRecoveryDraft, BoardSnapshot, BoardTextElement } from '../application/board-types';

type Tool = 'select' | 'hand' | 'text' | 'image';
type CommandReply = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
type Command = (input: Record<string, unknown>) => Promise<CommandReply>;
type BoardListItem = { path: string; title: string; boardId: string };
type RecoveryItem = { key: string; draft: BoardRecoveryDraft };
type BoardSession = { snapshot: BoardSnapshot; state: 'clean' | 'dirty' | 'saving' | 'error' | 'conflict'; error?: string; recovery?: RecoveryItem };
type BoardListReply = { boards: BoardListItem[]; recoveries: RecoveryItem[] };
type BoardOpenReply = { snapshot: BoardSnapshot; recovery?: RecoveryItem };
type BoardCreateReply = BoardListReply & { snapshot: BoardSnapshot };

const clone = (document: BoardDocument): BoardDocument => structuredClone(document);
const byZ = (a: BoardElement, b: BoardElement) => a.z - b.z;
const nextZ = (document: BoardDocument) => Math.max(0, ...document.elements.map(element => element.z)) + 1;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Immagine non leggibile.'));
      image.src = url;
    });
    const max = 520;
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    return { width: Math.max(80, image.naturalWidth * scale), height: Math.max(80, image.naturalHeight * scale) };
  } finally { URL.revokeObjectURL(url); }
}

function BoardImage({ element, command }: { element: BoardImageElement; command: Command }) {
  const [src, setSrc] = useState<string>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    setMissing(false);
    void command({ action: 'board:asset', assetPath: element.assetPath }).then(reply => {
      if (!alive) return;
      if (!reply.ok) { setMissing(true); return; }
      setSrc((reply.data as { dataUrl: string }).dataUrl);
    });
    return () => { alive = false; };
  }, [command, element.assetPath]);
  return missing
    ? <div className="board-missing-asset"><strong>Immagine mancante</strong><small>{element.assetPath}</small></div>
    : src ? <img draggable={false} src={src} alt="" /> : <div className="board-image-loading">Caricamento…</div>;
}

export function BoardWorkspace({ command }: { command: Command }) {
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [recoveries, setRecoveries] = useState<RecoveryItem[]>([]);
  const [session, setSession] = useState<BoardSession>();
  const sessionRef = useRef(session); sessionRef.current = session;
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string>();
  const [newTitle, setNewTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [message, setMessage] = useState<string>();
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; text: string }>();
  const [textEditing, setTextEditing] = useState<{ elementId: string; text: string }>();
  const history = useRef<{ past: BoardDocument[]; future: BoardDocument[] }>({ past: [], future: [] });
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    const reply = await command({ action: 'boards:list' });
    if (!reply.ok) { setMessage(reply.error?.message); return; }
    const data = reply.data as BoardListReply;
    setBoards(data.boards); setRecoveries(data.recoveries);
  }, [command]);

  useEffect(() => { void refreshList(); }, [refreshList]);

  const protect = useCallback(async (current: BoardSession) => {
    const reply = await command({ action: 'board:protect', path: current.snapshot.path, baseRevision: current.snapshot.revision, document: current.snapshot.document });
    if (!reply.ok) setSession(value => value ? { ...value, state: 'error', error: `Recovery non riuscita: ${reply.error?.message ?? 'errore sconosciuto'}` } : value);
  }, [command]);

  const save = useCallback(async (current = sessionRef.current): Promise<BoardSession | undefined> => {
    if (!current) return undefined;
    if (current.state === 'clean') return current;
    if (current.state === 'saving' || current.state === 'conflict') return undefined;
    const savingDocument = clone(current.snapshot.document);
    const saving: BoardSession = { ...current, snapshot: { ...current.snapshot, document: savingDocument }, state: 'saving', error: undefined };
    setSession(saving); sessionRef.current = saving;
    const reply = await command({ action: 'board:save', path: current.snapshot.path, baseRevision: current.snapshot.revision, document: savingDocument });
    if (!reply.ok) {
      const latest = sessionRef.current ?? current;
      const failed: BoardSession = { ...latest, state: reply.error?.code === 'conflict' ? 'conflict' : 'error', error: reply.error?.message };
      setSession(failed); sessionRef.current = failed;
      return undefined;
    }
    const snapshot = (reply.data as { snapshot: BoardSnapshot }).snapshot;
    const latest = sessionRef.current;
    const changedWhileSaving = !!latest && JSON.stringify(latest.snapshot.document) !== JSON.stringify(savingDocument);
    if (changedWhileSaving && latest) {
      const dirty: BoardSession = { ...latest, snapshot: { ...latest.snapshot, revision: snapshot.revision }, state: 'dirty', error: undefined };
      setSession(dirty); sessionRef.current = dirty;
      void protect(dirty);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => { void save(sessionRef.current); }, 700);
    } else {
      const saved: BoardSession = { snapshot, state: 'clean' };
      setSession(saved); sessionRef.current = saved;
    }
    setRecoveries(list => list.filter(item => item.draft.boardPath !== snapshot.path));
    void refreshList();
    return sessionRef.current;
  }, [command, protect, refreshList]);

  const scheduleSave = useCallback((current: BoardSession) => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { void save(sessionRef.current); }, 700);
    void protect(current);
  }, [protect, save]);

  useEffect(() => () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const current = sessionRef.current;
    if (current && current.state === 'dirty') void command({ action: 'board:save', path: current.snapshot.path, baseRevision: current.snapshot.revision, document: current.snapshot.document });
  }, [command]);

  const applyDocument = useCallback((document: BoardDocument, remember = true) => {
    const current = sessionRef.current;
    if (!current) return;
    if (remember) {
      history.current.past.push(clone(current.snapshot.document));
      history.current.past = history.current.past.slice(-80);
      history.current.future = [];
    }
    const next: BoardSession = { ...current, snapshot: { ...current.snapshot, document }, state: 'dirty', error: undefined };
    setSession(next); sessionRef.current = next; scheduleSave(next);
  }, [scheduleSave]);

  const openBoard = useCallback(async (path: string, force = false) => {
    const current = sessionRef.current;
    if (current?.snapshot.path === path && !force) return;
    if (current && current.snapshot.path !== path && current.state !== 'clean') {
      const saved = await save(current);
      if (!saved || saved.state !== 'clean') return;
    }
    const reply = await command({ action: 'board:open', path });
    if (!reply.ok) { setMessage(reply.error?.message); return; }
    const data = reply.data as BoardOpenReply;
    setSession({ snapshot: data.snapshot, state: 'clean', recovery: data.recovery });
    setSelected(undefined); setTextDraft(undefined); setTextEditing(undefined); setMessage(undefined);
    history.current = { past: [], future: [] };
  }, [command, save]);

  const createBoard = async () => {
    if (!newTitle.trim()) return;
    const current = sessionRef.current;
    if (current && current.state !== 'clean') {
      const saved = await save(current);
      if (!saved || saved.state !== 'clean') return;
    }
    const reply = await command({ action: 'board:create', title: newTitle.trim() });
    if (!reply.ok) { setMessage(reply.error?.message); return; }
    const data = reply.data as BoardCreateReply;
    setBoards(data.boards); setRecoveries(data.recoveries); setNewTitle('');
    setSession({ snapshot: data.snapshot, state: 'clean' }); history.current = { past: [], future: [] };
  };

  const renameBoard = async () => {
    const current = sessionRef.current;
    if (!current || !renameTitle.trim()) return;
    const latest = await save(current);
    if (!latest || latest.state !== 'clean') return;
    const reply = await command({ action: 'board:rename', path: latest.snapshot.path, title: renameTitle.trim() });
    if (!reply.ok) { setMessage(reply.error?.message); return; }
    const data = reply.data as BoardCreateReply;
    setBoards(data.boards); setRecoveries(data.recoveries); setSession({ snapshot: data.snapshot, state: 'clean' }); setRenaming(false);
  };

  const restoreRecovery = () => {
    const current = sessionRef.current;
    if (!current?.recovery) return;
    const recovered = current.recovery.draft;
    const conflicted = recovered.baseRevision !== current.snapshot.revision;
    const next: BoardSession = {
      snapshot: { ...current.snapshot, revision: recovered.baseRevision, document: clone(recovered.document) },
      state: conflicted ? 'conflict' : 'dirty',
      error: conflicted ? 'La board su disco è cambiata dopo la recovery. Scegli esplicitamente quale versione mantenere.' : undefined
    };
    setSession(next); sessionRef.current = next;
    if (!conflicted) scheduleSave(next);
  };

  const discardRecovery = async () => {
    const current = sessionRef.current;
    if (!current) return;
    const reply = await command({ action: 'board:discardRecovery', path: current.snapshot.path });
    if (!reply.ok) { setMessage(reply.error?.message); return; }
    setSession(value => value ? { ...value, recovery: undefined } : value);
    const data = reply.data as BoardListReply; setBoards(data.boards); setRecoveries(data.recoveries);
  };

  const reloadDisk = async () => {
    const current = sessionRef.current; if (!current) return;
    const discarded = await command({ action: 'board:discardRecovery', path: current.snapshot.path });
    if (!discarded.ok) { setMessage(discarded.error?.message); return; }
    await openBoard(current.snapshot.path, true);
  };

  const overwriteAfterConflict = async () => {
    const current = sessionRef.current; if (!current) return;
    await protect(current);
    const disk = await command({ action: 'board:open', path: current.snapshot.path });
    if (!disk.ok) { setMessage(disk.error?.message); return; }
    const revision = (disk.data as BoardOpenReply).snapshot.revision;
    const reply = await command({ action: 'board:save', path: current.snapshot.path, baseRevision: revision, document: current.snapshot.document });
    if (!reply.ok) { setSession(value => value ? { ...value, state: 'conflict', error: reply.error?.message } : value); return; }
    setSession({ snapshot: (reply.data as { snapshot: BoardSnapshot }).snapshot, state: 'clean' });
    void refreshList();
  };

  const undo = (redo = false) => {
    const current = sessionRef.current; if (!current) return;
    const from = redo ? history.current.future : history.current.past;
    const to = redo ? history.current.past : history.current.future;
    const document = from.pop(); if (!document) return;
    to.push(clone(current.snapshot.document));
    applyDocument(clone(document), false);
  };

  const changeElement = (elementId: string, updater: (element: BoardElement) => BoardElement, remember = true) => {
    const current = sessionRef.current; if (!current) return;
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => element.elementId === elementId ? updater(element) : element) }, remember);
  };

  const deleteSelected = () => {
    const current = sessionRef.current; if (!current || !selected) return;
    const element = current.snapshot.document.elements.find(item => item.elementId === selected);
    if (!element || element.locked) return;
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.filter(item => item.elementId !== selected) });
    setSelected(undefined);
  };

  const zOrder = (direction: 'front' | 'back' | 'forward' | 'backward') => {
    const current = sessionRef.current; if (!current || !selected) return;
    const ordered = [...current.snapshot.document.elements].sort(byZ);
    const index = ordered.findIndex(element => element.elementId === selected); if (index < 0) return;
    const targetIndex = direction === 'front' ? ordered.length - 1 : direction === 'back' ? 0 : clamp(index + (direction === 'forward' ? 1 : -1), 0, ordered.length - 1);
    if (targetIndex === index) return;
    const [item] = ordered.splice(index, 1); ordered.splice(targetIndex, 0, item);
    const z = new Map(ordered.map((element, order) => [element.elementId, order + 1]));
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => ({ ...element, z: z.get(element.elementId)! })) });
  };

  const beginMove = (event: ReactPointerEvent, element: BoardElement) => {
    if (tool !== 'select' || element.locked) return;
    event.stopPropagation(); setSelected(element.elementId);
    const current = sessionRef.current; if (!current) return;
    const before = clone(current.snapshot.document);
    const start = { x: event.clientX, y: event.clientY };
    const base = { x: element.x, y: element.y };
    const zoom = current.snapshot.document.camera.zoom;
    let moved = false;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const now = sessionRef.current; if (!now) return;
      const nextX = base.x + (pointer.clientX - start.x) / zoom;
      const nextY = base.y + (pointer.clientY - start.y) / zoom;
      if (nextX === base.x && nextY === base.y) return;
      moved = true;
      const elements = now.snapshot.document.elements.map(item => item.elementId === element.elementId ? { ...item, x: nextX, y: nextY } : item);
      const next = { ...now, snapshot: { ...now.snapshot, document: { ...now.snapshot.document, elements } }, state: 'dirty' as const };
      setSession(next); sessionRef.current = next;
    };
    const up = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      const now = sessionRef.current; if (!now || !moved) return;
      history.current.past.push(before); history.current.future = []; scheduleSave(now);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };

  const beginResize = (event: ReactPointerEvent, element: BoardElement) => {
    event.stopPropagation();
    if (element.locked) return;
    const current = sessionRef.current; if (!current) return;
    const before = clone(current.snapshot.document);
    const start = { x: event.clientX, y: event.clientY };
    const ratio = element.width / element.height;
    const zoom = current.snapshot.document.camera.zoom;
    let resized = false;
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - start.x) / zoom;
      const width = Math.max(60, element.width + dx);
      const height = element.type === 'image' ? width / ratio : Math.max(48, element.height + (pointer.clientY - start.y) / zoom);
      if (width === element.width && height === element.height) return;
      resized = true;
      const now = sessionRef.current; if (!now) return;
      const elements = now.snapshot.document.elements.map(item => item.elementId === element.elementId ? { ...item, width, height } : item);
      const next = { ...now, snapshot: { ...now.snapshot, document: { ...now.snapshot.document, elements } }, state: 'dirty' as const };
      setSession(next); sessionRef.current = next;
    };
    const up = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      const now = sessionRef.current; if (!now || !resized) return;
      history.current.past.push(before); history.current.future = []; scheduleSave(now);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };

  const commitTextEdit = () => {
    const edit = textEditing;
    if (!edit) return;
    setTextEditing(undefined);
    if (!edit.text.trim()) return;
    const existing = sessionRef.current?.snapshot.document.elements.find(element => element.elementId === edit.elementId);
    if (!existing || existing.type !== 'text' || existing.text === edit.text) return;
    changeElement(edit.elementId, element => element.type === 'text' ? { ...element, text: edit.text } : element);
  };

  const importFile = async (file: File, world?: { x: number; y: number }) => {
    if (!/image\/(png|jpeg|webp)/u.test(file.type) && !/\.(png|jpe?g|webp)$/iu.test(file.name)) { setMessage('Usa un’immagine PNG, JPG/JPEG o WebP.'); return; }
    if (file.size > 20 * 1024 * 1024) { setMessage('L’immagine supera il limite di 20 MB.'); return; }
    let buffer: ArrayBuffer;
    let size: { width: number; height: number };
    try { [buffer, size] = await Promise.all([file.arrayBuffer(), imageSize(file)]); }
    catch { setMessage('L’immagine non è leggibile.'); return; }
    const reply = await command({ action: 'board:importImage', name: file.name, base64: bytesToBase64(new Uint8Array(buffer)) });
    if (!reply.ok) { setMessage(reply.error?.message); return; }
    const current = sessionRef.current; if (!current) return;
    const assetPath = (reply.data as { assetPath: string }).assetPath;
    const element: BoardImageElement = {
      type: 'image', elementId: crypto.randomUUID(), assetPath,
      x: world?.x ?? 160, y: world?.y ?? 140, width: size.width, height: size.height,
      z: nextZ(current.snapshot.document), locked: false
    };
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, element] });
    setSelected(element.elementId); setTool('select');
  };

  const worldPoint = (clientX: number, clientY: number) => {
    const current = sessionRef.current;
    const rect = viewport.current?.getBoundingClientRect();
    if (!current || !rect) return { x: 0, y: 0 };
    const camera = current.snapshot.document.camera;
    return { x: (clientX - rect.left - camera.x) / camera.zoom, y: (clientY - rect.top - camera.y) / camera.zoom };
  };

  const viewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = sessionRef.current; if (!current) return;
    if (tool === 'text') {
      const point = worldPoint(event.clientX, event.clientY); setTextDraft({ ...point, text: '' }); setSelected(undefined); return;
    }
    if (tool !== 'hand' && event.button !== 1) { setSelected(undefined); return; }
    event.preventDefault();
    const before = clone(current.snapshot.document);
    const start = { x: event.clientX, y: event.clientY, cameraX: before.camera.x, cameraY: before.camera.y };
    let panned = false;
    const target = event.currentTarget; target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const now = sessionRef.current; if (!now) return;
      const x = start.cameraX + pointer.clientX - start.x;
      const y = start.cameraY + pointer.clientY - start.y;
      if (x === start.cameraX && y === start.cameraY) return;
      panned = true;
      const document = { ...now.snapshot.document, camera: { ...now.snapshot.document.camera, x, y } };
      const next = { ...now, snapshot: { ...now.snapshot, document }, state: 'dirty' as const };
      setSession(next); sessionRef.current = next;
    };
    const up = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      const now = sessionRef.current; if (now && panned) scheduleSave(now);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };

  const zoom = (event: ReactWheelEvent<HTMLDivElement>) => {
    const current = sessionRef.current; if (!current) return;
    event.preventDefault();
    const camera = current.snapshot.document.camera;
    const nextZoom = clamp(camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.2, 4);
    if (nextZoom === camera.zoom) return;
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    const px = event.clientX - rect.left, py = event.clientY - rect.top;
    const worldX = (px - camera.x) / camera.zoom, worldY = (py - camera.y) / camera.zoom;
    const document = { ...current.snapshot.document, camera: { x: px - worldX * nextZoom, y: py - worldY * nextZoom, zoom: nextZoom } };
    const next = { ...current, snapshot: { ...current.snapshot, document }, state: 'dirty' as const };
    setSession(next); sessionRef.current = next; scheduleSave(next);
  };

  const commitTextDraft = () => {
    const current = sessionRef.current; const draft = textDraft;
    if (!current || !draft) return;
    setTextDraft(undefined);
    if (!draft.text.trim()) return;
    const element: BoardTextElement = { type: 'text', elementId: crypto.randomUUID(), text: draft.text, x: draft.x, y: draft.y, width: 260, height: 120, z: nextZ(current.snapshot.document), locked: false };
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, element] });
    setSelected(element.elementId); setTool('select');
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!sessionRef.current) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); undo(true); }
      if (event.key === 'Delete' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) deleteSelected();
      if (event.key === 'Escape') { setSelected(undefined); setTextDraft(undefined); setTextEditing(undefined); setTool('select'); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [save]);

  const currentElement = session && selected ? session.snapshot.document.elements.find(element => element.elementId === selected) : undefined;
  const saveLabel = session?.state === 'clean' ? 'Salvata' : session?.state === 'saving' ? 'Salvataggio…' : session?.state === 'conflict' ? 'Conflitto' : session?.state === 'error' ? 'Errore' : 'Da salvare';

  return <div className="boards-workspace">
    <aside className="boards-list">
      <div className="boards-list-heading"><div><span className="eyebrow">V0.2</span><h2>Board</h2></div><button title="Aggiorna elenco" onClick={() => void refreshList()}>↻</button></div>
      <form className="board-new" onSubmit={event => { event.preventDefault(); void createBoard(); }}><input aria-label="Nome nuova board" placeholder="Nuova board…" value={newTitle} onChange={event => setNewTitle(event.target.value)} /><button type="submit" disabled={!newTitle.trim()}>+</button></form>
      <nav>{boards.map(board => <button key={board.path} className={session?.snapshot.path === board.path ? 'active' : ''} onClick={() => void openBoard(board.path)}><span>{board.title}</span>{recoveries.some(item => item.draft.boardPath === board.path) && <small>Recovery</small>}</button>)}{!boards.length && <p>Nessuna board. Creane una per preparare una scena.</p>}</nav>
    </aside>
    <section className="board-main">
      {!session ? <div className="board-empty"><span>◇</span><h1>Prepara una scena</h1><p>Le board restano nella cartella della campagna e funzionano offline.</p></div> : <>
        <header className="board-header">
          <div>{renaming ? <form onSubmit={event => { event.preventDefault(); void renameBoard(); }}><input autoFocus value={renameTitle} onChange={event => setRenameTitle(event.target.value)} onBlur={() => setRenaming(false)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setRenaming(false); } }} /></form> : <button className="board-title-button" onClick={() => { setRenameTitle(session.snapshot.title); setRenaming(true); }}><strong>{session.snapshot.title}</strong><small>{session.snapshot.path}</small></button>}</div>
          <div className="board-header-actions"><span className={`board-save-state ${session.state}`}>{saveLabel}</span><button disabled={session.state === 'clean' || session.state === 'saving' || session.state === 'conflict'} onClick={() => void save()}>Salva <kbd>Ctrl S</kbd></button></div>
        </header>
        {message && <div className="board-notice" role="alert">{message}<button onClick={() => setMessage(undefined)}>Chiudi</button></div>}
        {session.recovery && <div className="board-notice"><strong>È disponibile una recovery locale.</strong><div><button onClick={restoreRecovery}>Ripristina recovery</button><button onClick={() => void discardRecovery()}>Scarta recovery</button></div></div>}
        {session.state === 'conflict' && <div className="board-notice" role="alert"><strong>La board è cambiata anche sul disco.</strong><p>{session.error}</p><div><button onClick={() => void reloadDisk()}>Usa versione su disco</button><button onClick={() => void overwriteAfterConflict()}>Usa la mia versione</button></div></div>}
        {session.state === 'error' && <div className="board-notice" role="alert">{session.error}</div>}
        <div className="board-toolbar" role="toolbar" aria-label="Strumenti board">
          <div className="board-tools">{(['select', 'hand', 'text', 'image'] as Tool[]).map(item => <button key={item} aria-pressed={tool === item} onClick={() => { setTool(item); if (item === 'image') input.current?.click(); }}>{({ select: 'Seleziona', hand: 'Mano', text: 'Testo', image: 'Immagine' })[item]}</button>)}</div>
          <div className="board-tools"><button onClick={() => undo()} disabled={!history.current.past.length}>↶</button><button onClick={() => undo(true)} disabled={!history.current.future.length}>↷</button>{currentElement && <><button onClick={() => changeElement(currentElement.elementId, element => ({ ...element, locked: !element.locked }))}>{currentElement.locked ? 'Sblocca' : 'Blocca'}</button><button onClick={() => zOrder('back')}>Sfondo</button><button onClick={() => zOrder('backward')}>Indietro</button><button onClick={() => zOrder('forward')}>Avanti</button><button onClick={() => zOrder('front')}>Primo piano</button><button disabled={currentElement.locked} onClick={deleteSelected}>Elimina</button></>}</div>
          <span className="board-zoom">{Math.round(session.snapshot.document.camera.zoom * 100)}%</span>
        </div>
        <input ref={input} hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ''; }} />
        <div ref={viewport} className={`board-viewport tool-${tool}`} onPointerDown={viewportPointerDown} onWheel={zoom}
          onDragOver={event => { if ([...event.dataTransfer.items].some(item => item.kind === 'file')) event.preventDefault(); }}
          onDrop={event => { const file = event.dataTransfer.files?.[0]; if (!file) return; event.preventDefault(); void importFile(file, worldPoint(event.clientX, event.clientY)); }}>
          <div className="board-stage" style={{ transform: `translate(${session.snapshot.document.camera.x}px, ${session.snapshot.document.camera.y}px) scale(${session.snapshot.document.camera.zoom})` }}>
            {session.snapshot.document.elements.slice().sort(byZ).map(element => <div key={element.elementId}
              className={`board-element ${selected === element.elementId ? 'selected' : ''} ${element.locked ? 'locked' : ''} board-${element.type}`}
              style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.z }}
              onPointerDown={event => beginMove(event, element)} onClick={event => { event.stopPropagation(); setSelected(element.elementId); }}>
              {element.type === 'text' ? textEditing?.elementId === element.elementId ? <textarea className="board-text-editor" autoFocus value={textEditing.text} onPointerDown={event => event.stopPropagation()} onChange={event => setTextEditing({ elementId: element.elementId, text: event.target.value })} onBlur={commitTextEdit} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTextEditing(undefined); } if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} /> : <div className="board-text-content" onDoubleClick={event => { event.stopPropagation(); if (!element.locked) setTextEditing({ elementId: element.elementId, text: element.text }); }}>{element.text}</div> : <BoardImage element={element} command={command} />}
              {selected === element.elementId && !element.locked && <button className="board-resize" aria-label="Ridimensiona elemento" onPointerDown={event => beginResize(event, element)} />}
              {element.locked && <span className="board-lock-badge">Bloccato</span>}
            </div>)}
            {textDraft && <textarea className="board-text-draft" autoFocus style={{ left: textDraft.x, top: textDraft.y }} placeholder="Scrivi…" value={textDraft.text} onChange={event => setTextDraft({ ...textDraft, text: event.target.value })} onBlur={commitTextDraft} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTextDraft(undefined); setTool('select'); } if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />}
          </div>
        </div>
      </>}
    </section>
  </div>;
}
