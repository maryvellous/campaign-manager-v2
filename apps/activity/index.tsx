import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  envelope,
  validateElementHiddenEvent,
  validateElementRevealedEvent,
  validateEnvelope,
  validateLiveBoardSnapshot,
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

function endpointPoint(board: LiveBoardSnapshot, endpoint: LiveBoardEndpoint): { x: number; y: number } {
  if (endpoint.kind === 'point') return endpoint;
  const element = board.elements.find(item => item.elementId === endpoint.elementId);
  if (!element || element.type === 'link') return { x: 0, y: 0 };
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

function boardBounds(board: LiveBoardSnapshot) {
  const boxes = board.elements.filter(element => element.type !== 'link');
  if (!boxes.length) return { left: -200, top: -120, right: 200, bottom: 120 };
  return {
    left: Math.min(...boxes.map(element => element.x)),
    top: Math.min(...boxes.map(element => element.y)),
    right: Math.max(...boxes.map(element => element.x + element.width)),
    bottom: Math.max(...boxes.map(element => element.y + element.height))
  };
}

function LiveAssetImage({ resume, publishedAssetId }: { resume: StoredResume; publishedAssetId: string }) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    setSrc(undefined); setFailed(false);
    void fetch(`/api/sessions/${encodeURIComponent(resume.liveSessionId)}/assets/${encodeURIComponent(publishedAssetId)}`, {
      headers: { authorization: `Bearer ${resume.resumeCredential}` }
    }).then(async response => {
      if (!response.ok) throw new Error('asset unavailable');
      const blob = await response.blob();
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [publishedAssetId, resume.liveSessionId, resume.resumeCredential]);
  if (failed) return <div className="live-board-asset-missing">Immagine non disponibile</div>;
  if (!src) return <div className="live-board-asset-loading">Caricamento…</div>;
  return <img draggable={false} src={src} alt="" />;
}

function BoardCanvas({ board, resume }: { board: LiveBoardSnapshot; resume: StoredResume }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });

  const center = useCallback(() => {
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    const bounds = boardBounds(board);
    const width = Math.max(1, bounds.right - bounds.left);
    const height = Math.max(1, bounds.bottom - bounds.top);
    const zoom = Math.min(2, Math.max(.2, Math.min((rect.width - 90) / width, (rect.height - 90) / height)));
    const cx = (bounds.left + bounds.right) / 2; const cy = (bounds.top + bounds.bottom) / 2;
    setCamera({ x: rect.width / 2 - cx * zoom, y: rect.height / 2 - cy * zoom, zoom });
  }, [board]);

  useEffect(() => {
    const id = requestAnimationFrame(center);
    return () => cancelAnimationFrame(id);
  }, [board.boardId, center]);

  const pan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const start = { x: event.clientX, y: event.clientY, camera };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (nativeEvent: PointerEvent) => setCamera({ ...start.camera, x: start.camera.x + nativeEvent.clientX - start.x, y: start.camera.y + nativeEvent.clientY - start.y });
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const zoom = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    const nextZoom = Math.min(4, Math.max(.2, camera.zoom * (event.deltaY > 0 ? .9 : 1.1)));
    const px = event.clientX - rect.left; const py = event.clientY - rect.top;
    const wx = (px - camera.x) / camera.zoom; const wy = (py - camera.y) / camera.zoom;
    setCamera({ x: px - wx * nextZoom, y: py - wy * nextZoom, zoom: nextZoom });
  };

  return <section className="live-board-shell">
    <header className="live-board-header">
      <div><span className="eyebrow">SCENA CONDIVISA</span><strong>{board.title}</strong></div>
      <div><span>{Math.round(camera.zoom * 100)}%</span><button onClick={center}>Centra scena</button></div>
    </header>
    <div ref={viewport} className="live-board-viewport" onPointerDown={pan} onWheel={zoom}>
      <div className="live-board-stage" style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})` }}>
        {board.elements.slice().sort((a, b) => a.z - b.z).map(element => {
          if (element.type === 'link') {
            const from = endpointPoint(board, element.from); const to = endpointPoint(board, element.to);
            const marker = `player-arrow-${element.elementId}`;
            return <svg key={element.elementId} className="live-board-link" style={{ zIndex: element.z }} aria-hidden="true">
              <defs><marker id={marker} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L9,4.5 L0,9 z" /></marker></defs>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={element.arrow === 'end' ? `url(#${marker})` : undefined} />
            </svg>;
          }
          return <div key={element.elementId} className={`live-board-element live-board-${element.type}`} style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.z }}>
            {element.type === 'text' && <div className="live-board-text">{element.text}</div>}
            {element.type === 'image' && <LiveAssetImage resume={resume} publishedAssetId={element.publishedAssetId} />}
            {element.type === 'token' && <div className="live-board-token-content">
              <div className="live-board-token-avatar">{element.publishedAssetId ? <LiveAssetImage resume={resume} publishedAssetId={element.publishedAssetId} /> : <span>{element.name.split(/\s+/u).slice(0, 2).map(part => part[0]?.toUpperCase()).join('')}</span>}</div>
              <span>{element.name}</span>
            </div>}
            {element.type === 'card' && <div className="live-board-card-content">
              <small>{element.cardKind === 'excerpt' ? 'Estratto' : 'Nota'}</small><strong>{element.sourceTitle}</strong>{element.cardKind === 'excerpt' && <p>{element.excerpt}</p>}
            </div>}
          </div>;
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
  const stateSeq = useRef(0);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryCount = useRef(0);
  const stopped = useRef(false);

  const setBoardState = useCallback((value: LiveBoardSnapshot | undefined) => {
    boardRef.current = value; setBoard(value);
    if (value) stateSeq.current = value.stateSeq;
  }, []);

  const setResumeState = useCallback((value: StoredResume | undefined) => {
    resumeRef.current = value; setResume(value);
    if (value) localStorage.setItem(storageKey, JSON.stringify(value));
    else localStorage.removeItem(storageKey);
  }, []);

  const requestSnapshot = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(envelope('snapshot.request', {})));
  }, []);

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
        const payload = message.payload as { lifecycle?: SessionLifecycle; presentation?: 'waiting' | 'board'; stateSeq?: number };
        if (payload.lifecycle) setLifecycle(payload.lifecycle);
        if (typeof payload.stateSeq === 'number') stateSeq.current = payload.stateSeq;
        if (payload.presentation === 'waiting') { setBoardState(undefined); setScreen('waiting'); }
      } else if (message.type === 'presentation.waiting' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { stateSeq?: unknown };
        if (typeof payload.stateSeq === 'number' && Number.isSafeInteger(payload.stateSeq)) stateSeq.current = payload.stateSeq;
        setBoardState(undefined); setScreen('waiting');
      } else if (message.type === 'board.snapshot') {
        const snapshot = validateLiveBoardSnapshot(message.payload);
        if (!snapshot) { requestSnapshot(); return; }
        setBoardState(snapshot); setScreen('board');
      } else if (message.type === 'element.revealed') {
        const update = validateElementRevealedEvent(message.payload);
        const current = boardRef.current;
        if (!update || !current || update.boardId !== current.boardId || update.stateSeq !== stateSeq.current + 1) { requestSnapshot(); return; }
        const index = current.elements.findIndex(element => element.elementId === update.element.elementId);
        const elements = [...current.elements];
        if (index >= 0) elements[index] = update.element; else elements.push(update.element);
        setBoardState({ ...current, elements, stateSeq: update.stateSeq });
      } else if (message.type === 'element.hidden') {
        const update = validateElementHiddenEvent(message.payload);
        const current = boardRef.current;
        if (!update || !current || update.boardId !== current.boardId || update.stateSeq !== stateSeq.current + 1) { requestSnapshot(); return; }
        const hidden = new Set(update.elementIds);
        setBoardState({ ...current, elements: current.elements.filter(element => !hidden.has(element.elementId)), stateSeq: update.stateSeq });
      } else if (message.type === 'session.state' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { lifecycle?: SessionLifecycle; presentation?: 'waiting' | 'board'; stateSeq?: unknown };
        if (payload.lifecycle) {
          setLifecycle(payload.lifecycle);
          if (payload.lifecycle === 'ended') setScreen('ended');
        }
        if (typeof payload.stateSeq === 'number' && Number.isSafeInteger(payload.stateSeq) && payload.stateSeq > stateSeq.current + 1) requestSnapshot();
        if (payload.presentation === 'waiting') { setBoardState(undefined); setScreen('waiting'); }
      } else if (message.type === 'participant.removed') {
        stopped.current = true; setResumeState(undefined); setBoardState(undefined); setScreen('ended');
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
                stopped.current = true; setResumeState(undefined); setBoardState(undefined); setScreen('ended'); setError(result.error);
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
  }, [requestSnapshot, setBoardState, setResumeState]);

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
    stopped.current = true; socketRef.current?.close(); setResumeState(undefined); setBoardState(undefined); setScreen('join'); setError(undefined); setJoinCode('');
  }

  const playerName = resume?.displayName ?? displayName;
  return <main className={`player-shell ${screen === 'board' ? 'showing-board' : ''}`}>
    <div className="player-brand"><span className="player-mark">◇</span><span><strong>Campaign Manager</strong><small>{screen === 'board' ? playerName : 'Sessione giocatore'}</small></span></div>
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
      <h1>Sei al tavolo, {playerName}.</h1>
      <p>{lifecycle === 'host_reconnecting' ? 'Il master si sta riconnettendo. La sessione riprenderà quando torna online.' : 'Il master non sta condividendo una board in questo momento.'}</p>
      <small>Puoi lasciare aperta questa pagina.</small>
    </section>}
    {screen === 'board' && board && resume && <BoardCanvas board={board} resume={resume} />}
    {screen === 'ended' && <section className="waiting-card"><h1>Sessione non disponibile.</h1><p>{error?.message ?? 'Questa sessione è terminata.'}</p><button onClick={leaveLocalResume}>Inserisci un altro codice</button></section>}
    {!connected && screen === 'board' && <div className="player-error" role="status">Connessione persa. La scena resta visibile mentre provo a riconnettermi.</div>}
    {error && screen === 'join' && <div className="player-error" role="alert">{error.message}</div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
