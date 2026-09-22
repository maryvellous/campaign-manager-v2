import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DesktopLiveState } from '../application/live-session-client';

type Reply = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
type Command = (input: Record<string, unknown>) => Promise<Reply>;
type LocalBoard = { path: string; title: string; boardId: string };
type LocalElement = { elementId: string; type: string; visibleByDefault: boolean; label: string };
type ElementList = { boardPath: string; boardId: string; title: string; elements: LocalElement[] };
type ActivityPairing = { pairingCode: string; expiresAt: number };
type ActivityBinding = { bound: boolean; instanceId?: string; pairedAt?: number };

export function LiveSessionView({ live, command }: { live: DesktopLiveState; command: Command }) {
  const active = !!live.liveSessionId;
  const [boards, setBoards] = useState<LocalBoard[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [elementList, setElementList] = useState<ElementList>();
  const [busyAction, setBusyAction] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [endPrompt, setEndPrompt] = useState(false);
  const [activityPairing, setActivityPairing] = useState<ActivityPairing>();
  const [activityBinding, setActivityBinding] = useState<ActivityBinding>({ bound: false });

  const selectedBoard = useMemo(() => boards.find(board => board.path === selectedPath), [boards, selectedPath]);
  const selectedIsActive = !!selectedBoard && selectedBoard.boardId === live.activeBoardId;
  const selectedWasPublished = !!selectedBoard && live.liveBoards.some(board => board.boardId === selectedBoard.boardId);
  const activeIds = useMemo(() => new Set(live.activeElementIds), [live.activeElementIds]);

  const loadBoards = useCallback(async () => {
    if (!active) { setBoards([]); setSelectedPath(''); setElementList(undefined); return; }
    const reply = await command({ action: 'live:boards' });
    if (!reply.ok) { setMessage(reply.error?.message ?? 'Non riesco a leggere le board.'); return; }
    const next = (reply.data as LocalBoard[] | undefined) ?? [];
    setBoards(next);
    setSelectedPath(current => {
      const activeBoard = next.find(board => board.boardId === live.activeBoardId);
      if (activeBoard) return activeBoard.path;
      if (current && next.some(board => board.path === current)) return current;
      return next[0]?.path ?? '';
    });
  }, [active, command, live.activeBoardId]);

  const loadElements = useCallback(async (path: string) => {
    if (!path) { setElementList(undefined); return; }
    const reply = await command({ action: 'live:elements', path });
    if (!reply.ok) { setMessage(reply.error?.message ?? 'Non riesco a leggere gli elementi della board.'); return; }
    setElementList(reply.data as ElementList);
  }, [command]);

  useEffect(() => { void loadBoards(); }, [loadBoards]);
  useEffect(() => { void loadElements(selectedPath); }, [loadElements, selectedPath]);

  const loadActivityBinding = useCallback(async () => {
    if (!active) { setActivityBinding({ bound: false }); setActivityPairing(undefined); return; }
    const reply = await command({ action: 'live:discordBinding' });
    if (!reply.ok) return;
    const binding = reply.data as ActivityBinding | undefined;
    if (!binding || typeof binding.bound !== 'boolean') return;
    setActivityBinding(binding);
    if (binding.bound) setActivityPairing(undefined);
  }, [active, command]);

  useEffect(() => { void loadActivityBinding(); }, [loadActivityBinding]);
  useEffect(() => {
    if (!activityPairing || activityBinding.bound || activityPairing.expiresAt <= Date.now()) return;
    const timer = window.setInterval(() => void loadActivityBinding(), 2500);
    return () => window.clearInterval(timer);
  }, [activityBinding.bound, activityPairing, loadActivityBinding]);

  const run = async (key: string, input: Record<string, unknown>, reloadElements = false) => {
    setBusyAction(key); setMessage(undefined);
    try {
      const reply = await command(input);
      if (!reply.ok) { setMessage(reply.error?.message ?? 'Operazione live non riuscita.'); return false; }
      if (reloadElements && selectedPath) await loadElements(selectedPath);
      return true;
    } finally { setBusyAction(undefined); }
  };

  const publishSelected = async () => {
    if (!selectedPath) return;
    await run('publish', { action: 'live:publishBoard', path: selectedPath }, true);
  };

  const resetSelected = async () => {
    if (!selectedPath) return;
    if (!window.confirm('Reimpostare la scena live dalla board preparata? Reveal/hide e modifiche runtime di questa board verranno scartati.')) return;
    await run('reset', { action: 'live:resetBoard', path: selectedPath }, true);
  };

  const toggleElement = async (element: LocalElement) => {
    if (!selectedIsActive) return;
    const visible = activeIds.has(element.elementId);
    await run(`element:${element.elementId}`, visible
      ? { action: 'live:hideElement', elementId: element.elementId }
      : { action: 'live:revealElement', path: selectedPath, elementId: element.elementId }, true);
  };

  const setTokenController = async (tokenId: string, participantId: string) => {
    if (!selectedIsActive) return;
    await run(`controller:${tokenId}`, participantId
      ? { action: 'live:assignToken', tokenId, participantId }
      : { action: 'live:clearToken', tokenId });
  };

  const createActivityPairing = async () => {
    setBusyAction('discord-pairing'); setMessage(undefined);
    try {
      const reply = await command({ action: 'live:createDiscordPairing' });
      if (!reply.ok) { setMessage(reply.error?.message ?? 'Non riesco a generare il pairing Discord.'); return; }
      const pairing = reply.data as ActivityPairing | undefined;
      if (!pairing || typeof pairing.pairingCode !== 'string' || typeof pairing.expiresAt !== 'number') {
        setMessage('Il relay ha restituito un pairing Discord non valido.');
        return;
      }
      setActivityPairing(pairing);
      setActivityBinding({ bound: false });
    } finally { setBusyAction(undefined); }
  };

  return <section className="live-view">
    <header className="live-view-header">
      <div><span className="eyebrow">V0.4 · LIVE + DISCORD</span><h1>Sessione live</h1><p>Fai entrare i giocatori dal browser e condividi solo ciò che decidi tu.</p></div>
      <div className="live-header-status">{active && <button className="danger subtle" onClick={() => setEndPrompt(true)}>Termina sessione</button>}<span className={`live-status ${live.connected ? 'online' : ''}`}>{active ? live.connected ? 'Relay connesso' : 'Riconnessione' : 'Nessuna sessione'}</span></div>
    </header>

    {!active ? <div className="live-empty">
      <span className="live-empty-mark">⌁</span>
      <h2>Apri il tavolo ai giocatori.</h2>
      <p>Avvia una sessione per ottenere un codice breve. Non serve un account né ai giocatori né al master.</p>
      <button className="primary" disabled={live.status === 'starting'} onClick={() => void command({ action: 'live:start' })}>{live.status === 'starting' ? 'Avvio…' : 'Avvia sessione'}</button>
      {live.error && <p className="live-error" role="alert">{live.error}</p>}
    </div> : <div className="live-grid">
      <section className="live-card join-card-dm">
        <span className="eyebrow">CODICE SESSIONE</span>
        <div className="join-code">{live.joinCode}</div>
        <div className="actions"><button className="primary" onClick={() => void command({ action: 'live:copyJoinCode' })}>Copia codice</button><button onClick={() => void command({ action: 'live:rotateCode' })}>Genera nuovo codice</button></div>
        <p>Un nuovo codice invalida soltanto quello precedente. Chi è già entrato resta nella sessione.</p>
        {live.playerUrl && <div className="live-player-url"><span>{live.playerUrl}</span><button onClick={() => void command({ action: 'external', url: live.playerUrl })}>Apri pagina giocatore</button></div>}
      </section>

      <section className="live-card">
        <div className="live-card-heading"><div><span className="eyebrow">INGRESSI</span><h2>Nuovi giocatori</h2></div><label className="live-switch"><input type="checkbox" checked={live.acceptingJoins} onChange={event => void command({ action: 'live:setAccepting', acceptingJoins: event.target.checked })} /><span>{live.acceptingJoins ? 'Aperti' : 'Chiusi'}</span></label></div>
        <p>{live.acceptingJoins ? 'Chi ha un codice valido entra direttamente.' : 'I nuovi join sono bloccati; i partecipanti esistenti possono riconnettersi.'}</p>
      </section>

      <section className="live-card discord-activity-card">
        <div className="live-card-heading"><div><span className="eyebrow">DISCORD ACTIVITY</span><h2>{activityBinding.bound ? 'Activity collegata' : 'Collega Discord'}</h2></div><span className={`live-status ${activityBinding.bound ? 'online' : ''}`}>{activityBinding.bound ? 'Collegata' : 'Non collegata'}</span></div>
        {activityBinding.bound ? <>
          <p>Questa live è associata a una specifica istanza della Discord Activity. Il desktop resta l’unico host della sessione.</p>
          <button onClick={() => void loadActivityBinding()}>Aggiorna stato</button>
        </> : activityPairing && activityPairing.expiresAt > Date.now() ? <>
          <p>Apri la Activity in Discord e inserisci questo codice master. È monouso e scade alle {new Date(activityPairing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>
          <div className="discord-pairing-code" aria-label={`Codice pairing ${activityPairing.pairingCode}`}>{activityPairing.pairingCode}</div>
          <div className="actions"><button disabled={busyAction === 'discord-pairing'} onClick={() => void createActivityPairing()}>Rigenera</button><button onClick={() => void loadActivityBinding()}>Ho collegato l’Activity</button></div>
        </> : <>
          <p>Genera un codice breve da inserire nella Discord Activity del master. Il codice serve solo al pairing dell’istanza e non sostituisce il codice giocatore web.</p>
          <button className="primary" disabled={busyAction === 'discord-pairing' || !live.connected} onClick={() => void createActivityPairing()}>{busyAction === 'discord-pairing' ? 'Genero…' : 'Genera pairing'}</button>
        </>}
      </section>

      <section className="live-card participants-card">
        <div className="live-card-heading"><div><span className="eyebrow">PARTECIPANTI</span><h2>{live.participants.length} al tavolo</h2></div><button onClick={() => void command({ action: 'live:refresh' })}>Aggiorna</button></div>
        {live.participants.length ? <div className="participant-list">{live.participants.map(participant => <div className="participant-row" key={participant.participantId}>
          <span className={`presence-dot ${participant.connected ? 'online' : ''}`} aria-label={participant.connected ? 'Connesso' : 'Disconnesso'} />
          <div><strong>{participant.displayName}</strong><small>{participant.connected ? 'Connesso' : 'Disconnesso'} · {participant.tokenIds.length ? `${participant.tokenIds.length} token assegnat${participant.tokenIds.length === 1 ? 'o' : 'i'}` : 'nessun token'}</small></div>
          <button onClick={() => void command({ action: 'live:removeParticipant', participantId: participant.participantId })}>Rimuovi</button>
        </div>)}</div> : <p className="live-empty-list">Nessun giocatore è ancora entrato.</p>}
      </section>

      <section className="live-card live-scene-card">
        <div className="live-card-heading">
          <div><span className="eyebrow">SCENA</span><h2>{live.presentation === 'board' ? live.liveBoards.find(board => board.boardId === live.activeBoardId)?.title ?? 'Board live' : 'In attesa'}</h2></div>
          {live.presentation === 'board' && <div className="actions"><button onClick={() => void run('focus', { action: 'live:focusPlayers' })}>Porta tutti qui</button><button onClick={() => void run('unpublish', { action: 'live:unpublish' })}>Smetti di condividere</button></div>}
        </div>
        {!boards.length ? <p className="live-empty-list">Crea almeno una board locale per condividerla.</p> : <>
          <label className="live-board-picker"><span>Board preparata</span><select value={selectedPath} onChange={event => setSelectedPath(event.target.value)}>{boards.map(board => <option value={board.path} key={board.boardId}>{board.title}{board.boardId === live.activeBoardId ? ' · attiva' : live.liveBoards.some(item => item.boardId === board.boardId) ? ' · già usata' : ''}</option>)}</select></label>
          <div className="actions">
            <button className="primary" disabled={!selectedPath || busyAction === 'publish'} onClick={() => void publishSelected()}>{selectedIsActive ? 'Già condivisa' : selectedWasPublished ? 'Passa a questa board' : 'Pubblica board'}</button>
            {selectedIsActive && <button disabled={busyAction === 'reset'} onClick={() => void resetSelected()}>Reimposta da preparata</button>}
          </div>
          <p>{selectedWasPublished && !selectedIsActive ? 'Questa board conserva il proprio stato live: tornando qui ritroverai reveal/hide e posizioni runtime.' : live.presentation === 'waiting' ? 'I giocatori restano nella schermata di attesa finché non pubblichi una board.' : 'La scena attiva viene inviata come snapshot pubblico e poi aggiornata con piccoli eventi.'}</p>
        </>}
      </section>

      {selectedIsActive && elementList && <section className="live-card live-elements-card">
        <div className="live-card-heading"><div><span className="eyebrow">VISIBILITÀ LIVE</span><h2>{elementList.elements.length} elementi preparati</h2></div><span className="live-seq">seq {live.stateSeq}</span></div>
        <div className="live-element-list">{elementList.elements.map(element => {
          const visible = activeIds.has(element.elementId);
          const controller = element.type === 'token' ? live.participants.find(participant => participant.tokenIds.includes(element.elementId)) : undefined;
          return <div className={`live-element-row ${element.type === 'token' ? 'token-row' : ''}`} key={element.elementId}>
            <span className={`live-element-dot ${visible ? 'visible' : ''}`} />
            <div className="live-element-main"><strong>{element.label || element.type}</strong><small>{element.type}{element.visibleByDefault ? ' · pubblico di default' : ' · privato di default'}</small>{element.type === 'token' && <label className="token-controller"><span>Controller</span><select aria-label={`Controller di ${element.label || 'token'}`} disabled={!visible || busyAction === `controller:${element.elementId}`} value={controller?.participantId ?? ''} onChange={event => void setTokenController(element.elementId, event.target.value)}><option value="">Solo master</option>{live.participants.map(participant => <option key={participant.participantId} value={participant.participantId}>{participant.displayName}{participant.connected ? '' : ' · offline'}</option>)}</select></label>}</div>
            <button disabled={busyAction === `element:${element.elementId}`} onClick={() => void toggleElement(element)}>{visible ? 'Nascondi' : 'Rivela'}</button>
          </div>;
        })}</div>
      </section>}

      {endPrompt && <section className="live-card live-end-card" role="dialog" aria-label="Termina sessione">
        <span className="eyebrow">FINE SESSIONE</span>
        <h2>Quali posizioni token vuoi mantenere?</h2>
        <p>La sessione verrà chiusa definitivamente. Puoi copiare nelle board locali soltanto le posizioni finali dei token, oppure lasciare le board preparate esattamente com’erano.</p>
        <div className="actions">
          <button onClick={() => setEndPrompt(false)}>Annulla</button>
          <button disabled={busyAction === 'end'} onClick={() => void run('end', { action: 'live:end', savePositions: false })}>Lascia la board com’era</button>
          <button className="danger" disabled={busyAction === 'end'} onClick={() => void run('end', { action: 'live:end', savePositions: true })}>Salva sulla board</button>
        </div>
      </section>}
      {(message || live.error) && <section className="live-card live-error" role="alert">{message ?? live.error}</section>}
    </div>}
  </section>;
}
