import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { BoardConnectionEndpoint, BoardConnector, BoardDocument, BoardElement, BoardImageElement, BoardRecoveryDraft, BoardSnapshot, BoardTextElement, BoardTokenElement } from '../application/board-types';
import { connectorsWithoutElements, contentBounds, endpointPoint, expandGroupedSelection, marqueeSelection, reorderElements, type BoardOrderDirection, type BoardRect } from '../application/board-operations';

type Tool = 'select' | 'hand' | 'text' | 'image' | 'token' | 'link';
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
const tokenInitials = (name: string) => name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '•';

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

function BoardAsset({ assetPath, command, alt = '' }: { assetPath: string; command: Command; alt?: string }) {
  const [src, setSrc] = useState<string>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    setMissing(false); setSrc(undefined);
    void command({ action: 'board:asset', assetPath }).then(reply => {
      if (!alive) return;
      if (!reply.ok) { setMissing(true); return; }
      setSrc((reply.data as { dataUrl: string }).dataUrl);
    }).catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; };
  }, [command, assetPath]);
  return missing
    ? <div className="board-missing-asset"><strong>Immagine mancante</strong><small>{assetPath}</small></div>
    : src ? <img draggable={false} src={src} alt={alt} /> : <div className="board-image-loading">Caricamento…</div>;
}

export function BoardWorkspace({ command }: { command: Command }) {
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [recoveries, setRecoveries] = useState<RecoveryItem[]>([]);
  const [session, setSession] = useState<BoardSession>();
  const sessionRef = useRef(session); sessionRef.current = session;
  const [tool, setTool] = useState<Tool>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedConnector, setSelectedConnector] = useState<string>();
  const [newTitle, setNewTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [message, setMessage] = useState<string>();
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; text: string }>();
  const [textEditing, setTextEditing] = useState<{ elementId: string; text: string }>();
  const [tokenEditing, setTokenEditing] = useState<{ elementId: string; name: string }>();
  const [connectionStart, setConnectionStart] = useState<BoardConnectionEndpoint>();
  const [linkStyle, setLinkStyle] = useState<'line' | 'arrow'>('arrow');
  const [marquee, setMarquee] = useState<BoardRect>();
  const renameCancelled = useRef(false);
  const history = useRef<{ past: BoardDocument[]; future: BoardDocument[] }>({ past: [], future: [] });
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
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
    setSelectedIds([]); setSelectedConnector(undefined); setConnectionStart(undefined); setTextDraft(undefined); setTextEditing(undefined); setTokenEditing(undefined); setMessage(undefined);
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

  const changeConnector = (connectorId: string, updater: (connector: BoardConnector) => BoardConnector) => {
    const current = sessionRef.current; if (!current) return;
    applyDocument({ ...current.snapshot.document, connectors: current.snapshot.document.connectors.map(connector => connector.connectorId === connectorId ? updater(connector) : connector) });
  };

  const selectionForElement = (element: BoardElement): string[] =>
    element.groupId
      ? sessionRef.current?.snapshot.document.elements.filter(candidate => candidate.groupId === element.groupId).map(candidate => candidate.elementId) ?? [element.elementId]
      : [element.elementId];

  const selectElement = (element: BoardElement, additive: boolean) => {
    const targets = selectionForElement(element);
    if (!additive) {
      setSelectedIds(targets); setSelectedConnector(undefined);
      return targets;
    }
    const next = new Set(selectedIds);
    const remove = targets.every(id => next.has(id));
    for (const id of targets) remove ? next.delete(id) : next.add(id);
    const expanded = expandGroupedSelection(sessionRef.current?.snapshot.document.elements ?? [], next);
    setSelectedIds(expanded); setSelectedConnector(undefined);
    return expanded;
  };

  const deleteSelected = () => {
    const current = sessionRef.current; if (!current) return;
    if (selectedConnector) {
      const connector = current.snapshot.document.connectors.find(item => item.connectorId === selectedConnector);
      if (!connector || connector.locked) return;
      applyDocument({ ...current.snapshot.document, connectors: current.snapshot.document.connectors.filter(item => item.connectorId !== selectedConnector) });
      setSelectedConnector(undefined); return;
    }
    if (!selectedIds.length) return;
    const chosen = current.snapshot.document.elements.filter(element => selectedIds.includes(element.elementId));
    if (chosen.some(element => element.locked)) { setMessage('Sblocca la selezione prima di eliminarla.'); return; }
    applyDocument({
      ...current.snapshot.document,
      elements: current.snapshot.document.elements.filter(element => !selectedIds.includes(element.elementId)),
      connectors: connectorsWithoutElements(current.snapshot.document, selectedIds)
    });
    setSelectedIds([]);
  };

  const duplicateSelected = () => {
    const current = sessionRef.current; if (!current || !selectedIds.length) return;
    const chosen = current.snapshot.document.elements.filter(element => selectedIds.includes(element.elementId));
    if (!chosen.length) return;
    const idMap = new Map<string, string>();
    const groupMap = new Map<string, string>();
    for (const element of chosen) {
      idMap.set(element.elementId, crypto.randomUUID());
      if (element.groupId && !groupMap.has(element.groupId)) groupMap.set(element.groupId, crypto.randomUUID());
    }
    const copies = chosen.map(element => ({
      ...element,
      elementId: idMap.get(element.elementId)!,
      x: element.x + 24,
      y: element.y + 24,
      z: nextZ(current.snapshot.document) + chosen.indexOf(element),
      ...(element.groupId ? { groupId: groupMap.get(element.groupId)! } : {})
    } as BoardElement));
    const connectors = current.snapshot.document.connectors.flatMap(connector => {
      if (connector.from.kind !== 'element' || connector.to.kind !== 'element') return [];
      const from = idMap.get(connector.from.elementId), to = idMap.get(connector.to.elementId);
      if (!from || !to) return [];
      return [{ ...connector, connectorId: crypto.randomUUID(), from: { kind: 'element' as const, elementId: from }, to: { kind: 'element' as const, elementId: to } }];
    });
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, ...copies], connectors: [...current.snapshot.document.connectors, ...connectors] });
    setSelectedIds(copies.map(element => element.elementId)); setSelectedConnector(undefined);
  };

  const groupSelected = () => {
    const current = sessionRef.current; if (!current || selectedIds.length < 2) return;
    const groupId = crypto.randomUUID();
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => selectedIds.includes(element.elementId) ? { ...element, groupId } : element) });
  };

  const ungroupSelected = () => {
    const current = sessionRef.current; if (!current || !selectedIds.length) return;
    const groupIds = new Set(current.snapshot.document.elements.filter(element => selectedIds.includes(element.elementId) && element.groupId).map(element => element.groupId!));
    if (!groupIds.size) return;
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => element.groupId && groupIds.has(element.groupId) ? { ...element, groupId: undefined } : element) });
  };

  const toggleLock = () => {
    const current = sessionRef.current; if (!current) return;
    if (selectedConnector) {
      changeConnector(selectedConnector, connector => ({ ...connector, locked: !connector.locked }));
      return;
    }
    if (!selectedIds.length) return;
    const chosen = current.snapshot.document.elements.filter(element => selectedIds.includes(element.elementId));
    const lock = chosen.some(element => !element.locked);
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => selectedIds.includes(element.elementId) ? { ...element, locked: lock } : element) });
  };

  const zOrder = (direction: BoardOrderDirection) => {
    const current = sessionRef.current; if (!current || !selectedIds.length) return;
    applyDocument({ ...current.snapshot.document, elements: reorderElements(current.snapshot.document.elements, selectedIds, direction) });
  };

  const chooseConnectionEndpoint = (endpoint: BoardConnectionEndpoint) => {
    const current = sessionRef.current; if (!current) return;
    if (!connectionStart) {
      setConnectionStart(endpoint); setSelectedIds([]); setSelectedConnector(undefined); return;
    }
    if (connectionStart.kind === 'element' && endpoint.kind === 'element' && connectionStart.elementId === endpoint.elementId) {
      setConnectionStart(undefined); return;
    }
    const connector: BoardConnector = { connectorId: crypto.randomUUID(), style: linkStyle, from: connectionStart, to: endpoint, locked: false };
    applyDocument({ ...current.snapshot.document, connectors: [...current.snapshot.document.connectors, connector] });
    setConnectionStart(undefined); setSelectedIds([]); setSelectedConnector(connector.connectorId);
  };

  const beginMove = (event: ReactPointerEvent, element: BoardElement) => {
    if (tool === 'link') {
      event.stopPropagation(); chooseConnectionEndpoint({ kind: 'element', elementId: element.elementId }); return;
    }
    if (tool !== 'select') { event.stopPropagation(); return; }
    event.stopPropagation();
    if (event.shiftKey) { selectElement(element, true); return; }
    const current = sessionRef.current; if (!current) return;
    const activeIds = selectedIds.includes(element.elementId) ? expandGroupedSelection(current.snapshot.document.elements, selectedIds) : selectionForElement(element);
    setSelectedIds(activeIds); setSelectedConnector(undefined);
    if (element.locked || event.button !== 0) return;
    const before = clone(current.snapshot.document);
    const start = { x: event.clientX, y: event.clientY };
    const zoom = current.snapshot.document.camera.zoom;
    const bases = new Map(current.snapshot.document.elements.filter(item => activeIds.includes(item.elementId) && !item.locked).map(item => [item.elementId, { x: item.x, y: item.y }]));
    let moved = false;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const now = sessionRef.current; if (!now) return;
      const dx = (pointer.clientX - start.x) / zoom, dy = (pointer.clientY - start.y) / zoom;
      if (!dx && !dy) return;
      moved = true;
      const elements = now.snapshot.document.elements.map(item => {
        const base = bases.get(item.elementId);
        return base ? { ...item, x: base.x + dx, y: base.y + dy } : item;
      });
      const next = { ...now, snapshot: { ...now.snapshot, document: { ...now.snapshot.document, elements } }, state: 'dirty' as const };
      setSession(next); sessionRef.current = next;
    };
    const up = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      const now = sessionRef.current; if (!now || !moved) return;
      history.current.past.push(before); history.current.past = history.current.past.slice(-80); history.current.future = []; scheduleSave(now);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };

  const beginResize = (event: ReactPointerEvent, element: BoardElement) => {
    event.stopPropagation();
    if (element.locked || selectedIds.length !== 1) return;
    const current = sessionRef.current; if (!current) return;
    const before = clone(current.snapshot.document);
    const start = { x: event.clientX, y: event.clientY };
    const ratio = element.width / element.height;
    const zoom = current.snapshot.document.camera.zoom;
    let resized = false;
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - start.x) / zoom;
      const width = Math.max(element.type === 'token' ? 48 : 60, element.width + dx);
      const height = element.type === 'image' ? width / ratio : element.type === 'token' ? width : Math.max(48, element.height + (pointer.clientY - start.y) / zoom);
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
      history.current.past.push(before); history.current.past = history.current.past.slice(-80); history.current.future = []; scheduleSave(now);
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

  const commitTokenEdit = () => {
    const edit = tokenEditing;
    if (!edit) return;
    setTokenEditing(undefined);
    const existing = sessionRef.current?.snapshot.document.elements.find(element => element.elementId === edit.elementId);
    if (!existing || existing.type !== 'token' || existing.name === edit.name) return;
    changeElement(edit.elementId, element => element.type === 'token' ? { ...element, name: edit.name } : element);
  };

  const importAsset = async (file: File): Promise<{ assetPath: string; size: { width: number; height: number } } | undefined> => {
    if (!/image\/(png|jpeg|webp)/u.test(file.type) && !/\.(png|jpe?g|webp)$/iu.test(file.name)) { setMessage('Usa un’immagine PNG, JPG/JPEG o WebP.'); return undefined; }
    if (file.size > 20 * 1024 * 1024) { setMessage('L’immagine supera il limite di 20 MB.'); return undefined; }
    let buffer: ArrayBuffer;
    let size: { width: number; height: number };
    try { [buffer, size] = await Promise.all([file.arrayBuffer(), imageSize(file)]); }
    catch { setMessage('L’immagine non è leggibile.'); return undefined; }
    const reply = await command({ action: 'board:importImage', name: file.name, base64: bytesToBase64(new Uint8Array(buffer)) });
    if (!reply.ok) { setMessage(reply.error?.message); return undefined; }
    return { assetPath: (reply.data as { assetPath: string }).assetPath, size };
  };

  const importFile = async (file: File, world?: { x: number; y: number }) => {
    const imported = await importAsset(file); if (!imported) return;
    const current = sessionRef.current; if (!current) return;
    const element: BoardImageElement = {
      type: 'image', elementId: crypto.randomUUID(), assetPath: imported.assetPath,
      x: world?.x ?? 160, y: world?.y ?? 140, width: imported.size.width, height: imported.size.height,
      z: nextZ(current.snapshot.document), locked: false
    };
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, element] });
    setSelectedIds([element.elementId]); setSelectedConnector(undefined); setTool('select');
  };

  const importTokenAvatar = async (file: File) => {
    const current = sessionRef.current;
    if (!current || selectedIds.length !== 1) return;
    const token = current.snapshot.document.elements.find(element => element.elementId === selectedIds[0]);
    if (!token || token.type !== 'token') return;
    const imported = await importAsset(file); if (!imported) return;
    changeElement(token.elementId, element => element.type === 'token' ? { ...element, avatarPath: imported.assetPath } : element);
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
    const point = worldPoint(event.clientX, event.clientY);

    if (tool === 'text' && event.button === 0) {
      setTextDraft({ ...point, text: '' }); setSelectedIds([]); setSelectedConnector(undefined); return;
    }
    if (tool === 'token' && event.button === 0) {
      const element: BoardTokenElement = {
        type: 'token',
        elementId: crypto.randomUUID(),
        name: 'Token',
        x: point.x - 48,
        y: point.y - 48,
        width: 96,
        height: 96,
        z: nextZ(current.snapshot.document),
        locked: false,
        visibleByDefault: false
      };
      applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, element] });
      setSelectedIds([element.elementId]); setSelectedConnector(undefined); setTool('select');
      return;
    }
    if (tool === 'link' && event.button === 0) {
      chooseConnectionEndpoint({ kind: 'point', x: point.x, y: point.y }); return;
    }

    if (tool === 'select' && event.button === 0) {
      event.preventDefault();
      const camera = current.snapshot.document.camera;
      const target = event.currentTarget;
      const bounds = target.getBoundingClientRect();
      const startPoint = point;
      const existing = event.shiftKey ? selectedIds : [];
      let moved = false;
      target.setPointerCapture(event.pointerId);
      const toWorld = (clientX: number, clientY: number) => ({
        x: (clientX - bounds.left - camera.x) / camera.zoom,
        y: (clientY - bounds.top - camera.y) / camera.zoom
      });
      const move = (pointer: PointerEvent) => {
        const next = toWorld(pointer.clientX, pointer.clientY);
        const x = Math.min(startPoint.x, next.x), y = Math.min(startPoint.y, next.y);
        const width = Math.abs(next.x - startPoint.x), height = Math.abs(next.y - startPoint.y);
        moved = width > 3 / camera.zoom || height > 3 / camera.zoom;
        setMarquee(moved ? { x, y, width, height } : undefined);
      };
      const up = (pointer: PointerEvent) => {
        target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
        setMarquee(undefined); setSelectedConnector(undefined);
        if (!moved) {
          if (!event.shiftKey) setSelectedIds([]);
          return;
        }
        const next = toWorld(pointer.clientX, pointer.clientY);
        const rect = { x: Math.min(startPoint.x, next.x), y: Math.min(startPoint.y, next.y), width: Math.abs(next.x - startPoint.x), height: Math.abs(next.y - startPoint.y) };
        const hits = marqueeSelection(sessionRef.current?.snapshot.document.elements ?? [], rect);
        setSelectedIds(expandGroupedSelection(sessionRef.current?.snapshot.document.elements ?? [], [...existing, ...hits]));
      };
      target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
      return;
    }

    if (tool !== 'hand' && event.button !== 1) return;
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
    setSelectedIds([element.elementId]); setSelectedConnector(undefined); setTool('select');
  };

  const centerContent = () => {
    const current = sessionRef.current;
    const node = viewport.current;
    if (!current || !node) return;
    const bounds = contentBounds(current.snapshot.document);
    if (!bounds) {
      applyDocument({ ...current.snapshot.document, camera: { x: 0, y: 0, zoom: 1 } }, false);
      return;
    }
    const padding = 80;
    const zoom = clamp(Math.min(node.clientWidth / (bounds.width + padding * 2), node.clientHeight / (bounds.height + padding * 2)), 0.2, 4);
    const camera = {
      x: node.clientWidth / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: node.clientHeight / 2 - (bounds.y + bounds.height / 2) * zoom,
      zoom
    };
    applyDocument({ ...current.snapshot.document, camera }, false);
  };

  const moveSelectionBy = (dx: number, dy: number) => {
    const current = sessionRef.current; if (!current || !selectedIds.length) return;
    const movable = new Set(current.snapshot.document.elements.filter(element => selectedIds.includes(element.elementId) && !element.locked).map(element => element.elementId));
    if (!movable.size) return;
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => movable.has(element.elementId) ? { ...element, x: element.x + dx, y: element.y + dy } : element) });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!sessionRef.current) return;
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
      if (editing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); undo(true); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? ungroupSelected() : groupSelected(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); return; }
      if (event.key === 'Escape') {
        setSelectedIds([]); setSelectedConnector(undefined); setConnectionStart(undefined); setMarquee(undefined); setTextDraft(undefined); setTextEditing(undefined); setTokenEditing(undefined); setTool('select'); return;
      }
      const step = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelectionBy(-step, 0); }
      if (event.key === 'ArrowRight') { event.preventDefault(); moveSelectionBy(step, 0); }
      if (event.key === 'ArrowUp') { event.preventDefault(); moveSelectionBy(0, -step); }
      if (event.key === 'ArrowDown') { event.preventDefault(); moveSelectionBy(0, step); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });

  const currentElement = session && selectedIds.length === 1 ? session.snapshot.document.elements.find(element => element.elementId === selectedIds[0]) : undefined;
  const currentConnector = session && selectedConnector ? session.snapshot.document.connectors.find(connector => connector.connectorId === selectedConnector) : undefined;
  const pendingConnectionPoint = session && connectionStart ? endpointPoint(session.snapshot.document, connectionStart) : undefined;
  const selectionLocked = session ? session.snapshot.document.elements.filter(element => selectedIds.includes(element.elementId)).some(element => element.locked) : false;
  const groupedSelection = session ? session.snapshot.document.elements.filter(element => selectedIds.includes(element.elementId)).some(element => !!element.groupId) : false;
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
          <div>{renaming ? <form onSubmit={event => { event.preventDefault(); renameCancelled.current = true; void renameBoard(); }}><input autoFocus value={renameTitle} onChange={event => setRenameTitle(event.target.value)} onBlur={() => { if (!renameCancelled.current) { renameCancelled.current = true; void renameBoard(); } }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); renameCancelled.current = true; setRenaming(false); } }} /></form> : <button className="board-title-button" onClick={() => { renameCancelled.current = false; setRenameTitle(session.snapshot.title); setRenaming(true); }}><strong>{session.snapshot.title}</strong><small>{session.snapshot.path}</small></button>}</div>
          <div className="board-header-actions"><span className={`board-save-state ${session.state}`}>{saveLabel}</span><button disabled={session.state === 'clean' || session.state === 'saving' || session.state === 'conflict'} onClick={() => void save()}>Salva <kbd>Ctrl S</kbd></button></div>
        </header>
        {message && <div className="board-notice" role="alert">{message}<button onClick={() => setMessage(undefined)}>Chiudi</button></div>}
        {session.recovery && <div className="board-notice"><strong>È disponibile una recovery locale.</strong><div><button onClick={restoreRecovery}>Ripristina recovery</button><button onClick={() => void discardRecovery()}>Scarta recovery</button></div></div>}
        {session.state === 'conflict' && <div className="board-notice" role="alert"><strong>La board è cambiata anche sul disco.</strong><p>{session.error}</p><div><button onClick={() => void reloadDisk()}>Usa versione su disco</button><button onClick={() => void overwriteAfterConflict()}>Usa la mia versione</button></div></div>}
        {session.state === 'error' && <div className="board-notice" role="alert">{session.error}</div>}
        <div className="board-toolbar" role="toolbar" aria-label="Strumenti board">
          <div className="board-tools">{(['select', 'hand', 'text', 'image', 'token', 'link'] as Tool[]).map(item => <button key={item} aria-pressed={tool === item} onClick={() => { setTool(item); setConnectionStart(undefined); if (item === 'image') input.current?.click(); }}>{({ select: 'Seleziona', hand: 'Mano', text: 'Testo', image: 'Immagine', token: 'Token', link: 'Collegamento' })[item]}</button>)}</div>
          {tool === 'link' && <div className="board-tools"><button aria-pressed={linkStyle === 'line'} onClick={() => setLinkStyle('line')}>Linea</button><button aria-pressed={linkStyle === 'arrow'} onClick={() => setLinkStyle('arrow')}>Freccia</button>{connectionStart && <span className="board-tool-hint">Scegli destinazione</span>}</div>}
          <div className="board-tools">
            <button title="Annulla" onClick={() => undo()} disabled={!history.current.past.length}>↶</button>
            <button title="Ripeti" onClick={() => undo(true)} disabled={!history.current.future.length}>↷</button>
            <button onClick={centerContent}>Centra contenuto</button>
            {(selectedIds.length > 0 || currentConnector) && <>
              <button onClick={toggleLock}>{currentConnector ? currentConnector.locked ? 'Sblocca' : 'Blocca' : selectionLocked ? 'Sblocca' : 'Blocca'}</button>
              {!currentConnector && <><button onClick={duplicateSelected}>Duplica</button><button onClick={groupSelected} disabled={selectedIds.length < 2}>Raggruppa</button><button onClick={ungroupSelected} disabled={!groupedSelection}>Separa</button><button onClick={() => zOrder('back')}>Sfondo</button><button onClick={() => zOrder('backward')}>Indietro</button><button onClick={() => zOrder('forward')}>Avanti</button><button onClick={() => zOrder('front')}>Primo piano</button></>}
              {currentConnector && <><button aria-pressed={currentConnector.style === 'line'} onClick={() => changeConnector(currentConnector.connectorId, connector => ({ ...connector, style: 'line' }))}>Linea</button><button aria-pressed={currentConnector.style === 'arrow'} onClick={() => changeConnector(currentConnector.connectorId, connector => ({ ...connector, style: 'arrow' }))}>Freccia</button></>}
              <button disabled={currentConnector ? currentConnector.locked : selectionLocked} onClick={deleteSelected}>Elimina</button>
            </>}
            {currentElement?.type === 'token' && <><button onClick={() => avatarInput.current?.click()}>Avatar</button>{currentElement.avatarPath && <button onClick={() => changeElement(currentElement.elementId, element => element.type === 'token' ? { ...element, avatarPath: undefined } : element)}>Rimuovi avatar</button>}</>}
          </div>
          <span className="board-zoom">{Math.round(session.snapshot.document.camera.zoom * 100)}%</span>
        </div>
        <input ref={input} hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ''; }} />
        <input ref={avatarInput} hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void importTokenAvatar(file); event.currentTarget.value = ''; }} />
        <div ref={viewport} className={`board-viewport tool-${tool}`} onPointerDown={viewportPointerDown} onWheel={zoom}
          onDragOver={event => { if ([...event.dataTransfer.items].some(item => item.kind === 'file')) event.preventDefault(); }}
          onDrop={event => { const file = event.dataTransfer.files?.[0]; if (!file) return; event.preventDefault(); void importFile(file, worldPoint(event.clientX, event.clientY)); }}>
          <div className="board-stage" style={{ transform: `translate(${session.snapshot.document.camera.x}px, ${session.snapshot.document.camera.y}px) scale(${session.snapshot.document.camera.zoom})` }}>
            <svg className="board-connectors" aria-label="Collegamenti board">
              <defs><marker id="board-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
              {session.snapshot.document.connectors.map(connector => {
                const from = endpointPoint(session.snapshot.document, connector.from);
                const to = endpointPoint(session.snapshot.document, connector.to);
                if (!from || !to) return null;
                return <line key={connector.connectorId} className={`board-connector ${selectedConnector === connector.connectorId ? 'selected' : ''} ${connector.locked ? 'locked' : ''}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={connector.style === 'arrow' ? 'url(#board-arrow)' : undefined} onPointerDown={event => { event.stopPropagation(); if (tool === 'select') { setSelectedConnector(connector.connectorId); setSelectedIds([]); } }} />;
              })}
            </svg>
            {pendingConnectionPoint && <span className="board-link-start" style={{ left: pendingConnectionPoint.x, top: pendingConnectionPoint.y }} />}
            {session.snapshot.document.elements.slice().sort(byZ).map(element => <div key={element.elementId}
              className={`board-element ${selectedIds.includes(element.elementId) ? 'selected' : ''} ${element.locked ? 'locked' : ''} board-${element.type}`}
              style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.z }}
              onPointerDown={event => beginMove(event, element)} onClick={event => event.stopPropagation()}>
              {element.type === 'text'
                ? textEditing?.elementId === element.elementId
                  ? <textarea className="board-text-editor" autoFocus value={textEditing.text} onPointerDown={event => event.stopPropagation()} onChange={event => setTextEditing({ elementId: element.elementId, text: event.target.value })} onBlur={commitTextEdit} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTextEditing(undefined); } if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
                  : <div className="board-text-content" onDoubleClick={event => { event.stopPropagation(); if (!element.locked) { setSelectedIds(selectionForElement(element)); setTextEditing({ elementId: element.elementId, text: element.text }); } }}>{element.text}</div>
                : element.type === 'image'
                  ? <BoardAsset assetPath={element.assetPath} command={command} />
                  : <div className="board-token-content" onDoubleClick={event => { event.stopPropagation(); if (!element.locked) { setSelectedIds(selectionForElement(element)); setTokenEditing({ elementId: element.elementId, name: element.name }); } }}>
                      <div className="board-token-avatar">{element.avatarPath ? <BoardAsset assetPath={element.avatarPath} command={command} alt={element.name} /> : <span>{tokenInitials(element.name)}</span>}</div>
                      {tokenEditing?.elementId === element.elementId
                        ? <input className="board-token-name-editor" autoFocus value={tokenEditing.name} onPointerDown={event => event.stopPropagation()} onChange={event => setTokenEditing({ elementId: element.elementId, name: event.target.value })} onBlur={commitTokenEdit} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTokenEditing(undefined); } if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
                        : <span className="board-token-name">{element.name || 'Token'}</span>}
                    </div>}
              {selectedIds.length === 1 && selectedIds[0] === element.elementId && !element.locked && <button className="board-resize" aria-label="Ridimensiona elemento" onPointerDown={event => beginResize(event, element)} />}
              {element.locked && <span className="board-lock-badge">Bloccato</span>}
              {element.groupId && selectedIds.includes(element.elementId) && <span className="board-group-badge">Gruppo</span>}
            </div>)}
            {marquee && <div className="board-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
            {textDraft && <textarea className="board-text-draft" autoFocus style={{ left: textDraft.x, top: textDraft.y }} placeholder="Scrivi…" value={textDraft.text} onChange={event => setTextDraft({ ...textDraft, text: event.target.value })} onBlur={commitTextDraft} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTextDraft(undefined); setTool('select'); } if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />}
          </div>
        </div>
      </>}
    </section>
  </div>;
}
