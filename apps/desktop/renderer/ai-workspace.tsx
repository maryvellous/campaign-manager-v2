import { useEffect, useState, type FormEvent } from 'react';
import type { AiState } from '../application/ai-service';
import { AI_PROVIDER_MODELS, DEFAULT_AI_MODELS, type AiContextSelection, type AiModel, type AiProposal, type AiProviderId } from '../../../packages/ai/src/index';

type Reply = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
type Command = (input: Record<string, unknown>) => Promise<Reply>;

const providerLabel: Record<AiProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  deepseek: 'DeepSeek',
};

const modelLabel: Record<AiModel, string> = {
  'gpt-5.6-luna': 'GPT-5.6 Luna',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite',
  'deepseek-flash': 'DeepSeek Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
};

export function AiSettingsPanel({ state, command }: { state: AiState; command: Command }) {
  const [key, setKey] = useState('');
  const [provider, setProvider] = useState<AiProviderId>(state.provider);
  const [model, setModel] = useState<AiModel>(state.model);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    setProvider(state.provider);
    setModel(state.model);
  }, [state.provider, state.model]);

  const configuredSelected = state.configured && provider === state.provider;
  const models = AI_PROVIDER_MODELS[provider];

  function chooseProvider(next: AiProviderId) {
    setProvider(next);
    setModel(next === state.provider ? state.model : DEFAULT_AI_MODELS[next]);
    setKey('');
    setMessage(undefined);
  }

  async function configure() {
    if (!key.trim()) return;
    setBusy(true); setMessage(undefined);
    try {
      const reply = await command({ action: 'ai:configure', provider, apiKey: key, model });
      if (!reply.ok) setMessage(reply.error?.message ?? 'Configurazione non riuscita.');
      else { setKey(''); setMessage(`${providerLabel[provider]} configurato.`); }
    } catch {
      setMessage('Configurazione non riuscita.');
    } finally { setBusy(false); }
  }

  async function changeModel(next: AiModel) {
    setModel(next);
    if (!configuredSelected) return;
    const reply = await command({ action: 'ai:setModel', model: next });
    if (!reply.ok) setMessage(reply.error?.message ?? 'Modello non aggiornato.');
    else setMessage('Modello aggiornato.');
  }

  async function clear() {
    setBusy(true); setMessage(undefined);
    try {
      const reply = await command({ action: 'ai:clearConfiguration' });
      if (!reply.ok) setMessage(reply.error?.message ?? 'Configurazione non rimossa.');
      else setMessage('Provider disattivato.');
    } finally { setBusy(false); }
  }

  return <section className="ai-settings">
    <div className="ai-settings-heading">
      <div><h2>Assistente IA</h2><p className="muted">Provider supportati: OpenAI, Anthropic, Google Gemini e DeepSeek. La chiave resta nel profilo locale dell’app e non viene scritta nella campagna.</p></div>
      <span className={'status-pill' + (state.configured ? ' ready' : '')}>{state.configured ? `Configurato · ${providerLabel[state.provider]}` : 'Non configurato'}</span>
    </div>
    <div className="ai-settings-form">
      <label><span>Provider</span><select value={provider} onChange={event => chooseProvider(event.target.value as AiProviderId)}>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
        <option value="google">Google Gemini</option>
        <option value="deepseek">DeepSeek</option>
      </select></label>
      <label><span>Modello</span><select value={model} onChange={event => void changeModel(event.target.value as AiModel)}>{models.map(value => <option value={value} key={value}>{modelLabel[value]}</option>)}</select></label>
      {configuredSelected ? <button type="button" disabled={busy} onClick={() => void clear()}>Rimuovi configurazione</button> : <>
        <label><span>API key {providerLabel[provider]}</span><input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder="Incolla la chiave API" /></label>
        <button className="primary" type="button" disabled={busy || !key.trim()} onClick={() => void configure()}>{busy ? 'Salvataggio…' : `Configura ${providerLabel[provider]}`}</button>
      </>}
    </div>
    {state.configured && !configuredSelected && <p className="muted">Attualmente è attivo {providerLabel[state.provider]}. Configurando {providerLabel[provider]} diventerà il provider attivo.</p>}
    {message && <p className="ai-settings-message" role="status">{message}</p>}
  </section>;
}
const statusText: Partial<Record<AiState['status'], string>> = {
  thinking: 'Sto preparando la risposta…',
  cancelled: 'Richiesta annullata.',
  offline: 'Il provider non è raggiungibile.',
  'auth/provider_key_invalid': 'La chiave API non è valida o non è autorizzata.',
  rate_limited: 'Limite del provider raggiunto. Riprova più tardi.',
  provider_error: 'Il provider ha restituito un errore.',
  context_too_large: 'Il contesto scelto è troppo grande per una singola richiesta.',
  source_missing: 'Una delle fonti scelte non è più disponibile.',
  proposal_stale: 'La nota è cambiata dopo la creazione della proposta.',
  save_conflict: 'La proposta non può essere salvata senza risolvere un conflitto.',
};

function contextLabel(context: AiContextSelection): string {
  if (context.kind === 'campaign') return 'Campagna intera';
  const title = context.noteId.split('/').at(-1)?.replace(/\.md$/iu, '') ?? context.noteId;
  return context.kind === 'note' ? `Nota · ${title}` : `Selezione · ${title}`;
}


function ProposalPanel({
  proposal,
  folders,
  command,
  onApplied,
}: {
  proposal: AiProposal;
  folders: string[];
  command: Command;
  onApplied: (noteId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [markdown, setMarkdown] = useState(proposal.kind === 'edit' ? proposal.proposedMarkdown : proposal.markdown);
  const [title, setTitle] = useState(proposal.kind === 'new' ? proposal.title : '');
  const [parentFolder, setParentFolder] = useState(proposal.kind === 'new' ? proposal.parentFolder : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setEditing(false);
    setMarkdown(proposal.kind === 'edit' ? proposal.proposedMarkdown : proposal.markdown);
    setTitle(proposal.kind === 'new' ? proposal.title : '');
    setParentFolder(proposal.kind === 'new' ? proposal.parentFolder : '');
    setError(undefined);
  }, [proposal.id]);

  async function persistDraft(): Promise<boolean> {
    const reply = proposal.kind === 'edit'
      ? await command({ action: 'ai:updateProposal', markdown })
      : await command({ action: 'ai:updateProposal', title, parentFolder, markdown });
    if (!reply.ok) { setError(reply.error?.message ?? 'Proposta non aggiornata.'); return false; }
    return true;
  }

  async function apply() {
    setBusy(true); setError(undefined);
    try {
      if (!(await persistDraft())) return;
      const reply = await command({ action: 'ai:applyProposal' });
      if (!reply.ok) { setError(reply.error?.message ?? 'Applicazione non riuscita.'); return; }
      const noteId = (reply.data as { noteId?: unknown } | undefined)?.noteId;
      if (typeof noteId === 'string') onApplied(noteId);
    } finally { setBusy(false); }
  }

  async function saveEdits() {
    setBusy(true); setError(undefined);
    try { if (await persistDraft()) setEditing(false); }
    finally { setBusy(false); }
  }

  async function discard() {
    setBusy(true); setError(undefined);
    try {
      const reply = await command({ action: 'ai:discardProposal' });
      if (!reply.ok) setError(reply.error?.message ?? 'Proposta non scartata.');
    } finally { setBusy(false); }
  }

  return <section className="ai-proposal" aria-label="Proposta IA da approvare">
    <div className="ai-proposal-heading">
      <div><span className="eyebrow">PROPOSTA, NON ANCORA APPLICATA</span><h2>{proposal.kind === 'edit' ? `Modifica · ${proposal.title}` : 'Nuova nota'}</h2></div>
      <span className="status-pill">Richiede approvazione</span>
    </div>
    {proposal.kind === 'edit' ? editing
      ? <label className="ai-proposal-editor"><span>Markdown proposto</span><textarea value={markdown} onChange={event => setMarkdown(event.target.value)} /></label>
      : <div className="ai-proposal-diff"><section><strong>Prima</strong><pre>{proposal.originalMarkdown}</pre></section><section><strong>Proposta</strong><pre>{proposal.proposedMarkdown}</pre></section></div>
      : editing
        ? <div className="ai-proposal-editor">
          <label><span>Titolo</span><input value={title} onChange={event => setTitle(event.target.value)} /></label>
          <label><span>Cartella</span><select value={parentFolder} onChange={event => setParentFolder(event.target.value)}><option value="">Cartella principale</option>{folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}</select></label>
          <label><span>Markdown</span><textarea value={markdown} onChange={event => setMarkdown(event.target.value)} /></label>
        </div>
        : <div className="ai-new-preview"><dl><dt>Titolo</dt><dd>{proposal.title}</dd><dt>Cartella</dt><dd>{proposal.parentFolder || 'Cartella principale'}</dd></dl><pre>{proposal.markdown}</pre></div>}
    {error && <p className="ai-proposal-error" role="alert">{error}</p>}
    <div className="ai-proposal-actions">
      {editing ? <button disabled={busy} onClick={() => void saveEdits()}>Fine modifica</button> : <button disabled={busy} onClick={() => setEditing(true)}>Modifica proposta</button>}
      <button className="primary" disabled={busy} onClick={() => void apply()}>{proposal.kind === 'edit' ? 'Applica' : 'Crea nota'}</button>
      <button disabled={busy} onClick={() => void discard()}>Scarta</button>
    </div>
  </section>;
}

export function AiWorkspace({
  state,
  command,
  context,
  onContextChange,
  onOpenSettings,
  onOpenNote,
  folders,
}: {
  state: AiState;
  command: Command;
  context: AiContextSelection;
  onContextChange: (context: AiContextSelection) => void;
  onOpenSettings: () => void;
  onOpenNote: (noteId: string) => void;
  folders: string[];
}) {
  const [prompt, setPrompt] = useState('');
  const [localError, setLocalError] = useState<string>();
  const [notice, setNotice] = useState<{ noteId: string; text: string }>();

  async function acceptPrivacy() {
    const reply = await command({ action: 'ai:acceptPrivacy' });
    if (!reply.ok) setLocalError(reply.error?.message ?? 'Conferma non riuscita.');
  }

  async function proposeEdit() {
    if (context.kind !== 'note') return;
    setLocalError(undefined);
    const reply = await command({ action: 'ai:proposeEdit', noteId: context.noteId });
    if (!reply.ok) setLocalError(reply.error?.message ?? 'Proposta non generata.');
  }

  async function proposeNew() {
    setLocalError(undefined);
    const reply = await command({ action: 'ai:proposeNew', context });
    if (!reply.ok) setLocalError(reply.error?.message ?? 'Proposta non generata.');
  }

  async function newConversation() {
    if (state.proposal && !window.confirm('La proposta non applicata verrà scartata insieme alla conversazione. Continuare?')) return;
    setNotice(undefined);
    const reply = await command({ action: 'ai:newConversation' });
    if (!reply.ok) setLocalError(reply.error?.message ?? 'Conversazione non azzerata.');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || state.status === 'thinking') return;
    setLocalError(undefined);
    setPrompt('');
    const reply = await command({ action: 'ai:send', prompt: value, context });
    if (!reply.ok) { setPrompt(value); setLocalError(reply.error?.message ?? 'Richiesta non riuscita.'); }
  }

  if (!state.configured) return <section className="ai-empty">
    <span className="ai-mark" aria-hidden="true">✦</span>
    <span className="eyebrow">ASSISTENTE IA</span>
    <h1>Configura un provider per iniziare.</h1>
    <p>L’Assistente è opzionale. Note, board e sessioni continuano a funzionare normalmente anche senza IA.</p>
    <button className="primary" onClick={onOpenSettings}>Apri impostazioni IA</button>
  </section>;

  return <section className="ai-workspace">
    <header className="ai-header">
      <div><span className="eyebrow">ASSISTENTE IA</span><h1>Assistente</h1><p>{providerLabel[state.provider]} · {modelLabel[state.model]}</p></div>
      <button disabled={state.status === 'thinking' || state.messages.length === 0} onClick={() => void newConversation()}>Nuova conversazione</button>
    </header>

    <div className="ai-context-bar" aria-label="Contesto della richiesta">
      <span>Contesto</span>
      <strong>{contextLabel(context)}</strong>
      {context.kind !== 'campaign' && <button onClick={() => onContextChange({ kind: 'campaign' })}>Usa campagna intera</button>}
    </div>

    {!state.privacyAccepted && <section className="ai-privacy" role="note">
      <strong>Prima del primo invio</strong>
      <p>Il testo necessario alla richiesta e le sole note recuperate o scelte verranno inviati a {providerLabel[state.provider]}. Campaign Manager non invia automaticamente l’intero vault, asset, recovery o credenziali.</p>
      <button className="primary" onClick={() => void acceptPrivacy()}>Ho capito, continua</button>
    </section>}

    {notice && <section className="ai-apply-notice" role="status"><span>{notice.text}</span><button onClick={() => onOpenNote(notice.noteId)}>Apri nota</button></section>}
    {state.proposal && <ProposalPanel proposal={state.proposal} folders={folders} command={command} onApplied={noteId => setNotice({ noteId, text: state.proposal?.kind === 'new' ? 'Nuova nota creata.' : 'Modifica applicata.' })} />}

    <div className="ai-thread" aria-live="polite">
      {state.messages.length === 0 ? <div className="ai-thread-empty"><span aria-hidden="true">✦</span><h2>Da dove cominciamo?</h2><p>Fai una domanda sulla campagna, oppure apri una nota e usa “Chiedi all’IA” per limitarne il contesto.</p></div> : state.messages.map(message => <article className={'ai-message ' + message.role} key={message.id}>
        <span>{message.role === 'user' ? 'Tu' : 'Assistente'}</span>
        <div>{message.content}</div>
        {!!message.sources?.length && <div className="ai-sources"><small>Fonti usate</small>{message.sources.map(source => <button type="button" key={source.noteId} onClick={() => onOpenNote(source.noteId)}><strong>{source.title}</strong><span>{source.relativePath}</span></button>)}</div>}
      </article>)}
      {(state.error || localError || statusText[state.status]) && state.status !== 'ready' && <div className={'ai-status ' + state.status} role="status">{localError ?? state.error ?? statusText[state.status]}</div>}
    </div>

    <form className="ai-composer" onSubmit={send}>
      <textarea aria-label="Messaggio per l’assistente" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={state.privacyAccepted ? 'Scrivi una domanda…' : 'Conferma prima l’invio al provider'} disabled={!state.privacyAccepted || state.status === 'thinking'} />
      <div className="ai-proposal-triggers">
        <button type="button" disabled={!state.privacyAccepted || state.status === 'thinking' || !!state.proposal || state.messages.length === 0 || context.kind !== 'note'} onClick={() => void proposeEdit()}>Proponi modifica alla nota</button>
        <button type="button" disabled={!state.privacyAccepted || state.status === 'thinking' || !!state.proposal || state.messages.length === 0} onClick={() => void proposeNew()}>Proponi nuova nota</button>
      </div>
      <div className="ai-composer-actions">
        <span>{state.status === 'thinking' ? 'Generazione in corso' : 'Nessuna modifica ai file viene applicata automaticamente.'}</span>
        {state.status === 'thinking' ? <button type="button" onClick={() => void command({ action: 'ai:cancel' })}>Annulla</button> : <button className="primary" type="submit" disabled={!state.privacyAccepted || !prompt.trim()}>Invia</button>}
      </div>
    </form>
  </section>;
}
