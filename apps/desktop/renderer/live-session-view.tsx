import { useEffect, useMemo, useState } from 'react';
import type { DesktopLiveState } from '../application/live-session-client';

type Reply = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
type Command = (input: Record<string, unknown>) => Promise<Reply>;
type BoardItem = { path: string; title: string; boardId: string };
type ElementItem = { elementId: string; type: string; visibleByDefault: boolean; label: string };
type ElementList = { boardPath: string; boardId: string; title: string; elements: ElementItem[] };

export function LiveSessionView({ live, command }: { live: DesktopLiveState; command: Command }) {
  const active = !!live.liveSessionId;
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [elementList, setElementList] = useState<ElementList>();
  const [working, setWorking] = useState(false);
  const [localError, setLocalError] = useState<string>();

  const selectedBoard = boards.find(board => board.path === selectedPath);
  const activePreparedBoard = boards.find(board => board.boardId === live.activeBoardId);
  const selectedIsActive = !!selectedBoard && selectedBoard.boardId === live.activeBoardId;
  const selectedUsedBefore = !!selectedBoard && live.liveBoards.some(board => board.boardId === selectedBoard.boardId);
  const publicIds = useMemo(() => new Set(live.activeElementIds), [live.activeElementIds]);

  useEffect(() => {
    if (!active) { setBoards([]); setSelectedPath(''); setElementList(undefined); return; }
    let alive = true;
    void command({ action: 'live:boards' }).then(reply => {
      if (!alive) return;
      if (!reply.ok) { setLocalError(reply.error?.message ?? 'Board non disponibili.'); return; }
      const list = (Array.isArray(reply.data) ? reply.data : []) as BoardItem[];
      setBoards(list);
      setSelectedPath(current => {
        if (current && list.some(board => board.path === current)) return current;
        const liveBoard = list.find(board => board.boardId === live.activeBoardId);
        return liveBoard?.path ?? list[0]?.path ?? '';
      });
    });
    return () => { alive = false; };
  }, [active, command, live.activeBoardId]);

  useEffect(() => {
    if (!active || !selectedPath) { setElementList(undefined); return; }
    let alive = true;
    void command({ action: 'live:elements', path: selectedPath }).then(reply => {
      if (!alive) return;
      if (!reply.ok) { setLocalError(reply.error?.message ?? 'Elementi board non disponibili.'); return; }
      setElementList(reply.data as ElementList);
    });
    return () => { alive = false; };
  }, [active, command, selectedPath, live.stateSeq]);

  async function run(input: Record<string, unknown>) {
    setWorking(true); setLocalError(undefined);
    try {
      const reply = await command(input);
      if (!reply.ok) setLocalError(reply.error?.message ?? 'Operazione live non riuscita.');
      return reply.ok;
    } finally { setWorking(false); }
  }

  async function publishSelected() {
    if (!selectedPath) return;
    await run({ action: 'live:publishBoard', path: selectedPath });
  }

  async function resetSelected() {
    if (!selectedPath) return;
    if (!confirm('Reimpostare la scena live dalla board preparata? Reveal, hide e modifiche runtime di questa board verranno scartati.')) return;
    await run({ action: 'live:resetBoard', path: selectedPath });
  }

  return <section className="live-view">
    <header className="live-view-header">
      <div><span className="eyebrow">V0.3 · LIVE WEB</span><h1>Sessione live</h1><p>Fai entrare i giocatori dal browser. La campagna resta sul tuo computer.</p></div>
      <span className={`live-status ${live.connected ? 'online' : ''}`}>{active ? live.connected ? 'Relay connesso' : 'Riconnessione' : 'Nessuna sessione'}</span>
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

      <section className="live-card live-scene-card">
        <div className="live-card-heading"><div><span className="eyebrow">SCENA</span><h2>{activePreparedBoard?.title ?? 'In attesa'}</h2></div>{live.presentation === 'board' && <span className="live-scene-badge">Condivisa</span>}</div>
        <label className="live-board-select"><span>Board preparata</span><select value={selectedPath} onChange={event => setSelectedPath(event.target.value)} disabled={working || !boards.length}><option value="">{boards.length ? 'Scegli una board' : 'Nessuna board disponibile'}</option>{boards.map(board => <option key={board.boardId} value={board.path}>{board.title}{board.boardId === live.activeBoardId ? ' · live' : live.liveBoards.some(item => item.boardId === board.boardId) ? ' · usata' : ''}</option>)}</select></label>
        <div className="actions live-scene-actions">
          <button className="primary" disabled={!selectedPath || working || selectedIsActive} onClick={() => void publishSelected()}>{selectedUsedBefore ? 'Passa a questa board' : 'Pubblica board'}</button>
          {selectedIsActive && <button disabled={working} onClick={() => void resetSelected()}>Reimposta da preparata</button>}
          {live.presentation === 'board' && <button disabled={working} onClick={() => void run({ action: 'live:unpublish' })}>Smetti di condividere</button>}
        </div>
        <p>{live.presentation === 'board' ? 'Lo stato live della board resta separato dal file preparato. Cambiare scena non azzera reveal e hide già fatti.' : 'I giocatori sono nella schermata di attesa.'}</p>
      </section>

      <section className="live-card participants-card">
        <div className="live-card-heading"><div><span className="eyebrow">PARTECIPANTI</span><h2>{live.participants.length} al tavolo</h2></div><button onClick={() => void command({ action: 'live:refresh' })}>Aggiorna</button></div>
        {live.participants.length ? <div className="participant-list">{live.participants.map(participant => <div className="participant-row" key={participant.participantId}>
          <span className={`presence-dot ${participant.connected ? 'online' : ''}`} aria-label={participant.connected ? 'Connesso' : 'Disconnesso'} />
          <div><strong>{participant.displayName}</strong><small>{participant.connected ? 'Connesso' : 'Disconnesso'}</small></div>
          <button onClick={() => void command({ action: 'live:removeParticipant', participantId: participant.participantId })}>Rimuovi</button>
        </div>)}</div> : <p className="live-empty-list">Nessun giocatore è ancora entrato.</p>}
      </section>

      <section className="live-card">
        <div className="live-card-heading"><div><span className="eyebrow">INGRESSI</span><h2>Nuovi giocatori</h2></div><label className="live-switch"><input type="checkbox" checked={live.acceptingJoins} onChange={event => void command({ action: 'live:setAccepting', acceptingJoins: event.target.checked })} /><span>{live.acceptingJoins ? 'Aperti' : 'Chiusi'}</span></label></div>
        <p>{live.acceptingJoins ? 'Chi ha un codice valido entra direttamente.' : 'I nuovi join sono bloccati; i partecipanti esistenti possono riconnettersi.'}</p>
      </section>

      <section className="live-card live-elements-card">
        <div className="live-card-heading"><div><span className="eyebrow">VISIBILITÀ</span><h2>Elementi della board</h2></div>{selectedIsActive && <small>{live.activeElementIds.length} pubblici</small>}</div>
        {!selectedPath ? <p className="live-empty-list">Scegli una board.</p> : !selectedIsActive ? <p className="live-empty-list">Attiva questa board per gestire reveal e hide.</p> : elementList?.elements.length ? <div className="live-element-list">{elementList.elements.map(element => {
          const isPublic = publicIds.has(element.elementId);
          return <div className="live-element-row" key={element.elementId}>
            <span className={`visibility-dot ${isPublic ? 'public' : ''}`} />
            <div><strong>{element.label || element.type}</strong><small>{element.type}{element.visibleByDefault ? ' · pubblico di default' : ' · privato di default'}</small></div>
            <button disabled={working} onClick={() => void run(isPublic ? { action: 'live:hideElement', elementId: element.elementId } : { action: 'live:revealElement', path: selectedPath, elementId: element.elementId })}>{isPublic ? 'Nascondi' : 'Rivela'}</button>
          </div>;
        })}</div> : <p className="live-empty-list">Questa board non contiene elementi.</p>}
      </section>

      {(localError || live.error) && <section className="live-card live-error" role="alert">{localError ?? live.error}<button onClick={() => setLocalError(undefined)}>Chiudi</button></section>}
    </div>}
  </section>;
}
