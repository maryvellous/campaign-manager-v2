import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  envelope,
  validateActivityBindingStatus,
  validateActivityPairingCode,
  validateCameraFocusPayload,
  validateEnvelope,
  validateLiveBoardElement,
  validateLiveBoardSnapshot,
  validatePingPayload,
  validateTokenMovePayload,
  type ActivityConfig,
  type ActivityJoinResponse,
  type ActivityResumeResponse,
  type JoinSessionResponse,
  type LiveApiError,
  type LiveBoardElement,
  type LiveBoardEndpoint,
  type LiveBoardSnapshot,
  type SessionLifecycle
} from '../../packages/protocol/src/index';
import { activityApiPath, discordActivityContext, readyDiscordActivity, type DiscordActivityContext, type ReadyDiscordActivity } from './discord-adapter';
import { discordAuthFailure, type DiscordAuthStage } from './discord-diagnostics';
import './style.css';

interface StoredResume {
  kind: 'standalone';
  liveSessionId: string;
  participantId: string;
  resumeCredential: string;
  displayName: string;
}

interface ActivityResume {
  kind: 'activity';
  liveSessionId: string;
  participantId: string;
  activityCredential: string;
  displayName: string;
  instanceId: string;
}

type PlayerResume = StoredResume | ActivityResume;
type ActivitySessionBootstrap = { resume: ActivityResume; ticket: string };

type Screen = 'join' | 'connecting' | 'waiting' | 'board' | 'ended';
type ApiFailure = LiveApiError['error'];
type Camera = { x: number; y: number; zoom: number };

const storageKey = 'cmv2-live-resume-v1';
const activityStoragePrefix = 'cmv2-discord-resume-v1:';

function storedActivityResume(instanceId: string): ActivityResume | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(activityStoragePrefix + instanceId) ?? 'null') as Partial<ActivityResume> | null;
    if (!value || value.kind !== 'activity' || value.instanceId !== instanceId || typeof value.liveSessionId !== 'string' || typeof value.participantId !== 'string' || typeof value.activityCredential !== 'string' || typeof value.displayName !== 'string') return undefined;
    return {
      kind: 'activity',
      instanceId,
      liveSessionId: value.liveSessionId,
      participantId: value.participantId,
      activityCredential: value.activityCredential,
      displayName: value.displayName
    };
  } catch { return undefined; }
}

function saveActivityResume(resume: ActivityResume | undefined): void {
  if (resume) localStorage.setItem(activityStoragePrefix + resume.instanceId, JSON.stringify(resume));
  else {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(activityStoragePrefix)) localStorage.removeItem(key);
    }
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function storedResume(): StoredResume | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<StoredResume> | null;
    if (!value || typeof value.liveSessionId !== 'string' || typeof value.participantId !== 'string' || typeof value.resumeCredential !== 'string' || typeof value.displayName !== 'string') return undefined;
    return { kind: 'standalone', liveSessionId: value.liveSessionId, participantId: value.participantId, resumeCredential: value.resumeCredential, displayName: value.displayName };
  } catch { return undefined; }
}

function formatJoinCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z2-9]/gu, '').slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

function playerApiPath(path: string): string {
  return discordActivityContext() ? activityApiPath(path, true) : path;
}

function websocketUrl(liveSessionId: string): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${playerApiPath(`/api/sessions/${encodeURIComponent(liveSessionId)}/ws`)}`;
}

function assetUrl(liveSessionId: string, publishedAssetId: string): string {
  return playerApiPath(`/api/sessions/${encodeURIComponent(liveSessionId)}/assets/${encodeURIComponent(publishedAssetId)}`);
}

function useAuthorizedAsset(liveSessionId: string, publishedAssetId: string | undefined, credential: string) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    setUrl(undefined); setFailed(false);
    if (!publishedAssetId) return () => { alive = false; };
    void fetch(assetUrl(liveSessionId, publishedAssetId), { headers: { authorization: `Bearer ${credential}` } }).then(async response => {
      if (!response.ok) throw new Error('asset unavailable');
      const blob = await response.blob();
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [credential, liveSessionId, publishedAssetId]);
  return { url, failed };
}

async function api<T>(path: string, body: unknown): Promise<{ ok: true; value: T } | { ok: false; error: ApiFailure }> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const value = await response.json() as T | LiveApiError;
    if (!response.ok) return { ok: false, error: (value as LiveApiError).error ?? { code: 'INTERNAL_ERROR', message: 'La sessione non è raggiungibile.' } };
    return { ok: true, value: value as T };
  } catch {
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'La sessione non è raggiungibile.' } };
  }
}

function validSnapshot(value: unknown): LiveBoardSnapshot | undefined {
  return validateLiveBoardSnapshot(value);
}

function endpointPoint(board: LiveBoardSnapshot, endpoint: LiveBoardEndpoint): { x: number; y: number } {
  if (endpoint.kind === 'point') return { x: endpoint.x, y: endpoint.y };
  const target = board.elements.find(element => element.elementId === endpoint.elementId);
  if (!target || target.type === 'link') return { x: 0, y: 0 };
  return { x: target.x + target.width / 2, y: target.y + target.height / 2 };
}

function BoardElementView({ element, sessionId, credential }: { element: Exclude<LiveBoardElement, { type: 'link' }>; sessionId: string; credential: string }) {
  const assetId = element.type === 'image' ? element.publishedAssetId : element.type === 'token' ? element.publishedAssetId : undefined;
  const asset = useAuthorizedAsset(sessionId, assetId, credential);
  if (element.type === 'text') return <div className="player-board-text">{element.text}</div>;
  if (element.type === 'image') return asset.url ? <img className="player-board-image" draggable={false} src={asset.url} alt="" /> : <div className="player-board-asset-state">{asset.failed ? 'Immagine non disponibile' : 'Caricamento…'}</div>;
  if (element.type === 'token') {
    const initials = element.name.trim().split(/\s+/u).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '•';
    return <div className="player-board-token">{asset.url ? <img draggable={false} src={asset.url} alt="" /> : <span title={asset.failed ? 'Avatar non disponibile' : undefined}>{initials}</span>}<small>{element.name}</small></div>;
  }
  return <div className="player-board-card"><span>{element.cardKind === 'excerpt' ? 'Estratto' : 'Nota'}</span><strong>{element.sourceTitle}</strong>{element.cardKind === 'excerpt' && <p>{element.excerpt}</p>}</div>;
}

function PlayerBoard({
  board,
  sessionId,
  credential,
  interactive,
  previewPositions,
  pings,
  focusNonce,
  onPreview,
  onCommit,
  onPing
}: {
  board: LiveBoardSnapshot;
  sessionId: string;
  credential: string;
  interactive: boolean;
  previewPositions: Record<string, { x: number; y: number }>;
  pings: Array<{ id: string; x: number; y: number }>;
  focusNonce: number;
  onPreview: (tokenId: string, x: number, y: number) => void;
  onCommit: (tokenId: string, x: number, y: number) => void;
  onPing: (x: number, y: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 40, y: 40, zoom: 1 });
  const [pingMode, setPingMode] = useState(false);

  const fit = useCallback(() => {
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    const boxes = board.elements.filter((element): element is Exclude<LiveBoardElement, { type: 'link' }> => element.type !== 'link');
    if (!boxes.length) { setCamera({ x: rect.width / 2, y: rect.height / 2, zoom: 1 }); return; }
    const left = Math.min(...boxes.map(element => element.x));
    const top = Math.min(...boxes.map(element => element.y));
    const right = Math.max(...boxes.map(element => element.x + element.width));
    const bottom = Math.max(...boxes.map(element => element.y + element.height));
    const width = Math.max(1, right - left); const height = Math.max(1, bottom - top);
    const zoom = clamp(Math.min((rect.width - 80) / width, (rect.height - 80) / height), 0.2, 2);
    setCamera({ x: rect.width / 2 - (left + width / 2) * zoom, y: rect.height / 2 - (top + height / 2) * zoom, zoom });
  }, [board]);

  useEffect(() => { requestAnimationFrame(fit); }, [board.boardId]);
  useEffect(() => { if (focusNonce > 0) requestAnimationFrame(fit); }, [focusNonce]);

  function pan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    if (pingMode && event.button === 0) {
      const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
      onPing((event.clientX - rect.left - camera.x) / camera.zoom, (event.clientY - rect.top - camera.y) / camera.zoom);
      setPingMode(false);
      return;
    }
    const target = event.currentTarget; target.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, camera };
    const move = (nativeEvent: PointerEvent) => setCamera({ ...start.camera, x: start.camera.x + nativeEvent.clientX - start.x, y: start.camera.y + nativeEvent.clientY - start.y });
    const up = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  }

  function zoom(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    const nextZoom = clamp(camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.2, 4);
    const px = event.clientX - rect.left; const py = event.clientY - rect.top;
    const worldX = (px - camera.x) / camera.zoom; const worldY = (py - camera.y) / camera.zoom;
    setCamera({ x: px - worldX * nextZoom, y: py - worldY * nextZoom, zoom: nextZoom });
  }

  function dragToken(event: ReactPointerEvent<HTMLDivElement>, element: Extract<LiveBoardElement, { type: 'token' }>) {
    if (!interactive || !board.controlledTokenIds?.includes(element.elementId) || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const shown = previewPositions[element.elementId] ?? { x: element.x, y: element.y };
    const start = { clientX: event.clientX, clientY: event.clientY, x: shown.x, y: shown.y };
    let lastPreview = 0;
    let latest = { x: shown.x, y: shown.y };
    const move = (nativeEvent: PointerEvent) => {
      latest = {
        x: start.x + (nativeEvent.clientX - start.clientX) / camera.zoom,
        y: start.y + (nativeEvent.clientY - start.clientY) / camera.zoom
      };
      const now = performance.now();
      if (now - lastPreview >= 35) {
        lastPreview = now;
        onPreview(element.elementId, latest.x, latest.y);
      }
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      onCommit(element.elementId, latest.x, latest.y);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  return <section className="player-board-shell">
    <header className="player-board-header"><div><span className="eyebrow">SCENA CONDIVISA</span><strong>{board.title}</strong></div><div><span className={`connection-dot ${interactive ? 'online' : ''}`} /><button className={pingMode ? 'active' : ''} disabled={!interactive} onClick={() => setPingMode(value => !value)}>{pingMode ? 'Clicca sulla scena' : 'Ping'}</button><button onClick={fit}>Centra</button><small>{Math.round(camera.zoom * 100)}%</small></div></header>
    <div ref={viewport} className="player-board-viewport" onPointerDown={pan} onWheel={zoom}>
      <div className="player-board-stage" style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})` }}>
        {board.elements.slice().sort((a, b) => a.z - b.z).map(element => {
          if (element.type === 'link') {
            const from = endpointPoint(board, element.from); const to = endpointPoint(board, element.to);
            const markerId = `activity-arrow-${element.elementId}`;
            return <svg key={element.elementId} className="player-link-layer" style={{ zIndex: element.z }} aria-hidden="true"><defs><marker id={markerId} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" /></marker></defs><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={element.arrow === 'end' ? `url(#${markerId})` : undefined} /></svg>;
          }
          const preview = previewPositions[element.elementId];
          const controlled = element.type === 'token' && !!board.controlledTokenIds?.includes(element.elementId);
          return <div key={element.elementId} className={`player-board-element type-${element.type} ${controlled ? 'controlled' : ''}`} style={{ left: preview?.x ?? element.x, top: preview?.y ?? element.y, width: element.width, height: element.height, zIndex: element.z }} onPointerDown={element.type === 'token' && controlled ? event => dragToken(event, element) : undefined}><BoardElementView element={element} sessionId={sessionId} credential={credential} /></div>;
        })}
        {pings.map(ping => <span key={ping.id} className="player-board-ping" style={{ left: ping.x, top: ping.y }} />)}
      </div>
    </div>
  </section>;
}

function App({ activitySession }: { activitySession?: ActivitySessionBootstrap } = {}) {
  const [screen, setScreen] = useState<Screen>('join');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const activityMode = !!activitySession;
  const [resume, setResume] = useState<PlayerResume>();
  const resumeRef = useRef<PlayerResume | undefined>(undefined);
  const [lifecycle, setLifecycle] = useState<SessionLifecycle>('open');
  const [error, setError] = useState<ApiFailure>();
  const [connected, setConnected] = useState(false);
  const [board, setBoard] = useState<LiveBoardSnapshot>();
  const boardRef = useRef<LiveBoardSnapshot | undefined>(undefined);
  const [previewPositions, setPreviewPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [pings, setPings] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const [focusNonce, setFocusNonce] = useState(0);
  const pendingRequests = useRef(new Set<string>());
  const seqRef = useRef(0);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryCount = useRef(0);
  const stopped = useRef(false);

  const setResumeState = useCallback((value: PlayerResume | undefined) => {
    resumeRef.current = value; setResume(value);
    if (activityMode) return;
    if (value?.kind === 'standalone') localStorage.setItem(storageKey, JSON.stringify(value));
    else if (!value) localStorage.removeItem(storageKey);
  }, [activityMode]);

  const requestSnapshot = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(envelope('snapshot.request', {})));
  }, []);

  const sendPreview = useCallback((type: string, payload: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(envelope(type, payload)));
  }, []);

  const sendMutation = useCallback((type: string, payload: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) { setError({ code: 'HOST_OFFLINE', message: 'Connessione non disponibile.' }); return; }
    const requestId = `req_${crypto.randomUUID()}`;
    pendingRequests.current.add(requestId);
    setError(undefined);
    socket.send(JSON.stringify(envelope(type, payload, requestId)));
  }, []);

  const showPing = useCallback((x: number, y: number) => {
    const id = crypto.randomUUID();
    setPings(current => [...current, { id, x, y }]);
    window.setTimeout(() => setPings(current => current.filter(ping => ping.id !== id)), 1600);
  }, []);

  const applySnapshot = useCallback((snapshot: LiveBoardSnapshot) => {
    boardRef.current = snapshot; setBoard(snapshot); setPreviewPositions({}); seqRef.current = snapshot.stateSeq; setScreen('board');
  }, []);

  const applyIncrement = useCallback((seq: number, mutate: (current: LiveBoardSnapshot) => LiveBoardSnapshot | undefined) => {
    if (!Number.isSafeInteger(seq) || seq <= seqRef.current) return;
    if (seq !== seqRef.current + 1 || !boardRef.current) { requestSnapshot(); return; }
    const next = mutate(boardRef.current);
    if (!next) { requestSnapshot(); return; }
    next.stateSeq = seq; boardRef.current = next; setBoard(next); seqRef.current = seq;
  }, [requestSnapshot]);

  const connect = useCallback((liveSessionId: string, ticket: string) => {
    const previous = socketRef.current;
    socketRef.current = undefined;
    previous?.close();
    const socket = new WebSocket(websocketUrl(liveSessionId), ['cmv2.v1', `cmv2.ticket.${ticket}`]);
    socketRef.current = socket;
    setScreen('connecting'); setConnected(false);

    socket.addEventListener('open', () => {
      retryCount.current = 0; setConnected(true); setError(undefined);
    });

    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string') return;
      let parsed: unknown;
      try { parsed = JSON.parse(event.data); } catch { return; }
      const message = validateEnvelope(parsed); if (!message) return;

      if (message.type === 'connection.ready' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { lifecycle?: SessionLifecycle; presentation?: string; stateSeq?: number };
        if (payload.lifecycle) setLifecycle(payload.lifecycle);
        if (payload.presentation === 'waiting') setScreen('waiting');
      } else if (message.type === 'board.snapshot') {
        const snapshot = validSnapshot(message.payload);
        if (snapshot) applySnapshot(snapshot); else requestSnapshot();
      } else if (message.type === 'presentation.waiting' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { stateSeq?: number; lifecycle?: SessionLifecycle };
        if (payload.lifecycle) setLifecycle(payload.lifecycle);
        if (typeof payload.stateSeq === 'number') seqRef.current = payload.stateSeq;
        boardRef.current = undefined; setBoard(undefined); setPreviewPositions({}); setPings([]); setScreen('waiting');
      } else if (message.type === 'element.revealed' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { boardId?: unknown; element?: unknown; stateSeq?: unknown };
        const element = validateLiveBoardElement(payload.element);
        if (typeof payload.boardId !== 'string' || !element || typeof payload.stateSeq !== 'number') { requestSnapshot(); return; }
        applyIncrement(payload.stateSeq, current => {
          if (current.boardId !== payload.boardId) return undefined;
          const elements = current.elements.filter(item => item.elementId !== element.elementId);
          return { ...current, elements: [...elements, element] };
        });
      } else if (message.type === 'element.hidden' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { boardId?: unknown; elementIds?: unknown; stateSeq?: unknown };
        if (typeof payload.boardId !== 'string' || !Array.isArray(payload.elementIds) || !payload.elementIds.every(value => typeof value === 'string') || typeof payload.stateSeq !== 'number') { requestSnapshot(); return; }
        const elementIds = payload.elementIds as string[];
        applyIncrement(payload.stateSeq, current => current.boardId === payload.boardId ? {
          ...current,
          elements: current.elements.filter(item => !elementIds.includes(item.elementId)),
          controlledTokenIds: (current.controlledTokenIds ?? []).filter(tokenId => !elementIds.includes(tokenId))
        } : undefined);
        setPreviewPositions(previews => Object.fromEntries(Object.entries(previews).filter(([tokenId]) => !elementIds.includes(tokenId))));
      } else if (message.type === 'token.move.preview') {
        const move = validateTokenMovePayload(message.payload);
        if (move && boardRef.current?.boardId === move.boardId) setPreviewPositions(current => ({ ...current, [move.tokenId]: { x: move.x, y: move.y } }));
      } else if (message.type === 'token.position' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { boardId?: unknown; tokenId?: unknown; x?: unknown; y?: unknown; stateSeq?: unknown };
        const move = validateTokenMovePayload(payload);
        if (!move || typeof payload.stateSeq !== 'number') { requestSnapshot(); return; }
        applyIncrement(payload.stateSeq, current => {
          if (current.boardId !== move.boardId) return undefined;
          const elements = current.elements.map(element => element.elementId === move.tokenId && element.type === 'token' ? { ...element, x: move.x, y: move.y } : element);
          setPreviewPositions(previews => { const next = { ...previews }; delete next[move.tokenId]; return next; });
          return { ...current, elements };
        });
      } else if (message.type === 'token.controller' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { boardId?: unknown; tokenId?: unknown; controlled?: unknown; stateSeq?: unknown };
        if (typeof payload.boardId !== 'string' || typeof payload.tokenId !== 'string' || typeof payload.controlled !== 'boolean' || typeof payload.stateSeq !== 'number') { requestSnapshot(); return; }
        applyIncrement(payload.stateSeq, current => {
          if (current.boardId !== payload.boardId) return undefined;
          const controlledTokenIds = new Set(current.controlledTokenIds ?? []);
          if (payload.controlled) controlledTokenIds.add(payload.tokenId as string); else controlledTokenIds.delete(payload.tokenId as string);
          return { ...current, controlledTokenIds: [...controlledTokenIds] };
        });
      } else if (message.type === 'ping.show' && message.payload && typeof message.payload === 'object') {
        const ping = validatePingPayload(message.payload);
        if (ping && boardRef.current?.boardId === ping.boardId) showPing(ping.x, ping.y);
      } else if (message.type === 'camera.focus') {
        const focus = validateCameraFocusPayload(message.payload);
        if (focus && boardRef.current?.boardId === focus.boardId) setFocusNonce(value => value + 1);
      } else if (message.type === 'request.accepted' && message.requestId) {
        pendingRequests.current.delete(message.requestId);
      } else if (message.type === 'request.rejected' && message.requestId && pendingRequests.current.has(message.requestId)) {
        pendingRequests.current.delete(message.requestId);
        const payload = message.payload as { error?: ApiFailure };
        if (payload?.error) setError(payload.error);
        setPreviewPositions({});
        requestSnapshot();
      } else if (message.type === 'session.state' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { lifecycle?: SessionLifecycle; stateSeq?: number; presentation?: string };
        if (payload.lifecycle) {
          setLifecycle(payload.lifecycle);
          if (payload.lifecycle === 'ended') { setScreen('ended'); return; }
        }
        if (typeof payload.stateSeq === 'number' && payload.stateSeq > seqRef.current) requestSnapshot();
      } else if (message.type === 'session.ended' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { reason?: string };
        stopped.current = true; setResumeState(undefined); setBoard(undefined); boardRef.current = undefined; setPreviewPositions({}); setPings([]); setScreen('ended');
        setError({ code: 'SESSION_ENDED', message: payload.reason === 'host_timeout' ? 'La sessione è terminata perché il master è rimasto offline troppo a lungo.' : 'Il master ha terminato la sessione.' });
        socket.close();
      } else if (message.type === 'participant.removed') {
        stopped.current = true; setResumeState(undefined); setScreen('ended');
        setError({ code: 'PERMISSION_DENIED', message: 'Il master ti ha rimosso dalla sessione.' });
        socket.close();
      }
    });

    socket.addEventListener('close', () => {
      if (socketRef.current !== socket) return;
      socketRef.current = undefined;
      pendingRequests.current.clear();
      setPreviewPositions({});
      setConnected(false);
      if (stopped.current || !resumeRef.current) return;
      const current = resumeRef.current;
      const retry = () => {
        if (stopped.current || resumeRef.current?.participantId !== current.participantId) return;
        const delay = Math.min(5000, 700 * 2 ** Math.min(retryCount.current++, 3));
        retryTimer.current = setTimeout(() => {
          const resumeRequest = current.kind === 'activity'
            ? activityFetch<ActivityResumeResponse>('/api/activity/resume', {
                method: 'POST',
                body: JSON.stringify({
                  instanceId: current.instanceId,
                  participantId: current.participantId,
                  activityCredential: current.activityCredential
                })
              })
            : api<{ ticket: string }>('/api/resume', current);
          void resumeRequest.then(result => {
            if (stopped.current) return;
            if (!result.ok) {
              if (result.error.code === 'SESSION_ENDED' || result.error.code === 'AUTH_FAILED' || result.error.code === 'SESSION_NOT_FOUND') {
                stopped.current = true; setResumeState(undefined); setScreen('ended'); setError(result.error);
              } else {
                setError({ ...result.error, message: 'Connessione persa. Riprovo automaticamente.' });
                retry();
              }
              return;
            }
            connect(current.liveSessionId, result.value.ticket);
          });
        }, delay);
      };
      retry();
    });
  }, [applyIncrement, applySnapshot, requestSnapshot, setResumeState, showPing]);

  useEffect(() => {
    if (activitySession) {
      stopped.current = false;
      setResumeState(activitySession.resume);
      setDisplayName(activitySession.resume.displayName);
      setScreen('connecting');
      connect(activitySession.resume.liveSessionId, activitySession.ticket);
    } else {
      const prior = storedResume();
      if (!prior) return;
      setResumeState(prior); setDisplayName(prior.displayName); setScreen('connecting');
      void api<{ ticket: string }>('/api/resume', prior).then(result => {
        if (!result.ok) {
          setResumeState(undefined); setScreen(result.error.code === 'SESSION_ENDED' ? 'ended' : 'join'); setError(result.error);
          return;
        }
        connect(prior.liveSessionId, result.value.ticket);
      });
    }
    return () => {
      stopped.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      socketRef.current?.close();
    };
  }, [activitySession, connect, setResumeState]);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    const code = formatJoinCode(joinCode.trim());
    const name = displayName.trim();
    if (!code || !name) return;
    stopped.current = false; setError(undefined); setScreen('connecting');
    const result = await api<JoinSessionResponse>('/api/join', { joinCode: code, displayName: name });
    if (!result.ok) { setScreen('join'); setError(result.error); return; }
    const next: StoredResume = {
      kind: 'standalone',
      liveSessionId: result.value.liveSessionId,
      participantId: result.value.participantId,
      resumeCredential: result.value.resumeCredential,
      displayName: name
    };
    setResumeState(next);
    connect(next.liveSessionId, result.value.ticket);
  }

  function leaveLocalResume() {
    stopped.current = true; socketRef.current?.close(); setResumeState(undefined); setError(undefined); setJoinCode(''); setBoard(undefined); boardRef.current = undefined; setPreviewPositions({}); setPings([]); seqRef.current = 0;
    if (activityMode) { globalThis.location.reload(); return; }
    setScreen('join');
  }

  return <main className={`player-shell ${screen === 'board' ? 'has-board' : ''}`}>
    <div className="player-brand"><span className="player-mark">◇</span><span><strong>Campaign Manager</strong><small>{activityMode ? 'Discord Activity' : 'Sessione giocatore'}</small></span></div>
    {screen === 'join' && !activityMode && <section className="join-card">
      <span className="eyebrow">UNISCITI ALLA SESSIONE</span>
      <h1>Entra al tavolo.</h1>
      <p>Chiedi al master il codice della sessione. Non serve un account.</p>
      <form onSubmit={join}>
        <label>Codice<input autoComplete="off" spellCheck={false} maxLength={9} placeholder="ABCD-EFGH" value={joinCode} onChange={event => setJoinCode(formatJoinCode(event.target.value))} /></label>
        <label>Nome visualizzato<input autoComplete="nickname" maxLength={80} placeholder="Come ti vedranno al tavolo" value={displayName} onChange={event => setDisplayName(event.target.value)} /></label>
        <button type="submit" disabled={!joinCode.trim() || !displayName.trim()}>Entra</button>
      </form>
    </section>}
    {screen === 'connecting' && <section className="waiting-card"><span className="spinner" /><h1>Connessione…</h1><p>{error?.message ?? 'Sto raggiungendo la sessione.'}</p></section>}
    {screen === 'waiting' && <section className="waiting-card">
      <span className={`connection-dot ${connected ? 'online' : ''}`} />
      <span className="eyebrow">{connected ? 'CONNESSO' : 'RICONNESSIONE'}</span>
      <h1>Sei al tavolo, {resume?.displayName ?? displayName}.</h1>
      <p>{lifecycle === 'host_reconnecting' ? 'Il master si sta riconnettendo. La sessione riprenderà quando torna online.' : 'Il master non sta condividendo una board in questo momento.'}</p>
      <small>Puoi lasciare aperta questa pagina.</small>
    </section>}
    {screen === 'board' && board && resume && <PlayerBoard board={board} sessionId={resume.liveSessionId} credential={resume.kind === 'activity' ? resume.activityCredential : resume.resumeCredential} interactive={connected && lifecycle === 'open'} previewPositions={previewPositions} pings={pings} focusNonce={focusNonce} onPreview={(tokenId, x, y) => { setPreviewPositions(current => ({ ...current, [tokenId]: { x, y } })); sendPreview('token.move.preview', { boardId: board.boardId, tokenId, x, y }); }} onCommit={(tokenId, x, y) => sendMutation('token.move.commit', { boardId: board.boardId, tokenId, x, y })} onPing={(x, y) => sendMutation('ping.create', { boardId: board.boardId, x, y })} />}
    {screen === 'ended' && <section className="waiting-card"><h1>Sessione non disponibile.</h1><p>{error?.message ?? 'Questa sessione è terminata.'}</p><button onClick={leaveLocalResume}>{activityMode ? 'Ricollega Discord' : 'Inserisci un altro codice'}</button></section>}
    {error && (screen === 'join' || screen === 'board') && <div className="player-error" role="alert">{error.message}</div>}
  </main>;
}


function formatPairingCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z2-9]/gu, '').slice(0, 6);
  return compact.length > 3 ? `${compact.slice(0, 3)}-${compact.slice(3)}` : compact;
}

async function activityFetch<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; value: T } | { ok: false; error: ApiFailure }> {
  try {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(activityApiPath(path, true), { ...init, headers });
    const value = await response.json() as T | LiveApiError;
    if (!response.ok) return { ok: false, error: (value as LiveApiError).error ?? { code: 'INTERNAL_ERROR', message: 'Discord Activity non raggiungibile.' } };
    return { ok: true, value: value as T };
  } catch {
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Discord Activity non raggiungibile.' } };
  }
}

function DiscordPairingApp({ initialContext }: { initialContext: DiscordActivityContext }) {
  const [status, setStatus] = useState<'booting' | 'unbound' | 'authorizing' | 'error'>('booting');
  const [pairingCode, setPairingCode] = useState('');
  const [error, setError] = useState<string>();
  const [pairing, setPairing] = useState(false);
  const [session, setSession] = useState<ActivitySessionBootstrap>();
  const instanceId = useRef(initialContext.instanceId);
  const readySdk = useRef<ReadyDiscordActivity | undefined>(undefined);
  const config = useRef<ActivityConfig | undefined>(undefined);

  const enterBoundActivity = useCallback(async () => {
    const ready = readySdk.current;
    const currentConfig = config.current;
    if (!ready || !currentConfig?.clientId) return;

    setStatus('authorizing');
    setError(undefined);

    const prior = storedActivityResume(instanceId.current);
    if (prior) {
      const resumed = await activityFetch<ActivityResumeResponse>('/api/activity/resume', {
        method: 'POST',
        body: JSON.stringify({
          instanceId: prior.instanceId,
          participantId: prior.participantId,
          activityCredential: prior.activityCredential
        })
      });
      if (resumed.ok) {
        const next = { ...prior, liveSessionId: resumed.value.liveSessionId, displayName: resumed.value.displayName };
        saveActivityResume(next);
        setSession({ resume: next, ticket: resumed.value.ticket });
        return;
      }
      if (resumed.error.code === 'SESSION_ENDED' || resumed.error.code === 'SESSION_NOT_FOUND' || resumed.error.code === 'AUTH_FAILED') {
        saveActivityResume(undefined);
      }
    }

    if (!currentConfig.identityReady) {
      setError('L’identità Discord server-side non è ancora configurata sul relay.');
      setStatus('error');
      return;
    }

    let authStage: DiscordAuthStage = 'authorize';
    try {
      const authorization = await ready.sdk.commands.authorize({
        client_id: currentConfig.clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify']
      });
      if (!authorization?.code) throw new Error('Discord non ha restituito un codice OAuth.');

      authStage = 'join';
      const joined = await activityFetch<ActivityJoinResponse>('/api/activity/join', {
        method: 'POST',
        body: JSON.stringify({ instanceId: instanceId.current, code: authorization.code })
      });
      if (!joined.ok) {
        setError(discordAuthFailure(authStage, joined.error));
        setStatus('error');
        return;
      }

      authStage = 'authenticate';
      const authenticated = await ready.sdk.commands.authenticate({ access_token: joined.value.accessToken });
      if (!authenticated) throw new Error('Discord non ha completato authenticate.');

      const resume: ActivityResume = {
        kind: 'activity',
        instanceId: instanceId.current,
        liveSessionId: joined.value.liveSessionId,
        participantId: joined.value.participantId,
        activityCredential: joined.value.activityCredential,
        displayName: joined.value.displayName
      };
      saveActivityResume(resume);
      setSession({ resume, ticket: joined.value.ticket });
    } catch (failure) {
      setError(discordAuthFailure(authStage, failure));
      setStatus('error');
    }
  }, []);

  const readBinding = useCallback(async () => {
    const result = await activityFetch<unknown>(`/api/activity/instances/${encodeURIComponent(instanceId.current)}`, { method: 'GET' });
    if (!result.ok) { setError(result.error.message); setStatus('error'); return; }
    const binding = validateActivityBindingStatus(result.value);
    if (!binding) { setError('Il relay ha restituito uno stato Activity non valido.'); setStatus('error'); return; }
    setError(undefined);
    if (binding.bound) await enterBoundActivity();
    else setStatus('unbound');
  }, [enterBoundActivity]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const configResult = await activityFetch<ActivityConfig>('/api/activity/config', { method: 'GET' });
      if (cancelled) return;
      if (!configResult.ok || !configResult.value.clientId) {
        setError(configResult.ok ? 'Discord Client ID non configurato sul relay.' : configResult.error.message);
        setStatus('error');
        return;
      }
      try {
        const ready = await readyDiscordActivity(configResult.value.clientId, initialContext);
        if (cancelled) return;
        config.current = configResult.value;
        readySdk.current = ready;
        instanceId.current = ready.instanceId;
        await readBinding();
      } catch (failure) {
        if (cancelled) return;
        setError(failure instanceof Error ? failure.message : 'Discord Activity non disponibile.');
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [initialContext, readBinding]);

  async function submitPairing(event: React.FormEvent) {
    event.preventDefault();
    const code = validateActivityPairingCode(formatPairingCode(pairingCode));
    if (!code) return;
    setPairing(true); setError(undefined);
    try {
      const result = await activityFetch<unknown>('/api/activity/pair', {
        method: 'POST',
        body: JSON.stringify({ instanceId: instanceId.current, pairingCode: code })
      });
      if (!result.ok) { setError(result.error.message); return; }
      const binding = validateActivityBindingStatus(result.value);
      if (!binding?.bound) { setError('Il pairing non è stato confermato dal relay.'); return; }
      setPairingCode('');
      await enterBoundActivity();
    } finally { setPairing(false); }
  }

  if (session) return <App activitySession={session} />;

  return <main className="player-shell discord-shell">
    <div className="player-brand"><span className="player-mark">◇</span><span><strong>Campaign Manager</strong><small>Discord Activity</small></span></div>
    {status === 'booting' && <section className="waiting-card"><span className="spinner" /><h1>Avvio Activity…</h1><p>Sto leggendo il contesto dell’istanza Discord.</p></section>}
    {status === 'authorizing' && <section className="waiting-card"><span className="spinner" /><h1>Ingresso al tavolo…</h1><p>Discord sta verificando identità e appartenenza a questa Activity.</p></section>}
    {status === 'unbound' && <section className="join-card discord-pair-card">
      <span className="eyebrow">COLLEGA QUESTA ACTIVITY</span>
      <h1>Inserisci il pairing del master.</h1>
      <p>Il codice si genera dal pannello Live di Campaign Manager Desktop. È monouso e collega soltanto questa istanza Discord.</p>
      <form onSubmit={submitPairing}>
        <label>Pairing<input autoComplete="off" spellCheck={false} maxLength={7} placeholder="ABC-DEF" value={pairingCode} onChange={event => setPairingCode(formatPairingCode(event.target.value))} /></label>
        <button type="submit" disabled={pairing || !validateActivityPairingCode(pairingCode)}>{pairing ? 'Collego…' : 'Collega Activity'}</button>
      </form>
      {error && <div className="player-error inline-error" role="alert">{error}</div>}
    </section>}
    {status === 'error' && <section className="waiting-card"><h1>Activity non disponibile.</h1><p>{error ?? 'Non riesco a inizializzare Discord.'}</p><button onClick={() => void readBinding()}>Riprova</button></section>}
  </main>;
}

const discordContext = discordActivityContext();
createRoot(document.getElementById('root')!).render(discordContext ? <DiscordPairingApp initialContext={discordContext} /> : <App />);

