import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from 'react';
import {
  isBoardBoxElement,
  type BoardBoxElement,
  type BoardCardElement,
  type BoardDocument,
  type BoardElement,
  type BoardImageElement,
  type BoardLinkElement,
  type BoardLinkEndpoint,
  type BoardRecoveryDraft,
  type BoardSnapshot,
  type BoardTextElement,
  type BoardTokenElement
} from '../application/board-types';

type Tool = 'select' | 'hand' | 'text' | 'image' | 'token' | 'link';
type CommandReply = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
type Command = (input: Record<string, unknown>) => Promise<CommandReply>;
type BoardListItem = { path: string; title: string; boardId: string };
type RecoveryItem = { key: string; draft: BoardRecoveryDraft };
type BoardSession = { snapshot: BoardSnapshot; state: 'clean' | 'dirty' | 'saving' | 'error' | 'conflict'; error?: string; recovery?: RecoveryItem };
type BoardListReply = { boards: BoardListItem[]; recoveries: RecoveryItem[] };
type BoardOpenReply = { snapshot: BoardSnapshot; recovery?: RecoveryItem };
type BoardCreateReply = BoardListReply & { snapshot: BoardSnapshot };
type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };

const clone = (document: BoardDocument): BoardDocument => structuredClone(document);
const byZ = (a: BoardElement, b: BoardElement) => a.z - b.z;
const nextZ = (document: BoardDocument) => Math.max(0, ...document.elements.map(element => element.z)) + 1;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const unique = <T,>(values: T[]) => [...new Set(values)];

function endpointPoint(document: BoardDocument, endpoint: BoardLinkEndpoint): Point {
  if (endpoint.kind === 'point') return { x: endpoint.x, y: endpoint.y };
  const target = document.elements.find(element => element.elementId === endpoint.elementId);
  if (!target || !isBoardBoxElement(target)) return { x: 0, y: 0 };
  return { x: target.x + target.width / 2, y: target.y + target.height / 2 };
}

function elementBounds(document: BoardDocument, element: BoardElement): Bounds {
  if (isBoardBoxElement(element)) return { left: element.x, top: element.y, right: element.x + element.width, bottom: element.y + element.height };
  const from = endpointPoint(document, element.from);
  const to = endpointPoint(document, element.to);
  return {
    left: Math.min(from.x, to.x) - 8,
    top: Math.min(from.y, to.y) - 8,
    right: Math.max(from.x, to.x) + 8,
    bottom: Math.max(from.y, to.y) + 8
  };
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function expandGroups(document: BoardDocument, ids: string[]): string[] {
  const groups = new Set(document.elements.filter(element => ids.includes(element.elementId) && element.groupId).map(element => element.groupId!));
  return unique([
    ...ids,
    ...document.elements.filter(element => element.groupId && groups.has(element.groupId)).map(element => element.elementId)
  ]);
}

function moveElement(element: BoardElement, selected: Set<string>, dx: number, dy: number): BoardElement {
  if (!selected.has(element.elementId) || element.locked) return element;
  if (isBoardBoxElement(element)) return { ...element, x: element.x + dx, y: element.y + dy };
  const moveEndpoint = (endpoint: BoardLinkEndpoint): BoardLinkEndpoint =>
    endpoint.kind === 'point' ? { ...endpoint, x: endpoint.x + dx, y: endpoint.y + dy } : endpoint;
  return { ...element, from: moveEndpoint(element.from), to: moveEndpoint(element.to) };
}

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

function useAsset(command: Command, assetPath?: string) {
  const [src, setSrc] = useState<string>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc(undefined); setMissing(false);
    if (!assetPath) return () => { alive = false; };
    void command({ action: 'board:asset', assetPath }).then(reply => {
      if (!alive) return;
      if (!reply.ok) { setMissing(true); return; }
      setSrc((reply.data as { dataUrl: string }).dataUrl);
    }).catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; };
  }, [command, assetPath]);
  return { src, missing };
}

function BoardImage({ element, command }: { element: BoardImageElement; command: Command }) {
  const asset = useAsset(command, element.assetPath);
  return asset.missing
    ? <div className="board-missing-asset"><strong>Immagine mancante</strong><small>{element.assetPath}</small></div>
    : asset.src ? <img draggable={false} src={asset.src} alt="" /> : <div className="board-image-loading">Caricamento…</div>;
}

function BoardToken({ element, command }: { element: BoardTokenElement; command: Command }) {
  const asset = useAsset(command, element.assetPath);
  const initials = element.name.trim().split(/\s+/u).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '•';
  return <div className="board-token-content">
    <div className="board-token-avatar">{asset.src ? <img draggable={false} src={asset.src} alt="" /> : <span title={asset.missing ? 'Avatar mancante' : undefined}>{initials}</span>}</div>
    <span className="board-token-name">{element.name}</span>
  </div>;
}

function BoardCard({ element, missing, onOpen }: { element: BoardCardElement; missing: boolean; onOpen: () => void }) {
  return <div className="board-card-content">
    <div className="board-card-kicker">{element.cardKind === 'excerpt' ? 'Estratto' : 'Nota collegata'}</div>
    <strong>{element.sourceTitle}</strong>
    {element.cardKind === 'excerpt' ? <p>{element.excerpt}</p> : <p className="board-card-path">{element.sourceNoteId}</p>}
    <footer>{missing ? <span className="board-card-warning">Sorgente mancante</span> : <button onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onOpen(); }}>Apri nota</button>}</footer>
  </div>;
}

function BoardLinkVisual({
  element,
  document,
  selected,
  selectable,
  onPointerDown
}: {
  element: BoardLinkElement;
  document: BoardDocument;
  selected: boolean;
  selectable: boolean;
  onPointerDown: (event: ReactPointerEvent<SVGLineElement>) => void;
}) {
  const from = endpointPoint(document, element.from);
  const to = endpointPoint(document, element.to);
  const markerId = `board-arrow-${element.elementId}`;
  return <svg className={`board-link-layer ${selected ? 'selected' : ''} ${element.locked ? 'locked' : ''}`} style={{ zIndex: element.z }} aria-hidden="true">
    <defs><marker id={markerId} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L9,4.5 L0,9 z" /></marker></defs>
    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={element.arrow === 'end' ? `url(#${markerId})` : undefined}
      className="board-link-line" style={{ pointerEvents: selectable ? 'stroke' : 'none' }} onPointerDown={onPointerDown} />
  </svg>;
}

export function BoardWorkspace({ command, noteIds }: { command: Command; noteIds: string[] }) {
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [recoveries, setRecoveries] = useState<RecoveryItem[]>([]);
  const [session, setSession] = useState<BoardSession>();
  const sessionRef = useRef(session); sessionRef.current = session;
  const [tool, setTool] = useState<Tool>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedRef = useRef(selectedIds); selectedRef.current = selectedIds;
  const [newTitle, setNewTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [message, setMessage] = useState<string>();
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; text: string }>();
  const [textEditing, setTextEditing] = useState<{ elementId: string; text: string }>();
  const [tokenDraft, setTokenDraft] = useState<{ x: number; y: number; name: string }>();
  const [tokenEditing, setTokenEditing] = useState<{ elementId: string; name: string }>();
  const [linkStart, setLinkStart] = useState<BoardLinkEndpoint>();
  const [marquee, setMarquee] = useState<{ start: Point; end: Point }>();
  const history = useRef<{ past: BoardDocument[]; future: BoardDocument[] }>({ past: [], future: [] });
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const imageInput = useRef<HTMLInputElement>(null);
  const tokenAvatarInput = useRef<HTMLInputElement>(null);
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
    if (!reply.ok) {
      const latest = sessionRef.current;
      if (!latest) return;
      const failed: BoardSession = { ...latest, state: 'error', error: `Recovery non riuscita: ${reply.error?.message ?? 'errore sconosciuto'}` };
      setSession(failed); sessionRef.current = failed;
    }
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

  const setSelection = useCallback((ids: string[]) => {
    const next = unique(ids);
    setSelectedIds(next); selectedRef.current = next;
  }, []);

  const selectElement = useCallback((elementId: string, additive = false) => {
    const document = sessionRef.current?.snapshot.document; if (!document) return;
    const groupSelection = expandGroups(document, [elementId]);
    if (!additive) { setSelection(groupSelection); return; }
    const existing = new Set(selectedRef.current);
    const allSelected = groupSelection.every(id => existing.has(id));
    for (const id of groupSelection) { if (allSelected) existing.delete(id); else existing.add(id); }
    setSelection([...existing]);
  }, [setSelection]);

  const openBoard = useCallback(async (boardPath: string, force = false) => {
    const current = sessionRef.current;
    if (current?.snapshot.path === boardPath && !force) return;
    if (current && current.snapshot.path !== boardPath && current.state !== 'clean') {
      const saved = await save(current);
      if (!saved || saved.state !== 'clean') return;
    }
    const reply = await command({ action: 'board:open', path: boardPath });
    if (!reply.ok) { setMessage(reply.error?.message); return; }
    const data = reply.data as BoardOpenReply;
    setSession({ snapshot: data.snapshot, state: 'clean', recovery: data.recovery });
    setSelection([]); setTextDraft(undefined); setTextEditing(undefined); setTokenDraft(undefined); setTokenEditing(undefined); setLinkStart(undefined); setMessage(undefined);
    history.current = { past: [], future: [] };
  }, [command, save, setSelection]);

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
    setSession({ snapshot: data.snapshot, state: 'clean' }); setSelection([]); history.current = { past: [], future: [] };
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
    if (!reply.ok) {
      const failed: BoardSession = { ...current, state: 'conflict', error: reply.error?.message };
      setSession(failed); sessionRef.current = failed; return;
    }
    const clean: BoardSession = { snapshot: (reply.data as { snapshot: BoardSnapshot }).snapshot, state: 'clean' };
    setSession(clean); sessionRef.current = clean; void refreshList();
  };

  const undo = useCallback((redo = false) => {
    const current = sessionRef.current; if (!current) return;
    const from = redo ? history.current.future : history.current.past;
    const to = redo ? history.current.past : history.current.future;
    const document = from.pop(); if (!document) return;
    to.push(clone(current.snapshot.document));
    if (to.length > 80) to.shift();
    applyDocument(clone(document), false);
  }, [applyDocument]);

  const selectedElements = () => {
    const document = sessionRef.current?.snapshot.document;
    return document ? document.elements.filter(element => selectedRef.current.includes(element.elementId)) : [];
  };

  const changeElement = (elementId: string, updater: (element: BoardElement) => BoardElement, remember = true) => {
    const current = sessionRef.current; if (!current) return;
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => element.elementId === elementId ? updater(element) : element) }, remember);
  };

  const toggleLock = useCallback(() => {
    const current = sessionRef.current; if (!current || !selectedRef.current.length) return;
    const selected = new Set(selectedRef.current);
    const allLocked = current.snapshot.document.elements.filter(element => selected.has(element.elementId)).every(element => element.locked);
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => selected.has(element.elementId) ? { ...element, locked: !allLocked } : element) });
  }, [applyDocument]);

  const toggleVisibility = useCallback(() => {
    const current = sessionRef.current; if (!current || !selectedRef.current.length) return;
    const selected = new Set(selectedRef.current);
    const allVisible = current.snapshot.document.elements.filter(element => selected.has(element.elementId)).every(element => element.visibleByDefault === true);
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => selected.has(element.elementId) ? { ...element, visibleByDefault: !allVisible } : element) });
  }, [applyDocument]);

  const groupSelection = useCallback((ungroup = false) => {
    const current = sessionRef.current; if (!current || selectedRef.current.length < (ungroup ? 1 : 2)) return;
    const selected = new Set(selectedRef.current);
    const groupId = ungroup ? undefined : crypto.randomUUID();
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => selected.has(element.elementId) ? { ...element, groupId } : element) });
  }, [applyDocument]);

  const duplicateSelection = useCallback(() => {
    const current = sessionRef.current; if (!current || !selectedRef.current.length) return;
    const selected = new Set(expandGroups(current.snapshot.document, selectedRef.current));
    const originals = current.snapshot.document.elements.filter(element => selected.has(element.elementId));
    if (!originals.length) return;
    const idMap = new Map(originals.map(element => [element.elementId, crypto.randomUUID()]));
    const groupMap = new Map<string, string>();
    for (const element of originals) if (element.groupId && !groupMap.has(element.groupId)) groupMap.set(element.groupId, crypto.randomUUID());
    let z = nextZ(current.snapshot.document);
    const copies = originals.map((element): BoardElement => {
      const base = { ...element, elementId: idMap.get(element.elementId)!, z: z++, groupId: element.groupId ? groupMap.get(element.groupId) : undefined, visibleByDefault: false };
      if (isBoardBoxElement(base)) return { ...base, x: base.x + 24, y: base.y + 24 };
      const endpoint = (value: BoardLinkEndpoint): BoardLinkEndpoint => value.kind === 'point'
        ? { ...value, x: value.x + 24, y: value.y + 24 }
        : { ...value, elementId: idMap.get(value.elementId) ?? value.elementId };
      return { ...base, from: endpoint(base.from), to: endpoint(base.to) };
    });
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, ...copies] });
    setSelection(copies.map(element => element.elementId));
  }, [applyDocument, setSelection]);

  const deleteSelection = useCallback(() => {
    const current = sessionRef.current; if (!current || !selectedRef.current.length) return;
    const selected = new Set(selectedRef.current);
    const deletable = new Set(current.snapshot.document.elements.filter(element => selected.has(element.elementId) && !element.locked).map(element => element.elementId));
    if (!deletable.size) return;
    const points = new Map<string, Point>();
    for (const element of current.snapshot.document.elements) if (deletable.has(element.elementId) && isBoardBoxElement(element)) points.set(element.elementId, { x: element.x + element.width / 2, y: element.y + element.height / 2 });
    const fixEndpoint = (endpoint: BoardLinkEndpoint): BoardLinkEndpoint =>
      endpoint.kind === 'element' && deletable.has(endpoint.elementId)
        ? { kind: 'point', ...(points.get(endpoint.elementId) ?? { x: 0, y: 0 }) }
        : endpoint;
    const elements = current.snapshot.document.elements
      .filter(element => !deletable.has(element.elementId))
      .map(element => element.type === 'link' ? { ...element, from: fixEndpoint(element.from), to: fixEndpoint(element.to) } : element);
    applyDocument({ ...current.snapshot.document, elements });
    setSelection(selectedRef.current.filter(id => !deletable.has(id)));
  }, [applyDocument, setSelection]);

  const zOrder = useCallback((direction: 'front' | 'back' | 'forward' | 'backward') => {
    const current = sessionRef.current; if (!current || !selectedRef.current.length) return;
    const selected = new Set(selectedRef.current);
    const ordered = [...current.snapshot.document.elements].sort(byZ);
    if (direction === 'front' || direction === 'back') {
      const chosen = ordered.filter(element => selected.has(element.elementId));
      const others = ordered.filter(element => !selected.has(element.elementId));
      ordered.splice(0, ordered.length, ...(direction === 'front' ? [...others, ...chosen] : [...chosen, ...others]));
    } else if (direction === 'forward') {
      for (let index = ordered.length - 2; index >= 0; index--) if (selected.has(ordered[index].elementId) && !selected.has(ordered[index + 1].elementId)) [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
    } else {
      for (let index = 1; index < ordered.length; index++) if (selected.has(ordered[index].elementId) && !selected.has(ordered[index - 1].elementId)) [ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]];
    }
    const order = new Map(ordered.map((element, index) => [element.elementId, index + 1]));
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => ({ ...element, z: order.get(element.elementId)! })) });
  }, [applyDocument]);

  const beginMove = (event: ReactPointerEvent<Element>, elementId: string) => {
    if (tool === 'hand') return;
    if (tool !== 'select') { event.stopPropagation(); return; }
    event.stopPropagation();
    const current = sessionRef.current; if (!current) return;
    const clicked = current.snapshot.document.elements.find(element => element.elementId === elementId); if (!clicked) return;
    if (!selectedRef.current.includes(elementId)) selectElement(elementId, event.shiftKey);
    const ids = new Set(selectedRef.current.includes(elementId) ? selectedRef.current : expandGroups(current.snapshot.document, [elementId]));
    if (clicked.locked || event.shiftKey) return;
    const before = clone(current.snapshot.document);
    const start = { x: event.clientX, y: event.clientY };
    const zoom = current.snapshot.document.camera.zoom;
    let moved = false;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move: EventListener = nativeEvent => {
      const pointer = nativeEvent as PointerEvent;
      const dx = (pointer.clientX - start.x) / zoom;
      const dy = (pointer.clientY - start.y) / zoom;
      if (!dx && !dy) return;
      moved = true;
      const now = sessionRef.current; if (!now) return;
      const elements = before.elements.map(element => moveElement(element, ids, dx, dy));
      const next: BoardSession = { ...now, snapshot: { ...now.snapshot, document: { ...now.snapshot.document, elements } }, state: 'dirty' };
      setSession(next); sessionRef.current = next;
    };
    const up: EventListener = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      const now = sessionRef.current; if (!now || !moved) return;
      history.current.past.push(before); history.current.past = history.current.past.slice(-80); history.current.future = []; scheduleSave(now);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };

  const beginResize = (event: ReactPointerEvent, element: BoardBoxElement) => {
    event.stopPropagation();
    if (element.locked || selectedRef.current.length !== 1) return;
    const current = sessionRef.current; if (!current) return;
    const before = clone(current.snapshot.document);
    const start = { x: event.clientX, y: event.clientY };
    const ratio = element.width / element.height;
    const zoom = current.snapshot.document.camera.zoom;
    let resized = false;
    const target = event.currentTarget; target.setPointerCapture(event.pointerId);
    const move: EventListener = nativeEvent => {
      const pointer = nativeEvent as PointerEvent;
      const dx = (pointer.clientX - start.x) / zoom;
      const width = Math.max(element.type === 'token' ? 52 : 60, element.width + dx);
      const height = element.type === 'image' ? width / ratio : element.type === 'token' ? width : Math.max(48, element.height + (pointer.clientY - start.y) / zoom);
      if (width === element.width && height === element.height) return;
      resized = true;
      const now = sessionRef.current; if (!now) return;
      const elements = now.snapshot.document.elements.map(item => item.elementId === element.elementId && isBoardBoxElement(item) ? { ...item, width, height } : item);
      const next: BoardSession = { ...now, snapshot: { ...now.snapshot, document: { ...now.snapshot.document, elements } }, state: 'dirty' };
      setSession(next); sessionRef.current = next;
    };
    const up: EventListener = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      const now = sessionRef.current; if (!now || !resized) return;
      history.current.past.push(before); history.current.past = history.current.past.slice(-80); history.current.future = []; scheduleSave(now);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };

  const commitTextEdit = () => {
    const edit = textEditing; if (!edit) return;
    setTextEditing(undefined);
    if (!edit.text.trim()) return;
    const existing = sessionRef.current?.snapshot.document.elements.find(element => element.elementId === edit.elementId);
    if (!existing || existing.type !== 'text' || existing.text === edit.text.trim()) return;
    changeElement(edit.elementId, element => element.type === 'text' ? { ...element, text: edit.text.trim() } : element);
  };

  const commitTokenEdit = () => {
    const edit = tokenEditing; if (!edit) return;
    setTokenEditing(undefined);
    if (!edit.name.trim()) return;
    const existing = sessionRef.current?.snapshot.document.elements.find(element => element.elementId === edit.elementId);
    if (!existing || existing.type !== 'token' || existing.name === edit.name.trim()) return;
    changeElement(edit.elementId, element => element.type === 'token' ? { ...element, name: edit.name.trim() } : element);
  };

  const addNoteCard = (noteId: string, world?: Point) => {
    const current = sessionRef.current;
    if (!current || !noteIds.includes(noteId)) return;
    const element: BoardCardElement = {
      type: 'card',
      cardKind: 'note',
      elementId: crypto.randomUUID(),
      sourceNoteId: noteId,
      sourceTitle: noteId.split('/').at(-1)!.replace(/\.md$/iu, ''),
      x: world?.x ?? 140,
      y: world?.y ?? 120,
      width: 280,
      height: 120,
      z: nextZ(current.snapshot.document),
      locked: false,
      visibleByDefault: false
    };
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, element] });
    setSelection([element.elementId]); setTool('select');
  };

  const importImageElement = async (file: File, world?: Point) => {
    if (!/image\/(png|jpeg|webp)/u.test(file.type) && !/\.(png|jpe?g|webp)$/iu.test(file.name)) { setMessage('Usa un’immagine PNG, JPG/JPEG o WebP.'); return; }
    if (file.size > 20 * 1024 * 1024) { setMessage('L’immagine supera il limite di 20 MB.'); return; }
    let buffer: ArrayBuffer; let size: { width: number; height: number };
    try { [buffer, size] = await Promise.all([file.arrayBuffer(), imageSize(file)]); }
    catch { setMessage('L’immagine non è leggibile.'); return; }
    const reply = await command({ action: 'board:importImage', name: file.name, base64: bytesToBase64(new Uint8Array(buffer)) });
    if (!reply.ok) { setMessage(reply.error?.message); return; }
    const current = sessionRef.current; if (!current) return;
    const element: BoardImageElement = {
      type: 'image', elementId: crypto.randomUUID(), assetPath: (reply.data as { assetPath: string }).assetPath,
      x: world?.x ?? 160, y: world?.y ?? 140, width: size.width, height: size.height,
      z: nextZ(current.snapshot.document), locked: false, visibleByDefault: false
    };
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, element] });
    setSelection([element.elementId]); setTool('select');
  };

  const importTokenAvatar = async (file: File) => {
    const tokenId = selectedRef.current.length === 1 ? selectedRef.current[0] : undefined;
    const token = sessionRef.current?.snapshot.document.elements.find(element => element.elementId === tokenId);
    if (!token || token.type !== 'token') return;
    if (!/image\/(png|jpeg|webp)/u.test(file.type) && !/\.(png|jpe?g|webp)$/iu.test(file.name)) { setMessage('Usa un’immagine PNG, JPG/JPEG o WebP.'); return; }
    if (file.size > 20 * 1024 * 1024) { setMessage('L’immagine supera il limite di 20 MB.'); return; }
    const reply = await command({ action: 'board:importImage', name: file.name, base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())) });
    if (!reply.ok) { setMessage(reply.error?.message); return; }
    changeElement(token.elementId, element => element.type === 'token' ? { ...element, assetPath: (reply.data as { assetPath: string }).assetPath } : element);
  };

  const worldPoint = (clientX: number, clientY: number): Point => {
    const current = sessionRef.current;
    const rect = viewport.current?.getBoundingClientRect();
    if (!current || !rect) return { x: 0, y: 0 };
    const camera = current.snapshot.document.camera;
    return { x: (clientX - rect.left - camera.x) / camera.zoom, y: (clientY - rect.top - camera.y) / camera.zoom };
  };

  const linkEndpoint = (endpoint: BoardLinkEndpoint) => {
    const current = sessionRef.current; if (!current) return;
    if (!linkStart) { setLinkStart(endpoint); setMessage('Scegli la seconda estremità del collegamento. Esc per annullare.'); return; }
    if (linkStart.kind === 'element' && endpoint.kind === 'element' && linkStart.elementId === endpoint.elementId) { setMessage('Scegli due estremità diverse.'); return; }
    const element: BoardLinkElement = {
      type: 'link', elementId: crypto.randomUUID(), from: linkStart, to: endpoint, arrow: 'end',
      z: nextZ(current.snapshot.document), locked: false, visibleByDefault: false
    };
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, element] });
    setLinkStart(undefined); setMessage(undefined); setSelection([element.elementId]); setTool('select');
  };

  const commitTextDraft = () => {
    const current = sessionRef.current; const draft = textDraft;
    if (!current || !draft) return;
    setTextDraft(undefined);
    if (!draft.text.trim()) { setTool('select'); return; }
    const element: BoardTextElement = { type: 'text', elementId: crypto.randomUUID(), text: draft.text.trim(), x: draft.x, y: draft.y, width: 260, height: 120, z: nextZ(current.snapshot.document), locked: false, visibleByDefault: false };
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, element] });
    setSelection([element.elementId]); setTool('select');
  };

  const commitTokenDraft = () => {
    const current = sessionRef.current; const draft = tokenDraft;
    if (!current || !draft) return;
    setTokenDraft(undefined);
    if (!draft.name.trim()) { setTool('select'); return; }
    const element: BoardTokenElement = { type: 'token', elementId: crypto.randomUUID(), name: draft.name.trim(), x: draft.x, y: draft.y, width: 84, height: 84, z: nextZ(current.snapshot.document), locked: false, visibleByDefault: false };
    applyDocument({ ...current.snapshot.document, elements: [...current.snapshot.document.elements, element] });
    setSelection([element.elementId]); setTool('select');
  };

  const centerContent = useCallback(() => {
    const current = sessionRef.current; const rect = viewport.current?.getBoundingClientRect();
    if (!current || !rect) return;
    const document = current.snapshot.document;
    if (!document.elements.length) {
      applyDocument({ ...document, camera: { x: 0, y: 0, zoom: 1 } });
      return;
    }
    const bounds = document.elements.map(element => elementBounds(document, element));
    const left = Math.min(...bounds.map(value => value.left)); const top = Math.min(...bounds.map(value => value.top));
    const right = Math.max(...bounds.map(value => value.right)); const bottom = Math.max(...bounds.map(value => value.bottom));
    const width = Math.max(1, right - left); const height = Math.max(1, bottom - top);
    const zoom = clamp(Math.min((rect.width - 100) / width, (rect.height - 100) / height), 0.2, 2);
    const centerX = (left + right) / 2; const centerY = (top + bottom) / 2;
    applyDocument({ ...document, camera: { x: rect.width / 2 - centerX * zoom, y: rect.height / 2 - centerY * zoom, zoom } });
  }, [applyDocument]);

  const nudgeSelection = useCallback((dx: number, dy: number) => {
    const current = sessionRef.current; if (!current || !selectedRef.current.length) return;
    const ids = new Set(selectedRef.current);
    applyDocument({ ...current.snapshot.document, elements: current.snapshot.document.elements.map(element => moveElement(element, ids, dx, dy)) });
  }, [applyDocument]);

  const viewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = sessionRef.current; if (!current) return;
    const point = worldPoint(event.clientX, event.clientY);
    if (tool === 'text') { setTextDraft({ ...point, text: '' }); setSelection([]); return; }
    if (tool === 'token') { setTokenDraft({ ...point, name: '' }); setSelection([]); return; }
    if (tool === 'link') { linkEndpoint({ kind: 'point', ...point }); return; }
    if (tool === 'select' && event.button === 0) {
      const start = point; setMarquee({ start, end: start });
      if (!event.shiftKey) setSelection([]);
      const target = event.currentTarget; target.setPointerCapture(event.pointerId);
      const move = (pointer: PointerEvent) => setMarquee({ start, end: worldPoint(pointer.clientX, pointer.clientY) });
      const up = (pointer: PointerEvent) => {
        target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
        const end = worldPoint(pointer.clientX, pointer.clientY);
        const area: Bounds = { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), right: Math.max(start.x, end.x), bottom: Math.max(start.y, end.y) };
        setMarquee(undefined);
        if (Math.abs(end.x - start.x) < 3 && Math.abs(end.y - start.y) < 3) return;
        const hit = expandGroups(current.snapshot.document, current.snapshot.document.elements.filter(element => intersects(area, elementBounds(current.snapshot.document, element))).map(element => element.elementId));
        setSelection(event.shiftKey ? unique([...selectedRef.current, ...hit]) : hit);
      };
      target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
      return;
    }
    if (tool !== 'hand' && event.button !== 1) { setSelection([]); return; }
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, cameraX: current.snapshot.document.camera.x, cameraY: current.snapshot.document.camera.y };
    const target = event.currentTarget; target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const now = sessionRef.current; if (!now) return;
      const document = { ...now.snapshot.document, camera: { ...now.snapshot.document.camera, x: start.cameraX + pointer.clientX - start.x, y: start.cameraY + pointer.clientY - start.y } };
      const next: BoardSession = { ...now, snapshot: { ...now.snapshot, document }, state: 'dirty' };
      setSession(next); sessionRef.current = next;
    };
    const up = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      const now = sessionRef.current; if (now) scheduleSave(now);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };

  const zoom = (event: ReactWheelEvent<HTMLDivElement>) => {
    const current = sessionRef.current; if (!current) return;
    event.preventDefault();
    const camera = current.snapshot.document.camera;
    const nextZoom = clamp(camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.2, 4);
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    const px = event.clientX - rect.left; const py = event.clientY - rect.top;
    const worldX = (px - camera.x) / camera.zoom; const worldY = (py - camera.y) / camera.zoom;
    const document = { ...current.snapshot.document, camera: { x: px - worldX * nextZoom, y: py - worldY * nextZoom, zoom: nextZoom } };
    const next: BoardSession = { ...current, snapshot: { ...current.snapshot, document }, state: 'dirty' };
    setSession(next); sessionRef.current = next; scheduleSave(next);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!sessionRef.current) return;
      const textTarget = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
      if (textTarget) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); undo(true); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelection(sessionRef.current.snapshot.document.elements.map(element => element.elementId)); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); groupSelection(event.shiftKey); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selectedRef.current.length) {
        event.preventDefault(); const amount = event.shiftKey ? 10 : 1;
        nudgeSelection(event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0, event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0);
        return;
      }
      if (event.key === 'Escape') {
        setSelection([]); setTextDraft(undefined); setTextEditing(undefined); setTokenDraft(undefined); setTokenEditing(undefined); setLinkStart(undefined); setMarquee(undefined); setMessage(undefined); setTool('select');
      }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [deleteSelection, duplicateSelection, groupSelection, nudgeSelection, save, setSelection, undo]);

  const current = session?.snapshot.document;
  const primaryId = selectedIds.at(-1);
  const currentElement = current?.elements.find(element => element.elementId === primaryId);
  const selection = selectedElements();
  const sameGroup = selection.length > 0 && !!selection[0].groupId && selection.every(element => element.groupId === selection[0].groupId);
  const allLocked = selection.length > 0 && selection.every(element => element.locked);
  const allVisible = selection.length > 0 && selection.every(element => element.visibleByDefault === true);
  const saveLabel = session?.state === 'clean' ? 'Salvata' : session?.state === 'saving' ? 'Salvataggio…' : session?.state === 'conflict' ? 'Conflitto' : session?.state === 'error' ? 'Errore' : 'Da salvare';
  const toolLabels: Record<Tool, string> = { select: 'Seleziona', hand: 'Mano', text: 'Testo', image: 'Immagine', token: 'Token', link: 'Collegamento' };

  return <div className="boards-workspace">
    <aside className="boards-list">
      <div className="boards-list-heading"><div><span className="eyebrow">V0.2</span><h2>Board</h2></div><button title="Aggiorna elenco" onClick={() => void refreshList()}>↻</button></div>
      <form className="board-new" onSubmit={event => { event.preventDefault(); void createBoard(); }}><input aria-label="Nome nuova board" placeholder="Nuova board…" value={newTitle} onChange={event => setNewTitle(event.target.value)} /><button type="submit" disabled={!newTitle.trim()}>+</button></form>
      <nav>{boards.map(board => <button key={board.boardId} className={session?.snapshot.path === board.path ? 'active' : ''} onClick={() => void openBoard(board.path)}><span>{board.title}</span>{recoveries.some(item => item.draft.boardPath === board.path) && <small>Recovery</small>}</button>)}{!boards.length && <p>Nessuna board. Creane una per preparare una scena.</p>}</nav>
    </aside>
    <section className="board-main">
      {!session ? <div className="board-empty"><span>◇</span><h1>Prepara una scena</h1><p>Le board restano nella cartella della campagna e funzionano offline.</p></div> : <>
        <header className="board-header">
          <div>{renaming ? <form onSubmit={event => { event.preventDefault(); void renameBoard(); }}><input autoFocus value={renameTitle} onChange={event => setRenameTitle(event.target.value)} onBlur={() => void renameBoard()} onKeyDown={event => { if (event.key === 'Escape') setRenaming(false); }} /></form> : <button className="board-title-button" onClick={() => { setRenameTitle(session.snapshot.title); setRenaming(true); }}><strong>{session.snapshot.title}</strong><small>{session.snapshot.path}</small></button>}</div>
          <div className="board-header-actions"><span className={`board-save-state ${session.state}`}>{saveLabel}</span><button disabled={session.state === 'clean' || session.state === 'saving' || session.state === 'conflict'} onClick={() => void save()}>Salva <kbd>Ctrl S</kbd></button></div>
        </header>
        {message && <div className="board-notice" role="status"><span>{message}</span>{!linkStart && <button onClick={() => setMessage(undefined)}>Chiudi</button>}</div>}
        {session.recovery && <div className="board-notice"><strong>È disponibile una recovery locale.</strong><div><button onClick={restoreRecovery}>Ripristina recovery</button><button onClick={() => void discardRecovery()}>Scarta recovery</button></div></div>}
        {session.state === 'conflict' && <div className="board-notice" role="alert"><strong>La board è cambiata anche sul disco.</strong><p>{session.error}</p><div><button onClick={() => void reloadDisk()}>Usa versione su disco</button><button onClick={() => void overwriteAfterConflict()}>Usa la mia versione</button></div></div>}
        {session.state === 'error' && <div className="board-notice" role="alert">{session.error}</div>}
        <div className="board-toolbar" role="toolbar" aria-label="Strumenti board">
          <div className="board-tools">{(Object.keys(toolLabels) as Tool[]).map(item => <button key={item} aria-pressed={tool === item} onClick={() => { setTool(item); setLinkStart(undefined); if (item !== 'link') setMessage(undefined); if (item === 'image') imageInput.current?.click(); }}>{toolLabels[item]}</button>)}</div>
          <div className="board-tools">
            <button onClick={() => undo()} disabled={!history.current.past.length} title="Annulla (Ctrl+Z)">↶</button>
            <button onClick={() => undo(true)} disabled={!history.current.future.length} title="Ripeti (Ctrl+Y)">↷</button>
            <button onClick={centerContent}>Centra contenuto</button>
            {selection.length > 0 && <>
              <button onClick={duplicateSelection} title="Duplica (Ctrl+D)">Duplica</button>
              <button onClick={() => groupSelection(sameGroup)} disabled={!sameGroup && selection.length < 2} title={sameGroup ? 'Separa gruppo (Ctrl+Shift+G)' : 'Raggruppa (Ctrl+G)'}>{sameGroup ? 'Separa' : 'Raggruppa'}</button>
              <button onClick={toggleLock}>{allLocked ? 'Sblocca' : 'Blocca'}</button>
              <button onClick={toggleVisibility}>{allVisible ? 'Rendi privato' : 'Visibile ai giocatori'}</button>
              <button onClick={() => zOrder('back')}>Sfondo</button><button onClick={() => zOrder('backward')}>Indietro</button><button onClick={() => zOrder('forward')}>Avanti</button><button onClick={() => zOrder('front')}>Primo piano</button>
              {currentElement?.type === 'token' && <button onClick={() => tokenAvatarInput.current?.click()}>Avatar…</button>}
              {currentElement?.type === 'link' && <button onClick={() => changeElement(currentElement.elementId, element => element.type === 'link' ? { ...element, arrow: element.arrow === 'end' ? 'none' : 'end' } : element)}>{currentElement.arrow === 'end' ? 'Togli freccia' : 'Aggiungi freccia'}</button>}
              <button disabled={selection.every(element => element.locked)} onClick={deleteSelection}>Elimina</button>
            </>}
          </div>
          <span className="board-zoom">{selectedIds.length > 1 ? `${selectedIds.length} selezionati · ` : ''}{Math.round(session.snapshot.document.camera.zoom * 100)}%</span>
        </div>
        <input ref={imageInput} hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void importImageElement(file); event.currentTarget.value = ''; }} />
        <input ref={tokenAvatarInput} hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void importTokenAvatar(file); event.currentTarget.value = ''; }} />
        <div ref={viewport} className={`board-viewport tool-${tool}`} onPointerDown={viewportPointerDown} onWheel={zoom}
          onDragOver={event => { if (event.dataTransfer.types.includes('application/x-campaign-note') || [...event.dataTransfer.items].some(item => item.kind === 'file')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
          onDrop={event => {
            const point = worldPoint(event.clientX, event.clientY);
            const noteId = event.dataTransfer.getData('application/x-campaign-note');
            if (noteId) { event.preventDefault(); addNoteCard(noteId, point); return; }
            const file = event.dataTransfer.files?.[0]; if (!file) return;
            event.preventDefault(); void importImageElement(file, point);
          }}>
          <div className="board-stage" style={{ transform: `translate(${session.snapshot.document.camera.x}px, ${session.snapshot.document.camera.y}px) scale(${session.snapshot.document.camera.zoom})` }}>
            {session.snapshot.document.elements.slice().sort(byZ).map(element => {
              if (element.type === 'link') return <BoardLinkVisual key={element.elementId} element={element} document={session.snapshot.document} selected={selectedIds.includes(element.elementId)} selectable={tool === 'select'}
                onPointerDown={event => { selectElement(element.elementId, event.shiftKey); beginMove(event, element.elementId); }} />;
              const selected = selectedIds.includes(element.elementId);
              return <div key={element.elementId}
                className={`board-element ${selected ? 'selected' : ''} ${element.locked ? 'locked' : ''} ${element.groupId ? 'grouped' : ''} board-${element.type}`}
                style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.z }}
                onPointerDown={event => {
                  if (tool === 'link') { event.stopPropagation(); linkEndpoint({ kind: 'element', elementId: element.elementId }); return; }
                  beginMove(event, element.elementId);
                }}
                onClick={event => { event.stopPropagation(); if (tool === 'select') selectElement(element.elementId, event.shiftKey); }}>
                {element.type === 'text'
                  ? textEditing?.elementId === element.elementId
                    ? <textarea className="board-text-editor" autoFocus value={textEditing.text} onPointerDown={event => event.stopPropagation()} onChange={event => setTextEditing({ elementId: element.elementId, text: event.target.value })} onBlur={commitTextEdit} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTextEditing(undefined); } if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
                    : <div className="board-text-content" onDoubleClick={event => { event.stopPropagation(); if (!element.locked) setTextEditing({ elementId: element.elementId, text: element.text }); }}>{element.text}</div>
                  : element.type === 'image'
                    ? <BoardImage element={element} command={command} />
                    : element.type === 'card'
                      ? <BoardCard element={element} missing={!noteIds.includes(element.sourceNoteId)} onOpen={() => void command({ action: 'note', noteId: element.sourceNoteId })} />
                      : tokenEditing?.elementId === element.elementId
                        ? <input className="board-token-editor" autoFocus value={tokenEditing.name} onPointerDown={event => event.stopPropagation()} onChange={event => setTokenEditing({ elementId: element.elementId, name: event.target.value })} onBlur={commitTokenEdit} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTokenEditing(undefined); } if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
                        : <div onDoubleClick={event => { event.stopPropagation(); if (!element.locked) setTokenEditing({ elementId: element.elementId, name: element.name }); }}><BoardToken element={element} command={command} /></div>}
                {selected && selectedIds.length === 1 && !element.locked && <button className="board-resize" aria-label="Ridimensiona elemento" onPointerDown={event => beginResize(event, element)} />}
                {element.locked && <span className="board-lock-badge">Bloccato</span>}
                {element.visibleByDefault === true && <span className="board-visible-badge">Pubblico</span>}
              </div>;
            })}
            {marquee && <div className="board-marquee" style={{ left: Math.min(marquee.start.x, marquee.end.x), top: Math.min(marquee.start.y, marquee.end.y), width: Math.abs(marquee.end.x - marquee.start.x), height: Math.abs(marquee.end.y - marquee.start.y) }} />}
            {textDraft && <textarea className="board-text-draft" autoFocus style={{ left: textDraft.x, top: textDraft.y }} placeholder="Scrivi…" value={textDraft.text} onChange={event => setTextDraft({ ...textDraft, text: event.target.value })} onBlur={commitTextDraft} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTextDraft(undefined); setTool('select'); } if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />}
            {tokenDraft && <input className="board-token-draft" autoFocus style={{ left: tokenDraft.x, top: tokenDraft.y }} placeholder="Nome token…" value={tokenDraft.name} onChange={event => setTokenDraft({ ...tokenDraft, name: event.target.value })} onBlur={commitTokenDraft} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTokenDraft(undefined); setTool('select'); } if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />}
          </div>
        </div>
      </>}
    </section>
  </div>;
}
