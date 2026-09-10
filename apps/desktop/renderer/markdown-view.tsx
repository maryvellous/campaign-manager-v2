import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseWikiLinks, resolveWikiLink } from '../../../packages/core/src/markdown';
import './markdown-view.css';

export interface MarkdownViewProps {
  markdown: string;
  noteId: string;
  noteIds: string[];
  onWiki: (target: string) => void;
  onExternal: (url: string) => void;
  loadImage: (src: string) => Promise<string | undefined>;
}

function hasControl(value: string): boolean { return [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127); }

function externalUrl(value: string): boolean {
  if (!/^(https?:\/\/|mailto:)/i.test(value) || hasControl(value)) return false;
  try { return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol); } catch { return false; }
}

function relativeImage(value: string): boolean {
  try {
    const decoded = decodeURIComponent(value);
    return !/[\\:#?]/.test(decoded) && !hasControl(decoded) && !decoded.startsWith('/') &&
      decoded.split('/').every(part => part !== '..' && part !== '') && /\.(png|jpe?g|webp|gif)$/i.test(decoded);
  } catch { return false; }
}

function LocalImage({ src, alt, title, noteId, loadImage }: { src: string; alt: string; title?: string; noteId: string; loadImage: MarkdownViewProps['loadImage'] }) {
  const [image, setImage] = useState<{ key: string; url?: string; done: boolean }>({ key: '', done: false });
  const key = `${noteId}\0${src}`;
  const allowed = relativeImage(src);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void loadImage(src).then(url => {
      if (!cancelled) setImage({ key, url: url && /^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(url) ? url : undefined, done: true });
    }).catch(() => { if (!cancelled) setImage({ key, done: true }); });
    return () => { cancelled = true; };
  }, [src, key, allowed, loadImage]);
  if (image.key === key && image.url) return <img src={image.url} alt={alt} title={title} loading="lazy" />;
  const description = !allowed ? 'Immagine non caricata: sono ammesse solo immagini relative alla campagna.' : image.key === key && image.done ? 'Immagine locale non disponibile.' : 'Caricamento immagine locale…';
  return <span className="markdown-image-placeholder" role="img" aria-label={`${alt ? `${alt}. ` : ''}${description}`} title={description}>{alt || 'Immagine'} <small>{description}</small></span>;
}

function prepareMarkdown(markdown: string) {
  const frontmatter = /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(markdown)?.[0] ?? '';
  const body = markdown.slice(frontmatter.length);
  const links = parseWikiLinks(body);
  // A per-document prefix prevents authored URLs from impersonating generated wiki links.
  let prefix = 'cm-wiki-';
  while (body.includes(prefix)) prefix += 'x';
  const targets = new Map<string, string>();
  let output = '', cursor = 0;
  links.forEach((link, index) => {
    const url = `${prefix}:${index}`;
    targets.set(url, link.target);
    const label = link.target.replace(/([\\`*_[\]<>])/g, '\\$1').replace(/&/g, '&amp;');
    output += body.slice(cursor, link.start) + `[${label}](${url})`;
    cursor = link.end;
  });
  output += body.slice(cursor);
  return { body: output, frontmatter, targets };
}

export function MarkdownView({ markdown, noteId, noteIds, onWiki, onExternal, loadImage }: MarkdownViewProps) {
  const prepared = useMemo(() => prepareMarkdown(markdown), [markdown]);
  return <article className="markdown-view" aria-label="Nota in modalità lettura" tabIndex={0}>
    {prepared.frontmatter && <pre className="markdown-frontmatter" aria-label="Frontmatter originale"><code>{prepared.frontmatter}</code></pre>}
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url, key) => key === 'src' ? url : prepared.targets.has(url) || externalUrl(url) ? url : ''} components={{
      a: ({ href = '', children, title }) => {
        const target = prepared.targets.get(href);
        if (target !== undefined) {
          const resolution = resolveWikiLink(target, noteIds);
          const state = resolution.status === 'resolved' ? 'Apri nota' : resolution.status === 'missing' ? 'Nota mancante: crea nota' : 'Collegamento ambiguo: scegli nota';
          return <button type="button" className={`wiki-link wiki-${resolution.status}`} onClick={() => onWiki(target)} title={`${state} — ${target}`} aria-label={`${state}: ${target}`}>{children}{resolution.status !== 'resolved' && <span aria-hidden="true" className="wiki-indicator">{resolution.status === 'missing' ? '+' : '?'}</span>}</button>;
        }
        return externalUrl(href) ? <a href={href} title={title} onClick={event => { event.preventDefault(); onExternal(href); }} onAuxClick={event => { event.preventDefault(); if (event.button === 1) onExternal(href); }}>{children}<span className="external-link-mark" aria-hidden="true">↗</span></a> : <span className="markdown-blocked-link" title="Destinazione non supportata">{children}</span>;
      },
      img: ({ src, alt = '', title }) => <LocalImage src={typeof src === 'string' ? src : ''} alt={alt} title={title} noteId={noteId} loadImage={loadImage} />,
    }}>{prepared.body}</ReactMarkdown>
    {!markdown.trim() && <p className="markdown-empty">Questa nota è vuota. Passa a Modifica per scrivere.</p>}
  </article>;
}

