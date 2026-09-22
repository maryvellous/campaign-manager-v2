import { useEffect, useState, type FormEvent } from 'react';
import type { AiState } from '../application/ai-service';
import { OPENAI_MODELS, type OpenAiModel } from '../../../packages/ai/src/index';

type Reply = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
type Command = (input: Record<string, unknown>) => Promise<Reply>;

const modelLabel: Record<OpenAiModel, string> = {
  'gpt-5.6-luna': 'GPT-5.6 Luna',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
};

export function AiSettingsPanel({ state, command }: { state: AiState; command: Command }) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState<OpenAiModel>(state.model);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => setModel(state.model), [state.model]);

  async function configure(event: FormEvent) {
    event.preventDefault();
    if (!key.trim()) return;
    setBusy(true); setMessage(undefined);
    try {
      const reply = await command({ action: 'ai:configure', apiKey: key, model });
      if (!reply.ok) setMessage(reply.error?.message ?? 'Configurazione non riuscita.');
      else { setKey(''); setMessage('Provider configurato.'); }
    } catch {
      setMessage('Configurazione non riuscita.');
    } finally { setBusy(false); }
  }

  async function changeModel(next: OpenAiModel) {
    setModel(next);
    if (!state.configured) return;
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
      <div><h2>Assistente IA</h2><p className="muted">Provider supportato: OpenAI. La chiave resta nel profilo locale dell’app e non viene scritta nella campagna.</p></div>
      <span className={'status-pill' + (state.configured ? ' ready' : '')}>{state.configured ? 'Configurato' : 'Non configurato'}</span>
    </div>
    {state.configured ? <div className="ai-settings-form">
      <label><span>Modello</span><select value={model} onChange={event => void changeModel(event.target.value as OpenAiModel)}>{OPENAI_MODELS.map(value => <option value={value} key={value}>{modelLabel[value]}</option>)}</select></label>
      <button type="button" disabled={busy} onClick={() => void clear()}>Rimuovi configurazione</button>
    </div> : <form className="ai-settings-form" onSubmit={configure}>
      <label><span>API key OpenAI</span><input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder="Incolla la chiave API" /></label>
      <label><span>Modello</span><select value={model} onChange={event => setModel(event.target.value as OpenAiModel)}>{OPENAI_MODELS.map(value => <option value={value} key={value}>{modelLabel[value]}</option>)}</select></label>
      <button className="primary" type="submit" disabled={busy || !key.trim()}>{busy ? 'Salvataggio…' : 'Configura OpenAI'}</button>
    </form>}
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
  context_too_large: 'La richiesta è troppo grande per il provider.',
};

export function AiWorkspace({ state, command, onOpenSettings }: { state: AiState; command: Command; onOpenSettings: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [localError, setLocalError] = useState<string>();

  async function acceptPrivacy() {
    const reply = await command({ action: 'ai:acceptPrivacy' });
    if (!reply.ok) setLocalError(reply.error?.message ?? 'Conferma non riuscita.');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || state.status === 'thinking') return;
    setLocalError(undefined);
    setPrompt('');
    const reply = await command({ action: 'ai:send', prompt: value });
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
      <div><span className="eyebrow">ASSISTENTE IA</span><h1>Assistente</h1><p>OpenAI · {modelLabel[state.model]}</p></div>
      <button disabled={state.status === 'thinking' || state.messages.length === 0} onClick={() => void command({ action: 'ai:newConversation' })}>Nuova conversazione</button>
    </header>

    {!state.privacyAccepted && <section className="ai-privacy" role="note">
      <strong>Prima del primo invio</strong>
      <p>Il testo necessario alla richiesta verrà inviato a OpenAI. Campaign Manager non invia automaticamente l’intero vault, asset, recovery o credenziali.</p>
      <button className="primary" onClick={() => void acceptPrivacy()}>Ho capito, continua</button>
    </section>}

    <div className="ai-thread" aria-live="polite">
      {state.messages.length === 0 ? <div className="ai-thread-empty"><span aria-hidden="true">✦</span><h2>Da dove cominciamo?</h2><p>Per ora puoi fare domande generali. Il contesto automatico della campagna verrà aggiunto nel prossimo passaggio della V0.5.</p></div> : state.messages.map(message => <article className={'ai-message ' + message.role} key={message.id}>
        <span>{message.role === 'user' ? 'Tu' : 'Assistente'}</span>
        <div>{message.content}</div>
      </article>)}
      {(state.error || localError || statusText[state.status]) && state.status !== 'ready' && <div className={'ai-status ' + state.status} role="status">{localError ?? state.error ?? statusText[state.status]}</div>}
    </div>

    <form className="ai-composer" onSubmit={send}>
      <textarea aria-label="Messaggio per l’assistente" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={state.privacyAccepted ? 'Scrivi una domanda…' : 'Conferma prima l’invio al provider'} disabled={!state.privacyAccepted || state.status === 'thinking'} />
      <div className="ai-composer-actions">
        <span>{state.status === 'thinking' ? 'Generazione in corso' : 'Nessuna modifica ai file viene applicata automaticamente.'}</span>
        {state.status === 'thinking' ? <button type="button" onClick={() => void command({ action: 'ai:cancel' })}>Annulla</button> : <button className="primary" type="submit" disabled={!state.privacyAccepted || !prompt.trim()}>Invia</button>}
      </div>
    </form>
  </section>;
}
