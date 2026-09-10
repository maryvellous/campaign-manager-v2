import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'cmv2-goal3-ui-'));
const vault = path.join(temporary, 'Campaign'); await mkdir(vault); await mkdir(path.join(vault, 'Other'));
const markdown = '---\nunknown: [invalid YAML\n---\n# La città perduta\n\n**Testo forte**, ~~testo barrato~~.\n\n| Luogo | Stato |\n| --- | --- |\n| Città | Viva |\n\n- [x] Visita completata\n\n[[Target]] [[Missing]] [[Other/Target]]\n\n`[[Code]]`\n\n```js\n[[Fenced]]\n```\n\n<script>window.pwned=true</script>\n\n[Pericoloso](javascript:alert(1)) [Sito](https://example.com/)\n\n![Locale](Image.png) ![Remota](https://example.com/image.png)\n\n' + Array.from({ length: 65 }, (_, i) => `Paragrafo ${i}. Il viaggio continua.\n\n`).join('');
await writeFile(path.join(vault, 'Source.md'), markdown); await writeFile(path.join(vault, 'Target.md'), 'root target'); await writeFile(path.join(vault, 'Other', 'Target.md'), 'other target');
await writeFile(path.join(vault, 'Image.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64'));
let desktop;
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
  desktop = await electron.launch({ args: ['.', `--user-data-dir=${path.join(temporary, 'profile')}`], cwd: process.cwd(), env });
  const page = await desktop.firstWindow(); const failures = []; const network = [];
  page.on('pageerror', error => failures.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  await desktop.evaluate(({ dialog, shell }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); shell.openExternal = async url => { globalThis.testExternal = url; }; }, vault);
  await page.getByRole('button', { name: 'Apri cartella…', exact: true }).first().click();
  const tree = page.getByRole('navigation', { name: 'Note della campagna' }); await tree.getByRole('button', { name: 'Source', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Contenuto Markdown', exact: true }); await editor.press('Control+e');
  const preview = page.getByRole('article', { name: 'Nota in modalità lettura' }); await preview.waitFor();
  assert.equal(await preview.locator('h1').textContent(), 'La città perduta'); assert.equal(await preview.locator('table').count(), 1); assert.equal(await preview.locator('del').textContent(), 'testo barrato'); assert.equal(await preview.getByRole('checkbox').isChecked(), true);
  assert.equal(await preview.locator('script,iframe').count(), 0); assert.equal(await page.evaluate(() => window.pwned), undefined);
  await preview.locator('img').waitFor(); assert.equal(await preview.locator('img').count(), 1); assert.match(await preview.locator('img').getAttribute('src'), /^data:image\/png/);
  assert.equal(await preview.getByRole('button', { name: /Code|Fenced/ }).count(), 0);
  await preview.getByRole('link', { name: /Sito/ }).click(); assert.equal(await desktop.evaluate(() => globalThis.testExternal), 'https://example.com/');
  await preview.getByRole('button', { name: 'Collegamento ambiguo: scegli nota: Target', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Destinazione collegamento' }); await picker.waitFor();
  assert.equal(await picker.getByRole('button').count(), 3); await picker.getByRole('button').filter({ hasText: 'Other/Target.md' }).click();
  await page.getByRole('tab', { name: 'Target', exact: true }).waitFor();
  const relation = page.locator('.inspector-note').getByRole('button').filter({ hasText: 'Source.md' }); await relation.waitFor(); await relation.click();
  await preview.getByRole('button', { name: 'Nota mancante: crea nota: Missing', exact: true }).click(); await picker.getByRole('button', { name: 'Crea nota', exact: true }).click();
  await page.getByRole('tab', { name: 'Missing', exact: true }).waitFor(); assert.equal(await readFile(path.join(vault, 'Missing.md'), 'utf8'), '');
  assert.equal(await readFile(path.join(vault, 'Source.md'), 'utf8'), markdown);
  // Explicit mode toggle preserves both cursor and reading position.
  await tree.getByRole('button', { name: 'Source', exact: true }).click(); await editor.press('Control+e'); await preview.waitFor();
  await page.locator('.center-scroll').evaluate(node => { node.scrollTop = 500; });
  await page.getByRole('button', { name: 'Modifica', exact: false }).filter({ hasText: 'Ctrl' }).click(); await editor.waitFor(); await editor.press('Control+e'); await preview.waitFor();
  assert.ok(await page.locator('.center-scroll').evaluate(node => node.scrollTop) >= 490);
  await page.screenshot({ path: 'work/goal3-electron.png', fullPage: true });
  await page.keyboard.press('Control+e'); await editor.waitFor(); await editor.fill('First content'); await editor.fill('Second content'); await editor.press('Control+z'); assert.equal(await editor.inputValue(), 'First content'); await editor.press('Control+y'); assert.equal(await editor.inputValue(), 'Second content');
  await editor.press('Control+s');
  // Same filename in another campaign must never inherit this campaign's undo history.
  const second = path.join(temporary, 'Second'); await mkdir(second); await writeFile(path.join(second, 'Source.md'), 'Separate campaign');
  await desktop.evaluate(({ dialog }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); }, second);
  await page.getByRole('button', { name: 'Apri cartella…', exact: true }).click(); await tree.getByRole('button', { name: 'Source', exact: true }).click();
  await editor.press('Control+z'); assert.equal(await editor.inputValue(), 'Separate campaign');
  assert.deepEqual(network, []); assert.deepEqual(failures, []);
  console.log('PASS Goal3: CommonMark/GFM, opaque YAML, safe local images/external links, no remote loads, missing/ambiguous wiki, backlinks, cursor/read position, isolated undo/redo.');
} catch (error) { if (desktop) { const [page] = desktop.windows(); if (page) { await mkdir('work', { recursive: true }); await page.screenshot({ path: 'work/goal3-failure.png' }); console.log(await page.locator('body').innerText()); } } throw error; }
finally { if (desktop) await desktop.close(); await rm(temporary, { recursive: true, force: true }); }
