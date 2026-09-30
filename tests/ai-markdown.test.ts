import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMarkdown } from '../apps/desktop/renderer/ai-workspace';

test('AI chat renders Markdown instead of exposing raw markers', () => {
  const html = renderToStaticMarkup(createElement(ChatMarkdown, {
    markdown: '## Titolo\n\n**forte**\n\n- uno\n- due',
    command: async () => ({ ok: true })
  }));
  assert.match(html, /<h2>Titolo<\/h2>/u);
  assert.match(html, /<strong>forte<\/strong>/u);
  assert.match(html, /<li>uno<\/li>/u);
  assert.equal(html.includes('**forte**'), false);
});
