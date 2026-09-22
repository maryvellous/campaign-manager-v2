import type { DesktopLiveState } from '../application/live-session-client';

type Reply = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
type Command = (input: Record<string, unknown>) => Promise<Reply>;

export function LiveSessionView({ live, command }: { live: DesktopLiveState; command: Command }) {
  const active = !!live.liveSessionId;
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

      <section className="live-card">
        <div className="live-card-heading"><div><span className="eyebrow">INGRESSI</span><h2>Nuovi giocatori</h2></div><label className="live-switch"><input type="checkbox" checked={live.acceptingJoins} onChange={event => void command({ action: 'live:setAccepting', acceptingJoins: event.target.checked })} /><span>{live.acceptingJoins ? 'Aperti' : 'Chiusi'}</span></label></div>
        <p>{live.acceptingJoins ? 'Chi ha un codice valido entra direttamente.' : 'I nuovi join sono bloccati; i partecipanti esistenti possono riconnettersi.'}</p>
      </section>

      <section className="live-card participants-card">
        <div className="live-card-heading"><div><span className="eyebrow">PARTECIPANTI</span><h2>{live.participants.length} al tavolo</h2></div><button onClick={() => void command({ action: 'live:refresh' })}>Aggiorna</button></div>
        {live.participants.length ? <div className="participant-list">{live.participants.map(participant => <div className="participant-row" key={participant.participantId}>
          <span className={`presence-dot ${participant.connected ? 'online' : ''}`} aria-label={participant.connected ? 'Connesso' : 'Disconnesso'} />
          <div><strong>{participant.displayName}</strong><small>{participant.connected ? 'Connesso' : 'Disconnesso'}</small></div>
          <button onClick={() => void command({ action: 'live:removeParticipant', participantId: participant.participantId })}>Rimuovi</button>
        </div>)}</div> : <p className="live-empty-list">Nessun giocatore è ancora entrato.</p>}
      </section>

      <section className="live-card waiting-card-dm">
        <span className="eyebrow">CONDIVISIONE</span><h2>In attesa</h2>
        <p>I giocatori collegati vedono la schermata di attesa. La pubblicazione delle board arriva nel prossimo goal V03-2.</p>
      </section>
      {live.error && <section className="live-card live-error" role="alert">{live.error}</section>}
    </div>}
  </section>;
}
