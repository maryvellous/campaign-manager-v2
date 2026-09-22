import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  envelope,
  validateEnvelope,
  validateLiveBoardElement,
  validateLiveBoardPayload,
  type JoinSessionResponse,
  type LiveApiError,
  type LiveBoardElement,
  type LiveBoardEndpoint,
  type LiveBoardSnapshot,
  type SessionLifecycle
} from '../../packages/protocol/src/index';
import './style.css';

interface StoredResume {
  liveSessionId: string;
  participantId: string;
  resumeCredential: string;
  displayName: string;
}

type Screen = 'join' | 'connecting' | 'waiting' | 'board' | 'ended';
type ApiFailure = LiveApiError['error'];
type Camera = { x: number; y: number; zoom: number };

const storageKey = 'cmv2-live-resume-v1';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function storedResume(): StoredResume | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as StoredResume | null;
    if (!value || typeof value.liveSessionId !== 'string' || typeof value.participantId !== 'string' || typeof value.resumeCredential !== 'string' || typeof value.displayName !== 'string') return undefined;
    return value;
  } catch { return undefined; }
}

function formatJoinCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z2-9]/gu, '').slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

function websocketUrl(liveSessionId: string): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/api/sessions/${encodeURIComponent(liveSessionId)}/ws`;
}

function assetUrl(liveSessionId: string, publishedAssetId: string): string {
  return `/api/sessions/${encodeURIComponent(liveSessionId)}/assets/${encodeURIComponent(publishedAssetId)}`;
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.stateSeq !== 'number' || !Number.isSafeInteger(record.stateSeq) || record.stateSeq < 0) return undefined;
  const board = validateLiveBoardPayload({ boardId: record.boardId, title: record.title, elements: record.elements });
  return board ? { ...board, stateSeq: record.stateSeq } : undefined;
}

function endpointPoint(board: LiveBoardSnapshot, endpoint: LiveBoardEndpoint): { x: number; y: number } {
  if (endpoint.kind === 'point') return { x: endpoint.x, y: endpoint.y };
  const target = board.elements.find(element => element.elementId === endpoint.elementId);
  if (!target || target.type === 'link') return { x: 0, y: 0 };
  return { x: target.x + target.width / 2, y: target.y + target.height / 2 };
}

function BoardElementView({ element, sessionId }: { element: Exclude<LiveBoardElement, { type: 'link' }>; sessionId: string }) {
  if (element.type === 'text') return <div className="player-board-text">{element.text}</div>;
  if (element.type === 'image') return <img className="player-board-image" draggable={false} src={assetUrl(sessionId, element.publishedAssetId)} alt="" />;
  if (element.type === 'token') {
    const initials = element.name.trim().split(/\s+/u).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '•';
    return <div className="player-board-token">{element.publishedAssetId ? <img draggable={false} src={assetUrl(sessionId, element.publishedAssetId)} alt="" /> : <span>{initials}</span>}<small>{element.name}</small></div>;
  }
  return <div className="player-board-card"><span>{element.cardKind === 'excerpt' ? 'Estratto' : 'Nota'}</span><strong>{element.sourceTitle}</strong>{element.cardKind === 'excerpt' && <p>{element.excerpt}</p>}</div>;
}

function PlayerBoard({ board, sessionId, connected }: { board: LiveBoardSnapshot; sessionId: string; connected: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 40, y: 40, zoom: 1 });

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

  useEffect(() => { requestAnimationFrame(fit); }, [board.boardId, fit]);

  function pan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
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

  return <section className="player-board-shell">
    <header className="player-board-header"><div><span className="eyebrow">SCENA CONDIVISA</span><strong>{board.title}</strong></div><div><span className={`connection-dot ${connected ? 'online' : ''}`} /><button onClick={fit}>Centra</button><small>{Math.round(camera.zoom * 100)}%</small></div></header>
    <div ref={viewport} className="player-board-viewport" onPointerDown={pan} onWheel={zoom}>
      <div className="player-board-stage" style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})` }}>
        {board.elements.slice().sort((a, b) => a.z - b.z).map(element => {
          if (element.type === 'link') {
            const from = endpointPoint(board, element.from); const to = endpointPoint(board, element.to);
            const markerId = `activity-arrow-${element.elementId}`;
            return <svg key={element.elementId} className="player-link-layer" style={{ zIndex: element.z }} aria-hidden="true"><defs><marker id={markerId} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" /></marker></defs><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={element.arrow === 'end' ? `url(#${markerId})` : undefined} /></svg>;
          }
          return <div key={element.elementId} className={`player-board-element type-${element.type}`} style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.z }}><BoardElementView element={element} sessionId={sessionId} /></div>;
        })}
      </div>
    </div>
  </section>;
}

function App() {
  const [screen, setScreen] = useState<Screen>('join');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resume, setResume] = useState<StoredResume>();
  const resumeRef = useRef<StoredResume | undefined>(undefined);
  const [lifecycle, setLifecycle] = useState<SessionLifecycle>('open');
  const [error, setError] = useState<ApiFailure>();
  const [connected, setConnected] = useState(false);
  const [board, setBoard] = useState<LiveBoardSnapshot>();
  const boardRef = useRef<LiveBoardSnapshot | undefined>(undefined);
  const seqRef = useRef(0);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryCount = useRef(0);
  const stopped = useRef(false);

  const setResumeState = useCallback((value: StoredResume | undefined) => {
    resumeRef.current = value; setResume(value);
    if (value) localStorage.setItem(storageKey, JSON.stringify(value));
    else localStorage.removeItem(storageKey);
  }, []);

  const requestSnapshot = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(envelope('snapshot.request', {})));
  }, []);

  const applySnapshot = useCallback((snapshot: LiveBoardSnapshot) => {
    boardRef.current = snapshot; setBoard(snapshot); seqRef.current = snapshot.stateSeq; setScreen('board');
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
        boardRef.current = undefined; setBoard(undefined); setScreen('waiting');
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
        applyIncrement(payload.stateSeq, current => current.boardId === payload.boardId ? { ...current, elements: current.elements.filter(item => !payload.elementIds!.includes(item.elementId)) } : undefined);
      } else if (message.type === 'session.state' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { lifecycle?: SessionLifecycle; stateSeq?: number; presentation?: string };
        if (payload.lifecycle) {
          setLifecycle(payload.lifecycle);
          if (payload.lifecycle === 'ended') { setScreen('ended'); return; }
        }
        if (typeof payload.stateSeq === 'number' && payload.stateSeq > seqRef.current) requestSnapshot();
      } else if (message.type === 'participant.removed') {
        stopped.current = true; setResumeState(undefined); setScreen('ended');
        setError({ code: 'PERMISSION_DENIED', message: 'Il master ti ha rimosso dalla sessione.' });
        socket.close();
      }
    });

    socket.addEventListener('close', () => {
      if (socketRef.current !== socket) return;
      socketRef.current = undefined;
      setConnected(false);
      if (stopped.current || !resumeRef.current) return;
      const current = resumeRef.current;
      const retry = () => {
        if (stopped.current || resumeRef.current?.participantId !== current.participantId) return;
        const delay = Math.min(5000, 700 * 2 ** Math.min(retryCount.current++, 3));
        retryTimer.current = setTimeout(() => {
          void api<{ ticket: string }>('/api/resume', current).then(result => {
            if (stopped.current) return;
            if (!result.ok) {
              if (result.error.code === 'SESSION_ENDED' || result.error.code === 'AUTH_FAILED') {
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
  }, [applyIncrement, applySnapshot, requestSnapshot, setResumeState]);

  useEffect(() => {
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
    return () => {
      stopped.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      socketRef.current?.close();
    };
  }, [connect, setResumeState]);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    const code = formatJoinCode(joinCode.trim());
    const name = displayName.trim();
    if (!code || !name) return;
    stopped.current = false; setError(undefined); setScreen('connecting');
    const result = await api<JoinSessionResponse>('/api/join', { joinCode: code, displayName: name });
    if (!result.ok) { setScreen('join'); setError(result.error); return; }
    const next: StoredResume = {
      liveSessionId: result.value.liveSessionId,
      participantId: result.value.participantId,
      resumeCredential: result.value.resumeCredential,
      displayName: name
    };
    setResumeState(next);
    connect(next.liveSessionId, result.value.ticket);
  }

  function leaveLocalResume() {
    stopped.current = true; socketRef.current?.close(); setResumeState(undefined); setScreen('join'); setError(undefined); setJoinCode(''); setBoard(undefined); boardRef.current = undefined; seqRef.current = 0;
  }

  return <main className={`player-shell ${screen === 'board' ? 'has-board' : ''}`}>
    <div className="player-brand"><span className="player-mark">◇</span><span><strong>Campaign Manager</strong><small>Sessione giocatore</small></span></div>
    {screen === 'join' && <section className="join-card">
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
    {screen === 'board' && board && resume && <PlayerBoard board={board} sessionId={resume.liveSessionId} connected={connected} />}
    {screen === 'ended' && <section className="waiting-card"><h1>Sessione non disponibile.</h1><p>{error?.message ?? 'Questa sessione è terminata.'}</p><button onClick={leaveLocalResume}>Inserisci un altro codice</button></section>}
    {error && screen === 'join' && <div className="player-error" role="alert">{error.message}</div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
