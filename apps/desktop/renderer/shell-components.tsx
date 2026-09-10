import { useEffect, useRef, useState } from 'react';
export type IconName = 'note' | 'search' | 'graph' | 'book' | 'clock' | 'star' | 'settings' | 'folder' | 'plus' | 'back' | 'forward' | 'close' | 'chevron' | 'panel' | 'more' | 'trash' | 'move' | 'rename' | 'refresh';
const paths: Record<IconName, string> = {
  note: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',
  search: 'M16 16l5 5 M18 10a8 8 0 1 1-16 0a8 8 0 1 1 16 0',
  graph: 'M7 6l10 3 M7 6l3 12 M17 9l-7 9 M8 5a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M20 9a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M12 19a2 2 0 1 1-4 0a2 2 0 1 1 4 0',
  book: 'M12 5v16 M12 5C9 2 5 2 2 4v15c4-2 7-1 10 2c3-3 6-4 10-2V4c-3-2-7-2-10 1',
  clock: 'M12 7v6l4 2 M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  settings: 'M9 3h6l1 4 4 1 1 5-3 3-1 4-5 1-3-3-4-1-1-5 3-3z M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  folder: 'M2 6h8l2 2h10v12H2z M2 6V4h7l2 2', plus: 'M12 4v16 M4 12h16', back: 'm14 5-7 7 7 7', forward: 'm10 5 7 7-7 7', close: 'm6 6 12 12 M6 18 18 6', chevron: 'm9 5 7 7-7 7', panel: 'M3 3h18v18H3z M15 3v18', more: 'M4 12h1 M11 12h1 M18 12h1', trash: 'M3 6h18 M9 3h6 M6 6l1 15h10l1-15 M10 9v8 M14 9v8', move: 'M4 12h16 m-5-5 5 5-5 5', rename: 'm4 15 11-11 5 5L9 20H4z M13 6l5 5', refresh: 'M20 11a8 8 0 1 0 2 4.5 M20 4v7h-7'
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>; }
export interface PaletteItem { id: string; label: string; detail?: string; kind: 'note' | 'azione'; run: () => void }
export function Palette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState(0);
  const root = useRef<HTMLDialogElement>(null);
  const results = items.filter(item => `${item.label} ${item.detail ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 60);
  useEffect(() => { const previous = document.activeElement as HTMLElement; root.current?.showModal(); root.current?.querySelector('input')?.focus(); return () => previous?.focus(); }, []);
  useEffect(() => { root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  return <dialog ref={root} className="palette" aria-label="Comandi e note" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === root.current) onClose(); }}>
    <div className="palette-search"><Icon name="search" /><input aria-label="Cerca un comando o una nota" placeholder="Cerca una nota o un’azione…" value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} role="combobox" aria-controls="palette-results" aria-expanded="true" aria-activedescendant={results[selected] ? `result-${selected}` : undefined} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected(value => Math.max(0, Math.min(results.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)))); } if (event.key === 'Enter' && results[selected]) { event.preventDefault(); const item = results[selected]; onClose(); item.run(); } }} /><button className="icon-button" aria-label="Chiudi palette" onClick={onClose}><Icon name="close" /></button></div>
    <div id="palette-results" role="listbox" aria-label="Risultati" className="palette-results">{results.map((item, i) => <button id={`result-${i}`} role="option" aria-selected={i === selected} tabIndex={-1} key={item.id} onMouseMove={() => setSelected(i)} onClick={() => { onClose(); item.run(); }}><Icon name={item.kind === 'note' ? 'note' : 'move'} /><span><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span><small>{item.kind === 'note' ? 'Nota' : 'Azione'}</small></button>)}{results.length === 0 && <p className="empty-list">Nessuna nota o azione corrisponde alla ricerca.</p>}</div><footer><span>↑ ↓ per navigare · Invio per aprire</span><span>Esc per chiudere</span></footer>
  </dialog>;
}
export function PanelHandle({ label, value, min, max, direction, onChange }: { label: string; value: number; min: number; max: number; direction: 1 | -1; onChange: (value: number) => void }) {
  const clamp = (value: number) => Math.max(min, Math.min(max, value));
  return <div className="panel-handle" role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onChange(clamp(value + (event.key === 'ArrowRight' ? 10 : -10) * direction)); } }} onPointerDown={event => { const element = event.currentTarget; const start = event.clientX; const initial = value; element.setPointerCapture(event.pointerId); const move = (moveEvent: PointerEvent) => onChange(clamp(initial + (moveEvent.clientX - start) * direction)); const up = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); }; element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up); }} />;
}
