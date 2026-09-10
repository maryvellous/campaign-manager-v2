import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownBody, parseMarkdown, parseWikiLinks, resolveWikiLink } from '../packages/core/src/markdown';

test('wikilinks retain exact source offsets through Unicode, CRLF and opaque invalid frontmatter', () => {
  const markdown = '---\r\nbroken: [ [[Hidden]]\r\n---\r\n# Città 🏰\r\n**[[Luoghi/Meràdyl.md]]** e [[ Nuova nota ]]';
  const links = parseWikiLinks(markdown);
  assert.deepEqual(links.map(link => link.target), ['Luoghi/Meràdyl.md', 'Nuova nota']);
  assert.deepEqual(links.map(link => markdown.slice(link.start, link.end)), ['[[Luoghi/Meràdyl.md]]', '[[ Nuova nota ]]']);
  assert.equal(markdownBody(markdown).length, markdown.length);
  assert.equal(markdownBody(markdown).indexOf('# Città'), markdown.indexOf('# Città'));
  assert.deepEqual(parseWikiLinks('---\n[[unclosed opaque frontmatter]]'), []);
});

test('CommonMark/GFM parser recognizes prose and nested containers but excludes real code and escapes', () => {
  const markdown = [
    '[[Root]]', '> [[Quote]]', '- [[List]]', '',
    '| Col |', '| --- |', '| [[Table]] |', '',
    '> ```md', '> [[Quoted code]]', '> ```', '',
    '- item', '', '      [[Indented code]]', '',
    '``inline ` [[Inline code]]``', '\\[[Escaped]]', '\\\\[[Visible]]',
    '```', '[[Fenced]]', '``` text does not close', '[[Still fenced]]', '```',
  ].join('\n');
  assert.deepEqual(parseWikiLinks(markdown).map(link => link.target), ['Root', 'Quote', 'List', 'Table', 'Visible']);
});

test('unsupported and unsafe targets, raw HTML and nested Markdown links stay ordinary content', () => {
  const markdown = [
    '[[../outside]] [[/absolute]] [[C:/drive]] [[Folder\\File]] [[A|alias]] [[A#heading]] [[]]',
    '[label [[Nested]]](https://example.org)', '![alt [[Image]]](picture.png)',
    '<script>[[Script]]</script>', '', '[[Safe]]',
  ].join('\n');
  assert.deepEqual(parseWikiLinks(markdown).map(link => link.target), ['Safe']);
});

test('resolution uses root-qualified paths, global basename, case-safe ambiguity and optional extension', () => {
  const ids = ['Places/Tower.md', 'Other/Tower.md', 'INDEX.md', 'A.md', 'a.md'];
  assert.deepEqual(resolveWikiLink('tower', ids), { status: 'ambiguous', candidates: ['Other/Tower.md', 'Places/Tower.md'] });
  assert.deepEqual(resolveWikiLink('places/tower.MD', ids), { status: 'resolved', candidates: ['Places/Tower.md'] });
  assert.deepEqual(resolveWikiLink('index', ids), { status: 'resolved', candidates: ['INDEX.md'] });
  assert.deepEqual(resolveWikiLink('A', ids), { status: 'ambiguous', candidates: ['A.md', 'a.md'] });
  assert.deepEqual(resolveWikiLink('Missing', ids), { status: 'missing', candidates: [] });
  assert.deepEqual(resolveWikiLink('../Tower', ['../Tower.md']), { status: 'missing', candidates: [] });
});

test('literal filename underscores are preserved across Markdown emphasis nodes', () => {
  const markdown = '[[_Nota_]] [[Folder/__Nome__]] [[~~Archivio~~]]';
  assert.deepEqual(parseWikiLinks(markdown).map(link => link.target), ['_Nota_', 'Folder/__Nome__', '~~Archivio~~']);
});

test('complete wikilinks take precedence over inner shortcut references without nesting anchors', () => {
  const markdown = '[[A]] [[Folder/Note]]\n\n[A]: https://example.org\n[Folder/Note]: https://example.org\n\n[External [[A]]](https://example.org)\n[External [[A]]][destination]\n\n[destination]: https://example.org';
  const links = parseWikiLinks(markdown);
  assert.deepEqual(links.map(link => link.target), ['A', 'Folder/Note']);
  assert.deepEqual(links.map(link => markdown.slice(link.start, link.end)), ['[[A]]', '[[Folder/Note]]']);
});

test('shared Markdown dialect parses GFM tables, tasks and strikethrough', () => {
  const tree = parseMarkdown('| Name |\n| --- |\n| Entry |\n\n- [x] ~~Done~~');
  assert.equal(tree.children[0].type, 'table');
  const list = tree.children[1]; assert.equal(list.type, 'list');
  if (list.type !== 'list') throw new Error('Expected list');
  assert.equal(list.children[0].checked, true);
  const paragraph = list.children[0].children[0];
  assert.equal(paragraph.type, 'paragraph');
  if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
  assert.equal(paragraph.children[0].type, 'delete');
});
