import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, Nodes } from 'mdast';
import { validateRelativePath } from './index';

export interface WikiLink { start: number; end: number; target: string }
export interface WikiResolution { status: 'resolved' | 'missing' | 'ambiguous'; candidates: string[] }

/** Keep source offsets intact. Even invalid YAML remains opaque user content. */
export function markdownBody(markdown: string): string {
  const opening = /^(?:\uFEFF)?---[ \t]*\r?\n/u.exec(markdown);
  if (!opening) return markdown;
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gmu;
  closing.lastIndex = opening[0].length;
  const match = closing.exec(markdown);
  const end = match ? match.index + match[0].length : markdown.length;
  return markdown.slice(0, end).replace(/[^\r\n]/gu, ' ') + markdown.slice(end);
}

const parser = unified().use(remarkParse).use(remarkGfm);
export function parseMarkdown(markdown: string): Root { return parser.parse(markdownBody(markdown)); }

/** AST context plus original source ranges keep escapes and filenames lossless. */
export function parseWikiLinks(markdown: string): WikiLink[] {
  const links: WikiLink[] = [];
  const excluded: { start: number; end: number; reference: boolean }[] = [];
  const visit = (node: Nodes): void => {
    // Nested anchors, images and raw HTML must never acquire clickable wikilinks.
    if (node.type === 'link' || node.type === 'linkReference' || node.type === 'definition' || node.type === 'image' || node.type === 'imageReference' || node.type === 'html' || node.type === 'code' || node.type === 'inlineCode') {
      const start = node.position?.start.offset; const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) excluded.push({ start, end, reference: node.type === 'linkReference' });
      return;
    }
    if ('children' in node) for (const child of node.children) visit(child);
  };
  visit(parseMarkdown(markdown));
  const body = markdownBody(markdown);
  const pattern = /\[\[([^\]\r\n[]+)\]\]/gu;
  // A shortcut reference inside a wiki can also prevent CommonMark from seeing
  // an enclosing authored anchor. Mask wiki syntax, preserving offsets, to
  // detect that outer context without changing the user's source.
  visit(parseMarkdown(body.replace(pattern, match => 'w'.repeat(match.length))));
  // A filename may contain underscores that CommonMark sees as emphasis delimiters.
  // Match across such phrasing nodes, while rejecting any excluded AST context.
  for (const match of body.matchAll(pattern)) {
    const start = match.index; const end = start + match[0].length;
    // CommonMark can recognize the inner [Name] in [[Name]] as a shortcut
    // reference when [Name]: URL exists elsewhere. The complete wiki syntax
    // takes precedence, but remains excluded inside an authored link label.
    if (excluded.some(range => start < range.end && end > range.start && !(range.reference && range.start === start + 1 && range.end === end - 1))) continue;
    let slashes = 0; for (let i = start - 1; i >= 0 && markdown[i] === '\\'; i--) slashes++;
    if (slashes % 2 || /[|#]/u.test(match[1])) continue;
    const target = match[1].trim();
    try { validateRelativePath(target); } catch { continue; }
    links.push({ start, end, target });
  }
  return links;
}

export function resolveWikiLink(target: string, ids: readonly string[]): WikiResolution {
  target = target.trim();
  try { validateRelativePath(target); } catch { return { status: 'missing', candidates: [] }; }
  if (/[|#]/u.test(target)) return { status: 'missing', candidates: [] };
  const query = target.replace(/\.md$/iu, '').toLowerCase();
  const candidates = [...new Set(ids)].filter(id => {
    try { validateRelativePath(id); } catch { return false; }
    if (!/\.md$/iu.test(id)) return false;
    const title = target.includes('/') ? id : id.split('/').at(-1)!;
    return title.slice(0, -3).toLowerCase() === query;
  }).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return { status: candidates.length === 1 ? 'resolved' : candidates.length ? 'ambiguous' : 'missing', candidates };
}
