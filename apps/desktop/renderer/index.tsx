import { MarkdownView } from './markdown-view';
import { parseWikiLinks, resolveWikiLink } from '../../../packages/core/src/markdown';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppState, DocumentSession } from '../application/campaign-service';
import { Icon, Palette, PanelHandle, type IconName, type PaletteItem } from './shell-components';
import './style.css';
type View = 'notes' | 'search' | 'graph' | 'compendium' | 'recent' | 'favorites' | 'settings';
type ShellDocument = DocumentSession;
interface UiState { view: View; selectedFolder: string; favorites: string[]; recentNotes: string[]; expandedFolders: string[]; sidebarWidth: number; inspectorWidth: number; sidebarCollapsed: boolean; inspectorCollapsed: boolean; folderColors: Record<string, string> }
type ShellState = AppState;
type Reply = { data?: unknown; ok: boolean; state?: ShellState; error?: { code: string; message: string } };
declare global { interface Window { campaign: { beforeClose: (listener: () => void) => () => void; command: (input: Record<string, unknown>) => Promise<Reply>; subscribe: (listener: (state: ShellState) => void) => () => void } } }
const defaults: UiState = { view: 'notes', selectedFolder: '', favorites: [], recentNotes: [], expandedFolders: [], sidebarWidth: 248, inspectorWidth: 265, sidebarCollapsed: false, inspectorCollapsed: false, folderColors: {} };
const labels = { clean: 'Salvato', dirty: 'Modifiche da salvare', saving: 'Salvataggio…', error: 'Salvataggio non riuscito', conflict: 'Conflitto con il disco', missing: 'File non disponibile' };
const navigation: { id: View; label: string; icon: IconName }[] = [{ id: 'notes', label: 'Note', icon: 'note' }, { id: 'search', label: 'Ricerca', icon: 'search' }, { id: 'graph', label: 'Grafo', icon: 'graph' }, { id: 'compendium', label: 'Compendio', icon: 'book' }, { id: 'recent', label: 'Recenti', icon: 'clock' }, { id: 'favorites', label: 'Preferiti', icon: 'star' }, { id: 'settings', label: 'Impostazioni', icon: 'settings' }];
const stem = (id: string) => id.split('/').at(-1)?.replace(/\.md$/iu, '') ?? '';
const parent = (id: string) => id.split('/').slice(0, -1).join('/');
const title = (doc?: ShellDocument) => !doc ? 'Nuova tab' : doc.draft ? doc.draft.manualTitle || 'Nuova nota' : stem(doc.noteId);
type Operation = { kind: 'folder' | 'rename' | 'move' | 'saveAs'; id: string; value: string };
function App() {
  const [modes, setModes] = useState<Record<string, boolean>>({}); const [wiki, setWiki] = useState<string>();
  const modesRef = useRef(modes); modesRef.current = modes; const readingPositions = useRef(new Map<string, number>());
  const [backlinks, setBacklinks] = useState<string[]>([]); const [linkWarning, setLinkWarning] = useState<string>();
  const undoStack = useRef(new Map<string, { past: string[]; future: string[] }>());
  const [state, setState] = useState<ShellState>(); const stateRef = useRef<ShellState | undefined>(undefined);
  const [content, setContent] = useState(''); const [error, setError] = useState<Reply['error']>();
  const [busy, setBusy] = useState(false); const actionBusy = useRef(false); const [lastCommand, setLastCommand] = useState<Record<string, unknown>>();
  const [palette, setPalette] = useState(false); const [filter, setFilter] = useState(''); const [operation, setOperation] = useState<Operation>();
  const [titleEditing, setTitleEditing] = useState(false); const [titleText, setTitleText] = useState(''); const titleCommit = useRef(false);
  const [panels, setPanels] = useState({ sidebarWidth: 248, inspectorWidth: 265, sidebarCollapsed: false, inspectorCollapsed: false });
  const [viewport, setViewport] = useState(window.innerWidth); const panelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<string>(); const [conflictExpanded, setConflictExpanded] = useState(true);
  const editor = useRef<HTMLTextAreaElement>(null); const pending = useRef(0); const unsynced = useRef(false); const localBuffer = useRef('');
  const editing = useRef<Promise<unknown>>(Promise.resolve()); const currentId = useRef<string | undefined>(undefined);
  const positions = useRef(new Map<string, { start: number; end: number; scroll: number }>());
  const ui = state?.ui ?? defaults; const doc = state?.document; const view = ui.view;
  const reading = !!modes[state?.activeTabId ?? ''];
  const noteIds = (state?.entries ?? []).filter(e => e.kind === 'note').map(e => e.id);
  const noteKey = noteIds.join('\n');
  const loadImage = useCallback(async (source: string) => { const reply = await window.campaign.command({ action: 'image', noteId: doc?.noteId, source }); return reply.ok && typeof reply.data === 'string' ? reply.data : undefined; }, [doc?.noteId, state?.campaign?.campaignId]);
  const activeTab = state?.tabs?.find(tab => tab.id === state.activeTabId);
  function remember() { if (currentId.current) { const area = document.querySelector('.center-scroll'); if (area) readingPositions.current.set(currentId.current + ':' + !!modesRef.current[stateRef.current?.activeTabId ?? ''], area.scrollTop); } if (editor.current && currentId.current) positions.current.set(currentId.current, { start: editor.current.selectionStart, end: editor.current.selectionEnd, scroll: editor.current.scrollTop }); }
  function apply(next: ShellState) {
    const sameCampaign = stateRef.current?.campaign?.campaignId === next.campaign?.campaignId;
    const id = next.document?.sessionId || next.document?.draft?.id || next.document?.noteId; const switched = currentId.current !== id && !(pending.current > 0 && stateRef.current?.activeTabId === next.activeTabId);
    if (switched) { setWiki(undefined); remember(); setTitleEditing(false); setConflictExpanded(true); }
    if ((pending.current === 0 && !unsynced.current) || switched) { localBuffer.current = next.document?.markdown ?? ''; setContent(localBuffer.current); }
    if (!sameCampaign) { undoStack.current.clear(); positions.current.clear(); readingPositions.current.clear(); setModes({}); modesRef.current = {}; setBacklinks([]); const u = next.ui ?? defaults; setPanels({ sidebarWidth: u.sidebarWidth, inspectorWidth: u.inspectorWidth, sidebarCollapsed: u.sidebarCollapsed, inspectorCollapsed: u.inspectorCollapsed }); setFilter(''); }
    const returningToNotes = stateRef.current?.ui.view !== 'notes' && next.ui.view === 'notes';
    stateRef.current = next; currentId.current = id; setState(next);
    if (switched || returningToNotes) requestAnimationFrame(() => { const area = document.querySelector('.center-scroll'); if (area) area.scrollTop = readingPositions.current.get(id + ':' + !!modesRef.current[next.activeTabId ?? '']) ?? 0; const p = id && positions.current.get(id); if (p && editor.current) { editor.current.setSelectionRange(p.start, p.end); editor.current.scrollTop = p.scroll; } });
  }
  async function command(input: Record<string, unknown>) {
    if (actionBusy.current && input.action !== 'close') return false;
    document.querySelectorAll('.row-menu[open]').forEach(menu => menu.removeAttribute('open'));
    actionBusy.current = true; setBusy(true); setError(undefined); setLastCommand(input); remember();
    try {
      while (pending.current > 0) await editing.current;
      if (unsynced.current) { const retry = await window.campaign.command({ action: 'edit', markdown: localBuffer.current }); if (!retry.ok) { setError(retry.error); return false; } unsynced.current = false; }
      const reply = await window.campaign.command(input); if (reply.state) apply(reply.state);
      if (!reply.ok) { setError(reply.error); return false; }
      if (['note', 'newNote', 'activateTab', 'history'].includes(String(input.action))) requestAnimationFrame(() => editor.current?.focus());
      return true;
    } catch { setError({ code: 'io_error', message: 'Comunicazione interrotta. Mantieni aperta l’app: il testo resta qui.' }); return false; }
    finally { actionBusy.current = false; setBusy(false); }
  }
  useEffect(() => {
    void window.campaign.command({ action: 'state' }).then(reply => { if (reply.state) apply(reply.state); });
    const unsubscribe = window.campaign.subscribe(apply); const close = window.campaign.beforeClose(() => { void command({ action: 'close' }); });
    const resize = () => setViewport(window.innerWidth); window.addEventListener('resize', resize);
    return () => { unsubscribe(); close(); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(true); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void command({ action: 'save' }); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e') { event.preventDefault(); void toggleReading(); }
      if (event.target === editor.current && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); undo(event.shiftKey || event.key.toLowerCase() === 'y'); }
      if (event.key === 'Escape' && !palette) { setWiki(undefined); setOperation(undefined); setTitleEditing(false); setDropTarget(undefined); }
    }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  });
  useEffect(() => {
    let canceled = false;
    const timer = setTimeout(() => { void window.campaign.command({ action: 'links' }).then(reply => {
      if (canceled) return;
      const data = reply.data as { backlinks?: string[]; warning?: string } | undefined;
      setBacklinks(data?.backlinks ?? []); setLinkWarning(data?.warning);
    }).catch(() => { if (!canceled) setLinkWarning('Collegamenti temporaneamente non disponibili.'); }); }, 180);
    return () => { canceled = true; clearTimeout(timer); };
  }, [doc?.noteId, content, noteKey, state?.projectionVersion, state?.campaign?.campaignId]);
  async function toggleReading() {
    remember(); await command({ action: 'save' });
    const id = stateRef.current?.activeTabId; if (!id) return;
    setModes(previous => ({ ...previous, [id]: !previous[id] }));
    requestAnimationFrame(() => { const area = document.querySelector('.center-scroll'); if (area) area.scrollTop = readingPositions.current.get(currentId.current + ':' + !!modesRef.current[id]) ?? 0; if (modesRef.current[id]) (document.querySelector('.markdown-view') as HTMLElement | null)?.focus({ preventScroll: true }); const p = currentId.current && positions.current.get(currentId.current); if (editor.current) { editor.current.focus(); if (p) { editor.current.setSelectionRange(p.start, p.end); editor.current.scrollTop = p.scroll; } } });
  }
  function openWiki(target: string) {
    const resolution = resolveWikiLink(target, noteIds);
    if (resolution.status === 'resolved') { setWiki(undefined); void command({ action: 'note', noteId: resolution.candidates[0] }); }
    else setWiki(target);
  }
  function undo(redo = false) {
    const id = currentId.current; if (!id) return;
    const history = undoStack.current.get(id); if (!history) return;
    const source = redo ? history.future : history.past; const value = source.pop(); if (value === undefined) return;
    (redo ? history.past : history.future).push(localBuffer.current); edit(value, false);
  }
  function edit(markdown: string, record = true) {
    if (record && currentId.current) { const history = undoStack.current.get(currentId.current) ?? { past: [], future: [] }; history.past.push(localBuffer.current); if (history.past.length > 200) history.past.shift(); history.future = []; undoStack.current.set(currentId.current, history); }

    setContent(markdown); localBuffer.current = markdown; unsynced.current = true; pending.current++;
    editing.current = editing.current.catch(() => undefined).then(async () => {
      try { const reply = await window.campaign.command({ action: 'edit', markdown }); pending.current--; if (reply.ok && pending.current === 0) unsynced.current = false; if (reply.state && reply.ok) apply(reply.state); if (!reply.ok) setError(reply.error); }
      catch { pending.current--; setError({ code: 'io_error', message: 'Bozza non ancora protetta. Mantieni aperta l’app.' }); }
    });
  }
  function updatePanels(patch: Partial<typeof panels>) {
    const next = { ...panels, ...patch }; setPanels(next); if (panelTimer.current) clearTimeout(panelTimer.current);
    panelTimer.current = setTimeout(() => { void window.campaign.command({ action: 'ui', patch: next }); }, 180);
  }
  function begin(kind: Operation['kind'], id = ui.selectedFolder || doc?.noteId || '') { document.querySelectorAll('.row-menu[open]').forEach(menu => menu.removeAttribute('open')); setOperation({ kind, id, value: kind === 'rename' ? id.split('/').at(-1) || '' : kind === 'move' ? parent(id) : '' }); }
  async function submitOperation() {
    if (!operation) return; const { kind, id, value } = operation;
    const input = kind === 'folder' ? { action: 'createFolder', id: `${id ? id + '/' : ''}${value}` } : kind === 'rename' ? { action: 'rename', id, title: value } : kind === 'move' ? { action: 'move', id, parentFolder: value } : { action: 'saveAs', noteId: value };
    if (await command(input)) setOperation(undefined);
  }
  async function commitTitle() {
    if (titleCommit.current || !doc || !titleEditing) return; titleCommit.current = true;
    try { const ok = await command(doc.draft ? { action: 'draftTitle', title: titleText } : { action: 'rename', id: doc.noteId, title: titleText }); if (ok) { setTitleEditing(false); if (doc.draft) await command({ action: 'save' }); } } finally { titleCommit.current = false; }
  }
  function toggleFolder(id: string) { void command({ action: 'ui', patch: { expandedFolders: ui.expandedFolders.includes(id) ? ui.expandedFolders.filter(f => f !== id) : [...ui.expandedFolders, id], selectedFolder: id } }); }
  function drop(event: React.DragEvent, destination: string) { event.preventDefault(); setDropTarget(undefined); const id = event.dataTransfer.getData('application/x-campaign-resource'); if (state?.entries.some(e => e.id === id)) void command({ action: 'move', id, parentFolder: destination }); }
  const entries = state?.entries ?? []; const folders = entries.filter(e => e.kind === 'folder'); const matches = (id: string) => id.toLocaleLowerCase().includes(filter.toLocaleLowerCase());
  const visible = entries.filter(e => {
    if (view === 'recent') return e.kind === 'note' && ui.recentNotes.includes(e.id) && matches(e.id);
    if (view === 'favorites') return e.kind === 'note' && ui.favorites.includes(e.id) && matches(e.id);
    if (filter) return matches(e.id) || folders.some(f => matches(f.id) && e.id.startsWith(f.id + '/')) || (e.kind === 'folder' && entries.some(c => c.id.startsWith(e.id + '/') && matches(c.id)));
    return e.id.split('/').slice(0, -1).every((_, i, parts) => ui.expandedFolders.includes(parts.slice(0, i + 1).join('/')));
  });
  if (view === 'recent') visible.sort((a, b) => ui.recentNotes.indexOf(a.id) - ui.recentNotes.indexOf(b.id));
  const selected = ui.selectedFolder || (!doc?.draft ? doc?.noteId : '') || '';
  const commands: PaletteItem[] = [{ id: 'open', label: 'Apri cartella campagna…', kind: 'azione', run: () => void command({ action: 'choose' }) }];
  if (state?.campaign) commands.push(
    { id: 'new', label: 'Nuova nota', kind: 'azione', run: () => void command({ action: 'newNote' }) },
    { id: 'folder', label: 'Nuova cartella', kind: 'azione', run: () => begin('folder', ui.selectedFolder || parent(doc?.noteId || '')) },
    { id: 'mode', label: reading ? 'Modalità modifica' : 'Modalità lettura', detail: 'Ctrl+E', kind: 'azione', run: () => void toggleReading() },
    { id: 'save', label: 'Salva nota', detail: 'Ctrl+S', kind: 'azione', run: () => void command({ action: 'save' }) },
    ...navigation.map(n => ({ id: n.id, label: `Apri ${n.label}`, kind: 'azione' as const, run: () => void command({ action: 'view', view: n.id }) })),
    ...(selected ? [{ id: 'rename', label: 'Rinomina elemento selezionato', kind: 'azione' as const, run: () => begin('rename', selected) }, { id: 'move', label: 'Sposta elemento selezionato', kind: 'azione' as const, run: () => begin('move', selected) }, { id: 'trash', label: 'Cestina elemento selezionato', kind: 'azione' as const, run: () => void command({ action: 'trashResource', id: selected }) }] : []),
    { id: 'close-campaign', label: 'Chiudi campagna', kind: 'azione', run: () => void command({ action: 'closeCampaign' }) },
    ...entries.filter(e => e.kind === 'note').map(e => ({ id: `note-${e.id}`, label: stem(e.id), detail: e.id, kind: 'note' as const, run: () => void command({ action: 'note', noteId: e.id }) }))
  );
  const sidebarVisible = !panels.sidebarCollapsed && viewport >= 760; const inspectorVisible = !panels.inspectorCollapsed && viewport >= 1050;
  return <div className="app" style={{ '--sidebar-width': `${panels.sidebarWidth}px`, '--inspector-width': `${panels.inspectorWidth}px` } as CSSProperties}>
    <header className="titlebar"><div className="brand"><span className="logo" aria-hidden="true">✦</span><span><strong>Campaign Manager</strong><small>{state?.campaign?.name || 'Le tue storie, in locale'}</small></span></div>
      <div className="history-controls"><button className="icon-button" aria-label="Indietro" disabled={busy || !activeTab || activeTab.historyIndex <= 0} onClick={() => void command({ action: 'history', direction: -1 })}><Icon name="back" /></button><button className="icon-button" aria-label="Avanti" disabled={busy || !activeTab || activeTab.historyIndex >= activeTab.history.length - 1} onClick={() => void command({ action: 'history', direction: 1 })}><Icon name="forward" /></button></div>
      <div className="breadcrumbs"><span>{state?.campaign?.name || 'Il prossimo capitolo comincia qui'}</span>{doc && <><span>/</span><strong>{title(doc)}</strong></>}</div>
      {doc && <span className={`save-state ${doc.state}`} role="status"><span className="state-dot" />{doc.draft && doc.state === 'clean' ? 'Bozza vuota' : labels[doc.state]}</span>}
      <button className="palette-trigger" onClick={() => setPalette(true)}><Icon name="search" /><span>Comandi</span><kbd>Ctrl K</kbd></button><button className="icon-button" aria-label="Apri cartella…" title="Apri cartella…" onClick={() => void command({ action: 'choose' })} disabled={busy}><Icon name="folder" /></button>
    </header>
    {error && <section className="notice global-notice" role="alert"><strong>{error.message}</strong><div className="actions"><button onClick={() => setError(undefined)}>Chiudi avviso</button>{error.code === 'collision' && ['choose', 'recent', 'retry'].includes(String(lastCommand?.action)) && <button onClick={() => void command({ action: 'independent' })}>Usa come nuova copia indipendente</button>}{['choose', 'recent', 'retry'].includes(String(lastCommand?.action)) && <><button onClick={() => void command({ action: 'retry' })}>Riprova apertura</button><button onClick={() => void command({ action: 'choose', preserve: true })}>Scegli un’altra cartella conservando la bozza</button></>}{error.code === 'conflict' && ['closeTab', 'closeCampaign'].includes(String(lastCommand?.action)) && <button onClick={() => void command({ ...lastCommand, preserve: true })}>Continua conservando la bozza</button>}</div></section>}
    {state?.warning && <section className="notice global-notice" role="status">{state.warning}</section>}
    {state?.rootMissing && <section className="notice global-notice" role="alert"><strong>La cartella della campagna non è più disponibile.</strong><p>I salvataggi sono sospesi e i buffer restano disponibili.</p><button onClick={() => void command({ action: 'choose', relink: true })}>Individua cartella…</button></section>}
    {!state?.campaign ? <main className="welcome"><span className="eyebrow">IL TUO MONDO, UNA PAGINA ALLA VOLTA</span><h1>Un posto per<br/>le tue storie.</h1><p>Apri una cartella di note Markdown.<br/>Le tue campagne restano sul tuo computer.</p><button className="primary" onClick={() => void command({ action: 'choose' })}>Apri cartella… <Icon name="forward" /></button>{!!state?.preferences.recent.length && <section className="recent-campaigns"><h2>Campagne recenti</h2>{state.preferences.recent.map(item => <button key={item.campaignId} onClick={() => void command({ action: 'recent', campaignId: item.campaignId })}><Icon name="folder" /><span><strong>{item.name}</strong><small>{item.path}</small></span><Icon name="forward" /></button>)}</section>}</main> : <main className="workspace">
      <nav className="rail" aria-label="Navigazione principale">{navigation.map(n => <button className={view === n.id ? 'active' : ''} key={n.id} aria-label={n.label} aria-current={view === n.id ? 'page' : undefined} title={n.label} onClick={() => void command({ action: 'view', view: n.id })}><Icon name={n.icon} /><span>{n.label}</span></button>)}</nav>
      {sidebarVisible && <><aside className="vault-sidebar"><div className="sidebar-heading"><h1>{view === 'recent' ? 'Recenti' : view === 'favorites' ? 'Preferiti' : 'La tua campagna'}</h1><button className="icon-button" aria-label="Nascondi sidebar" onClick={() => updatePanels({ sidebarCollapsed: true })}><Icon name="panel" size={16} /></button></div>
        <div className="filter"><Icon name="search" size={16} /><input aria-label="Filtra note e cartelle" placeholder="Filtra per nome…" value={filter} onChange={e => setFilter(e.target.value)} />{filter && <button className="icon-button" aria-label="Cancella filtro" onClick={() => setFilter('')}><Icon name="close" size={14} /></button>}</div>
        <div className="sidebar-create"><button disabled={busy} onClick={() => void command({ action: 'newNote' })}><Icon name="plus" size={15} />Nuova nota</button><button className="icon-button" title="Nuova cartella" aria-label="Nuova cartella" onClick={() => begin('folder', ui.selectedFolder || parent(doc?.noteId || ''))}><Icon name="folder" size={16} /></button></div>
        <button className={`root-folder ${dropTarget === '' ? 'drop-target' : ''}`} onClick={() => void command({ action: 'ui', patch: { selectedFolder: '' } })} onDragOver={e => { e.preventDefault(); setDropTarget(''); }} onDrop={e => drop(e, '')}><Icon name="folder" size={15} /><span>{state.campaign.name}</span><small>root</small></button>
        <nav className="vault-tree" aria-label="Note della campagna">{visible.map(entry => <div key={entry.id} className={`tree-row ${entry.id === ui.selectedFolder || entry.id === doc?.noteId ? 'selected' : ''} ${dropTarget === entry.id ? 'drop-target' : ''}`} style={{ '--depth': entry.id.split('/').length - 1 } as CSSProperties} draggable={!busy} onDragStart={e => { e.dataTransfer.setData('application/x-campaign-resource', entry.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDropTarget(undefined)} onDragOver={entry.kind === 'folder' ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(entry.id); } : undefined} onDrop={entry.kind === 'folder' ? e => drop(e, entry.id) : undefined}>
          <button className="tree-item" disabled={busy} aria-expanded={entry.kind === 'folder' ? !!filter || ui.expandedFolders.includes(entry.id) : undefined} aria-current={entry.id === doc?.noteId ? 'page' : undefined} onClick={e => entry.kind === 'folder' ? toggleFolder(entry.id) : void command({ action: 'note', noteId: entry.id, newTab: e.ctrlKey || e.metaKey })} title={entry.id}>{entry.kind === 'folder' && <span className={`disclosure ${ui.expandedFolders.includes(entry.id) || filter ? 'open' : ''}`}><Icon name="chevron" size={11} /></span>}<Icon name={entry.kind === 'folder' ? 'folder' : 'note'} size={15} /><span>{entry.kind === 'note' ? stem(entry.id) : entry.id.split('/').at(-1)}</span>{entry.kind === 'note' && ui.favorites.includes(entry.id) && <Icon name="star" size={10} />}</button>
          <details className="row-menu"><summary aria-label={`Azioni ${entry.id}`} title={`Azioni ${entry.id}`}><Icon name="more" size={15} /></summary><div className="row-menu-content">{entry.kind === 'note' && <><button onClick={() => void command({ action: 'note', noteId: entry.id, newTab: true })}>Apri in nuova tab</button><button onClick={() => void command({ action: 'favorite', noteId: entry.id })}>{ui.favorites.includes(entry.id) ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}</button></>}<button onClick={() => begin('rename', entry.id)}>Rinomina</button><button onClick={() => begin('move', entry.id)}>Sposta…</button><button onClick={() => void command({ action: 'trashResource', id: entry.id })}>Cestina</button></div></details>
        </div>)}{visible.length === 0 && <p className="empty-list">{filter ? 'Nessun elemento corrisponde al filtro.' : view === 'favorites' ? 'Le note preferite compariranno qui.' : view === 'recent' ? 'Le note aperte di recente compariranno qui.' : 'La campagna è vuota. Comincia con una nuova nota.'}</p>}</nav>
        <div className="sidebar-footer"><span>{entries.filter(e => e.kind === 'note').length} note · {folders.length} cartelle</span><button className="icon-button" aria-label="Aggiorna file" title="Aggiorna file" onClick={() => void command({ action: 'refresh' })}>↻</button></div>
      </aside><PanelHandle label="Larghezza sidebar" value={panels.sidebarWidth} min={200} max={360} direction={1} onChange={v => updatePanels({ sidebarWidth: v })} /></>}
      <section className="center"><div className="tabs" role="tablist" aria-label="Note aperte">{!sidebarVisible && <button className="icon-button" aria-label="Mostra sidebar" onClick={() => updatePanels({ sidebarCollapsed: false })}><Icon name="folder" /></button>}{state.tabs?.map((tab, index) => <div className={`tab ${tab.id === state.activeTabId ? 'active' : ''}`} key={tab.id} draggable onDragStart={e => e.dataTransfer.setData('application/x-campaign-tab', tab.id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('application/x-campaign-tab'); if (state.tabs.some(t => t.id === id)) void command({ action: 'reorderTab', id, index }); }}><button role="tab" aria-selected={tab.id === state.activeTabId} onClick={() => void command({ action: 'activateTab', id: tab.id })} onKeyDown={e => { if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); void command({ action: 'reorderTab', id: tab.id, index: Math.max(0, Math.min(state.tabs.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1))) }); } }}><Icon name="note" size={14} /><span>{title(tab.document)}</span>{tab.document && tab.document.state !== 'clean' && <span className="unsaved" aria-label="Modifiche non salvate">•</span>}</button><button className="tab-close" aria-label={`Chiudi tab ${title(tab.document)}`} onClick={() => void command({ action: 'closeTab', id: tab.id })}><Icon name="close" size={12} /></button></div>)}<button className="icon-button" aria-label="Nuova nota in nuova tab" onClick={() => void command({ action: 'newNote', newTab: true })}><Icon name="plus" size={16} /></button><span className="tab-spacer" />{!inspectorVisible && <button className="icon-button" aria-label="Mostra inspector" onClick={() => updatePanels({ inspectorCollapsed: false })}><Icon name="panel" /></button>}</div>
        {operation && <form className="inline-operation" onSubmit={e => { e.preventDefault(); void submitOperation(); }}><label>{operation.kind === 'folder' ? `Nuova cartella in ${operation.id || state.campaign.name}` : operation.kind === 'rename' ? `Rinomina ${operation.id}` : operation.kind === 'move' ? `Sposta ${operation.id} in` : 'Percorso della nuova nota'}{operation.kind === 'move' ? <select aria-label="Cartella di destinazione" value={operation.value} onChange={e => setOperation({ ...operation, value: e.target.value })}><option value="">Cartella principale</option>{folders.filter(f => f.id !== operation.id && !f.id.startsWith(operation.id + '/')).map(f => <option key={f.id} value={f.id}>{f.id}</option>)}</select> : <input autoFocus aria-label={operation.kind === 'folder' ? 'Nome cartella' : operation.kind === 'rename' ? 'Nuovo nome' : 'Nome nuova nota'} required value={operation.value} onChange={e => setOperation({ ...operation, value: e.target.value })} />}</label><button disabled={busy} className="primary" type="submit">Conferma</button><button type="button" onClick={() => setOperation(undefined)}>Annulla</button></form>}
        <div className="center-scroll">
        {!!state.repairs?.length && <section className="notice"><h2>Operazioni da completare</h2>{state.repairs.map(r => <div key={r.operationId}><p>{r.oldPath} → {r.newPath}</p><button onClick={() => void command({ action: 'repair', id: r.operationId })}>Verifica e ripara</button></div>)}</section>}
        {!!state.recoveries.length && <section className="notice recovery"><h2>Bozze da recuperare</h2>{state.recoveries.map(item => <div key={item.key}><p>{item.draft.target.kind === 'existing' ? item.draft.target.noteId : 'Nuova bozza'}</p><div className="actions"><button onClick={() => void command({ action: 'recovery', key: item.key, choice: 'restore' })}>Ripristina</button><button onClick={() => void command({ action: 'export', key: item.key })}>Esporta</button><button onClick={() => void command({ action: 'recovery', key: item.key, choice: 'discard' })}>Scarta</button></div></div>)}</section>}
        {['notes', 'recent', 'favorites'].includes(view) ? doc ? <>
          <div className="document-header"><div className="document-context"><Icon name="note" size={14} /><span>{doc.draft ? 'Bozza · nessun file ancora creato' : doc.noteId}</span></div><div className="document-title">{titleEditing ? <input aria-label="Titolo della nota" autoFocus value={titleText} onChange={e => setTitleText(e.target.value)} onBlur={() => void commitTitle()} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void commitTitle(); } if (e.key === 'Escape') { e.preventDefault(); titleCommit.current = true; setTitleEditing(false); queueMicrotask(() => { titleCommit.current = false; }); } }} /> : <button className="title-button" title="Rinomina nota" onClick={() => { setTitleText(doc.draft ? doc.draft.manualTitle || '' : stem(doc.noteId)); setTitleEditing(true); }}><h1>{title(doc)}</h1><Icon name="rename" size={17} /></button>}<div className="actions"><button className="icon-button" aria-label={ui.favorites.includes(doc.noteId) ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'} disabled={!!doc.draft} onClick={() => void command({ action: 'favorite', noteId: doc.noteId })}><Icon name="star" /></button><button disabled={busy || state.rootMissing || (!doc.draft && ['clean', 'conflict', 'missing'].includes(doc.state))} onClick={() => void command({ action: 'save' })}>Salva <kbd>Ctrl S</kbd></button></div></div></div>
          {doc.error && <section className="notice" role="alert">{doc.error}{doc.draft && <button onClick={() => { setTitleText(doc.draft?.manualTitle || ''); setTitleEditing(true); }}>Modifica titolo</button>}</section>}
          {doc.state === 'conflict' && <section className="notice"><strong>La nota è cambiata anche sul disco.</strong>{conflictExpanded ? <><p>Confronta le versioni prima di scegliere quale salvare.</p><details><summary>Versione su disco</summary><pre>{doc.disk?.markdown ?? 'Versione non disponibile; aggiorna i file.'}</pre></details><div className="actions"><button onClick={() => void command({ action: 'resolve', choice: 'local', revision: doc.disk?.revision })}>Usa versione locale</button><button onClick={() => void command({ action: 'resolve', choice: 'disk' })}>Usa versione su disco</button><button onClick={() => begin('saveAs', '')}>Salva locale come nuova nota</button><button onClick={() => setConflictExpanded(false)}>Annulla</button></div></> : <button onClick={() => setConflictExpanded(true)}>Risolvi conflitto</button>}</section>}
          {doc.state === 'missing' && !doc.draft && <section className="notice"><p>Il file originale non esiste più. Il contenuto resta disponibile.</p><button disabled={state.rootMissing} onClick={() => setOperation({ kind: 'saveAs', id: '', value: doc.noteId })}>Ricrea o salva come nuova nota</button></section>}
          <div className="editor-tools"><button aria-pressed={reading} onClick={() => void toggleReading()} disabled={busy}>{reading ? 'Modifica' : 'Leggi'} <kbd>Ctrl E</kbd></button>{!reading && <><button onClick={() => undo()} disabled={busy}>Annulla modifica</button><button onClick={() => undo(true)} disabled={busy}>Ripeti modifica</button></>}<span>{reading ? 'Lettura' : 'Markdown'}</span></div>
          {wiki && <section className="notice wiki-picker" aria-label="Destinazione collegamento"><strong>{resolveWikiLink(wiki, noteIds).status === 'ambiguous' ? 'Più note corrispondono a questo collegamento' : 'Questa nota non esiste ancora'}</strong><p>[[{wiki}]]</p>{resolveWikiLink(wiki, noteIds).candidates.map(id => <button key={id} onClick={async () => { if (await command({ action: 'note', noteId: id })) setWiki(undefined); }}><strong>{stem(id)}</strong><small>{id}</small></button>)}{resolveWikiLink(wiki, noteIds).status === 'missing' && <><p>Verrà creata {wiki.includes('/') ? wiki : [parent(doc.noteId), wiki].filter(Boolean).join('/')}. Le eventuali cartelle mancanti verranno create insieme alla nota.</p><button disabled={busy} onClick={async () => { if (await command({ action: 'createLinkedNote', target: wiki })) { setWiki(undefined); setModes(previous => ({ ...previous, [stateRef.current?.activeTabId ?? '']: false })); } }}>Crea nota</button></>}<button onClick={() => { setWiki(undefined); requestAnimationFrame(() => editor.current?.focus()); }}>Annulla collegamento</button></section>}
          {reading ? <MarkdownView markdown={content} noteId={doc.noteId} noteIds={noteIds} onWiki={openWiki} onExternal={url => void command({ action: 'external', url })} loadImage={loadImage} /> : <textarea ref={editor} className="editor" aria-label="Contenuto Markdown" placeholder="Comincia a scrivere la tua storia…" spellCheck={false} readOnly={busy} value={content} onSelect={remember} onScroll={remember} onChange={e => edit(e.target.value)} />}

        </> : <div className="empty-document"><span className="empty-mark">✦</span><h1>La campagna è aperta.</h1><p>Scegli una nota o comincia una nuova pagina.</p><button className="primary" onClick={() => void command({ action: 'newNote' })}><Icon name="plus" size={16} />Nuova nota</button></div> : view === 'settings' ? <section className="settings-view"><span className="eyebrow">IL TUO SPAZIO DI LAVORO</span><h1>Impostazioni</h1><section><h2>Campagna locale</h2><p className="local-path">{state.campaign.root}</p><div className="actions"><button onClick={() => void command({ action: 'revealRoot' })}>Apri in Esplora file</button><button onClick={() => updatePanels({ sidebarWidth: 248, inspectorWidth: 265, sidebarCollapsed: false, inspectorCollapsed: false })}>Ripristina disposizione</button><button onClick={() => void command({ action: 'closeCampaign' })}>Chiudi campagna</button></div></section><section><h2>Account</h2><p>Non serve un account per usare Campaign Manager.</p><p className="muted">Le funzioni online collegate a un account arriveranno più avanti.</p><span className="status-pill">In arrivo</span></section><small className="muted">Campaign Manager · V0.1</small></section> : <section className="placeholder-view"><Icon name={view === 'compendium' ? 'book' : view === 'graph' ? 'graph' : 'search'} size={40} /><span className="status-pill">In arrivo</span><h1>{view === 'compendium' ? 'Compendio' : view === 'graph' ? 'Grafo' : 'Ricerca'}</h1><p>{view === 'compendium' ? 'Qui potrai consultare l’enciclopedia e copiare le voci che ti servono nelle note della campagna.' : view === 'graph' ? 'Qui potrai esplorare le relazioni tra le note. La vista grafo sarà disponibile in un prossimo aggiornamento.' : 'Qui potrai cercare nel contenuto delle note. Per trovare subito un file puoi usare il filtro nella sidebar o i comandi.'}</p><button onClick={() => void command({ action: 'view', view: 'notes' })}>Torna alle note</button></section>}
        </div><footer className="document-footer"><span>{doc ? doc.draft ? doc.protected ? 'Bozza protetta · file non ancora creato' : 'Bozza temporanea' : doc.state === 'clean' ? 'File Markdown sul disco' : doc.protected ? 'Bozza di recupero protetta' : 'Protezione bozza in corso…' : 'Tutti i tuoi contenuti restano in locale'}</span>{doc && <div className="actions"><button onClick={() => void command({ action: 'export' })}>Esporta</button><button onClick={() => void command({ action: 'discard' })}>Scarta modifiche</button><button disabled={!!doc.draft} onClick={() => void command({ action: 'trashResource', id: doc.noteId })}>Cestina nota</button></div>}</footer>
      </section>
      {inspectorVisible && <><PanelHandle label="Larghezza inspector" value={panels.inspectorWidth} min={240} max={360} direction={-1} onChange={v => updatePanels({ inspectorWidth: v })} /><aside className="inspector"><div className="sidebar-heading"><h2>Dettagli</h2><button className="icon-button" aria-label="Nascondi inspector" onClick={() => updatePanels({ inspectorCollapsed: true })}><Icon name="panel" size={16} /></button></div>{ui.selectedFolder ? <><span className="detail-icon"><Icon name="folder" size={25} /></span><h3>{ui.selectedFolder.split('/').at(-1)}</h3><p className="local-path">{ui.selectedFolder}</p><dl><dt>Note nella cartella</dt><dd>{entries.filter(e => e.kind === 'note' && e.id.startsWith(ui.selectedFolder + '/')).length}</dd></dl><div className="inspector-actions"><button onClick={() => void command({ action: 'newNote', parentFolder: ui.selectedFolder })}>Nuova nota qui</button><button onClick={() => begin('folder', ui.selectedFolder)}>Nuova sottocartella</button><button onClick={() => begin('rename', ui.selectedFolder)}>Rinomina cartella</button><button onClick={() => begin('move', ui.selectedFolder)}>Sposta cartella</button><button onClick={() => void command({ action: 'trashResource', id: ui.selectedFolder })}>Cestina cartella</button></div></> : doc ? <><span className="detail-icon"><Icon name="note" size={25} /></span><h3>{title(doc)}</h3><p className="local-path">{doc.draft ? doc.draft.parentFolder || 'Cartella principale' : doc.noteId}</p><dl><dt>Parole</dt><dd>{content.trim() ? content.trim().split(/\s+/u).length : 0}</dd><dt>Caratteri</dt><dd>{content.length}</dd><dt>Formato</dt><dd>Markdown</dd></dl><div className="inspector-actions"><button disabled={!!doc.draft} onClick={() => begin('move', doc.noteId)}>Sposta nota</button><button onClick={() => void command({ action: 'note', noteId: doc.noteId, newTab: true })} disabled={!!doc.draft}>Apri in nuova tab</button></div><div className="inspector-note"><h4>Collegamenti in uscita</h4>{!parseWikiLinks(content).length && <p>Nessun collegamento in uscita.</p>}{[...new Set(parseWikiLinks(content).map(link => link.target))].map(target => <button className="relation" key={target} onClick={() => openWiki(target)}><span>{target}</span><small>{({ resolved: 'Nota collegata', missing: 'Nota mancante', ambiguous: 'Più corrispondenze' })[resolveWikiLink(target, noteIds).status]}</small></button>)}<h4>Backlink</h4>{!backlinks.length && <p>Nessuna nota rimanda qui.</p>}{backlinks.map(id => <button className="relation" key={id} onClick={() => void command({ action: 'note', noteId: id })}><span>{stem(id)}</span><small>{id}</small></button>)}{linkWarning && <p role="status">{linkWarning}</p>}</div></> : <p className="empty-list">Seleziona una nota o una cartella per vederne i dettagli.</p>}</aside></>}
    </main>}
    {palette && <Palette items={commands} onClose={() => setPalette(false)} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);


