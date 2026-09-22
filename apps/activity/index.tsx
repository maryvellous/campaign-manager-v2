import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  validateEnvelope,
  type JoinSessionResponse,
  type LiveApiError,
  type SessionLifecycle
} from '../../packages/protocol/src/index';
import './style.css';

interface StoredResume {
  liveSessionId: string;
  participantId: string;
  resumeCredential: string;
  displayName: string;
}

type Screen = 'join' | 'connecting' | 'waiting' | 'ended';
type ApiFailure = LiveApiError['error'];

const storageKey = 'cmv2-live-resume-v1';

function storedResume(): StoredResume | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as StoredResume | null;
    if (!value || typeof value.liveSessionId !== 'string' || typeof value.participantId !== 'string' || typeof value.resumeCredential !== 'string' || typeof value.displayName !== 'string') return undefined;
    return value;
  } catch { return undefined; }
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

function App() {
  const [screen, setScreen] = useState<Screen>('join');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resume, setResume] = useState<StoredResume>();
  const resumeRef = useRef<StoredResume | undefined>(undefined);
  const [lifecycle, setLifecycle] = useState<SessionLifecycle>('open');
  const [error, setError] = useState<ApiFailure>();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket>();
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const retryCount = useRef(0);
  const stopped = useRef(false);

  const setResumeState = useCallback((value: StoredResume | undefined) => {
    resumeRef.current = value; setResume(value);
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  }, []);

  const connect = useCallback((liveSessionId: string, ticket: string) => {
    socketRef.current?.close();
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
        const payload = message.payload as { lifecycle?: SessionLifecycle };
        if (payload.lifecycle) setLifecycle(payload.lifecycle);
        setScreen('waiting');
      } else if (message.type === 'presentation.waiting') {
        setScreen('waiting');
      } else if (message.type === 'session.state' && message.payload && typeof message.payload === 'object') {
        const payload = message.payload as { lifecycle?: SessionLifecycle };
        if (payload.lifecycle) {
          setLifecycle(payload.lifecycle);
          if (payload.lifecycle === 'ended') setScreen('ended');
        }
      } else if (message.type === 'participant.removed') {
        stopped.current = true; setResumeState(undefined); setScreen('ended');
        setError({ code: 'PERMISSION_DENIED', message: 'Il master ti ha rimosso dalla sessione.' });
        socket.close();
      }
    });

    socket.addEventListener('close', () => {
      setConnected(false);
      if (stopped.current || !resumeRef.current) return;
      const current = resumeRef.current;
      const delay = Math.min(5000, 700 * 2 ** Math.min(retryCount.current++, 3));
      retryTimer.current = setTimeout(() => {
        void api<{ ticket: string }>('/api/resume', current).then(result => {
          if (stopped.current) return;
          if (!result.ok) {
            if (result.error.code === 'SESSION_ENDED' || result.error.code === 'AUTH_FAILED') {
              stopped.current = true; setResumeState(undefined); setScreen('ended'); setError(result.error);
            } else {
              setError({ ...result.error, message: 'Connessione persa. Riprovo automaticamente.' });
              retryTimer.current = setTimeout(() => socketRef.current?.dispatchEvent(new Event('close')), delay);
            }
            return;
          }
          connect(current.liveSessionId, result.value.ticket);
        });
      }, delay);
    });
  }, [setResumeState]);

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
    const code = joinCode.trim().toUpperCase();
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
    stopped.current = true; socketRef.current?.close(); setResumeState(undefined); setScreen('join'); setError(undefined); setJoinCode('');
  }

  return <main className="player-shell">
    <div className="player-brand"><span className="player-mark">◇</span><span><strong>Campaign Manager</strong><small>Sessione giocatore</small></span></div>
    {screen === 'join' && <section className="join-card">
      <span className="eyebrow">UNISCITI ALLA SESSIONE</span>
      <h1>Entra al tavolo.</h1>
      <p>Chiedi al master il codice della sessione. Non serve un account.</p>
      <form onSubmit={join}>
        <label>Codice<input autoComplete="off" spellCheck={false} maxLength={9} placeholder="ABCD-EFGH" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} /></label>
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
    {screen === 'ended' && <section className="waiting-card"><h1>Sessione non disponibile.</h1><p>{error?.message ?? 'Questa sessione è terminata.'}</p><button onClick={leaveLocalResume}>Inserisci un altro codice</button></section>}
    {error && screen === 'join' && <div className="player-error" role="alert">{error.message}</div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
