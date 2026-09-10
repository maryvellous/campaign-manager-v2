import { setTimeout } from 'node:timers';
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'cmv2-goal2-ui-'));
const vault = path.join(temporary, 'Ala di prova'); await mkdir(vault);
await writeFile(path.join(vault, 'Indice.md'), '# Indice\n[[Luoghi/La città perduta]]');
let desktop;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
try {
  desktop = await electron.launch({ args: ['.', `--user-data-dir=${path.join(temporary, 'profile')}`], cwd: process.cwd(), env });
  const page = await desktop.firstWindow(); const failures = []; page.on('pageerror', error => failures.push(error.message));
  await desktop.evaluate(({ dialog }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }, vault);
  await page.getByRole('button', { name: 'Apri cartella…', exact: true }).first().click();
  await page.locator('.root-folder').waitFor();
  const expectNote = async id => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const reply = await page.evaluate(() => window.campaign.command({ action: 'state' }));
      if (reply.state.document?.noteId === id && reply.state.document?.state === 'clean') return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Nota non persistita entro il timeout: ${id}`);
  };
  const tree = page.getByRole('navigation', { name: 'Note della campagna' });
  await page.getByRole('button', { name: 'Nuova cartella', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome cartella', exact: true }).fill('Luoghi');
  await page.getByRole('button', { name: 'Conferma', exact: true }).click();
  await tree.getByRole('button', { name: 'Luoghi', exact: true }).waitFor();
  await page.locator('.sidebar-create').getByRole('button', { name: 'Nuova nota', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Contenuto Markdown' }); await editor.waitFor();
  assert.deepEqual(await readdir(path.join(vault, 'Luoghi')), []);
  await editor.fill('# La città perduta ');
  await expectNote('Luoghi/La città perduta.md');
  assert.equal(await readFile(path.join(vault, 'Luoghi', 'La città perduta.md'), 'utf8'), '# La città perduta ');
  await page.getByRole('button', { name: 'Aggiungi ai preferiti', exact: true }).first().click();
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('button', { name: 'Preferiti', exact: true }).click();
  await tree.getByRole('button', { name: 'La città perduta', exact: true }).waitFor();
  assert.equal(await tree.getByRole('button', { name: 'Indice', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Note', exact: true }).click();
  await tree.getByRole('button', { name: 'Indice', exact: true }).click();
  await page.getByRole('button', { name: 'Indietro', exact: true }).click();
  await expectNote('Luoghi/La città perduta.md');
  await page.getByRole('button', { name: 'Avanti', exact: true }).click();
  await expectNote('Indice.md');
  // Ctrl-click explicitly opens another tab; repeated requests never duplicate it.
  await tree.getByRole('button', { name: 'La città perduta', exact: true }).click({ modifiers: ['Control'] });
  await page.getByRole('tab', { name: 'La città perduta', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab').count(), 2);
  await tree.getByRole('button', { name: 'La città perduta', exact: true }).click({ modifiers: ['Control'] });
  assert.equal(await page.getByRole('tab').count(), 2);
  // Title rename is real and updates the resolved wikilink.
  await page.getByTitle('Rinomina nota', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Titolo della nota', exact: true }).fill('Meradyl');
  await page.getByRole('textbox', { name: 'Titolo della nota', exact: true }).press('Enter');
  await page.getByRole('tab', { name: 'Meradyl', exact: true }).waitFor();
  assert.match(await readFile(path.join(vault, 'Indice.md'), 'utf8'), /\[\[Luoghi\/Meradyl\]\]/);
  await page.getByRole('button', { name: 'Sposta nota', exact: true }).click();
  await page.getByRole('combobox', { name: 'Cartella di destinazione', exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expectNote('Meradyl.md');
  assert.equal(await readFile(path.join(vault, 'Meradyl.md'), 'utf8'), '# La città perduta ');
  // Keyboard palette and honest cloud placeholders.
  await editor.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Cerca un comando o una nota' }); await search.fill('Apri Compendio'); await search.press('Enter');
  await page.getByRole('heading', { name: 'Compendio', exact: true }).waitFor();
  assert.equal(await page.locator('.placeholder-view input').count(), 0);
  await page.getByRole('button', { name: 'Impostazioni', exact: true }).click();
  await page.getByText('Non serve un account per usare Campaign Manager.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Accedi', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Note', exact: true }).click();
  await page.getByRole('button', { name: 'Nascondi inspector', exact: true }).click();
  await page.getByRole('button', { name: 'Mostra inspector', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mostra inspector', exact: true }).click();
  await page.getByRole('button', { name: 'Nascondi inspector', exact: true }).waitFor();
  await mkdir('work', { recursive: true }); await page.screenshot({ path: 'work/goal2-electron.png', fullPage: true });
  // Empty new tab can be closed without materializing a file.
  const before = (await readdir(vault)).sort();
  await page.getByRole('button', { name: 'Nuova nota in nuova tab', exact: true }).click();
  await page.getByRole('button', { name: 'Chiudi tab Nuova nota', exact: true }).click();
  assert.deepEqual((await readdir(vault)).sort(), before);
  assert.deepEqual(failures, []);
  console.log('PASS Goal2: folder create, draft/materialize, favorites, history, unique tabs, real rename/move with links, palette keyboard, placeholders, inspector, empty draft.');
} catch (error) { console.log('DEBUG TREE', await readdir(vault, { recursive: true })); if (desktop) { const pages = desktop.windows(); if (pages[0]) { console.log('DEBUG STATE', await pages[0].evaluate(() => window.campaign.command({ action: 'state' }))); await mkdir('work', { recursive: true }); await pages[0].screenshot({ path: 'work/goal2-failure.png' }); } } throw error; } finally { if (desktop) await desktop.close(); await rm(temporary, { recursive: true, force: true }); }


