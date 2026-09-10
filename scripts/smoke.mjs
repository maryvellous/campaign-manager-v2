import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'cmv2-electron-'));
const vault = path.join(temporary, 'Campagna di prova'); await mkdir(vault);
await writeFile(path.join(vault, 'Meradyl.md'), '# Meradyl\nUna città sul mare.');
let desktop;
try {
  desktop = await electron.launch({ args: ['.', `--user-data-dir=${path.join(temporary, 'profile')}`], cwd: process.cwd(), env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
  const page = await desktop.firstWindow();
  await page.getByRole('heading', { name: 'Un posto per le tue storie.' }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
  await desktop.evaluate(({ dialog }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); }, vault);
  await page.getByRole('button', { name: 'Apri cartella…', exact: true }).first().click();
  await page.locator('.root-folder').filter({ hasText: 'Campagna di prova' }).waitFor();
  await page.getByRole('navigation', { name: 'Note della campagna' }).getByRole('button', { name: 'Meradyl', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Contenuto Markdown' });
  await editor.fill('# Meradyl\nUna città sul mare.\nUna modifica reale.');
  await page.getByRole('status').filter({ hasText: /^Modifiche da salvare$/ }).waitFor();
  await editor.press('Control+s');
  await page.getByRole('status').filter({ hasText: /^Salvato$/ }).waitFor();
  assert.match(await readFile(path.join(vault, 'Meradyl.md'), 'utf8'), /Una modifica reale/);
  await mkdir('work', { recursive: true });
  await page.screenshot({ path: 'work/goal1-electron.png', fullPage: true });
  const invalidCommand = await page.evaluate(() => window.campaign.command({ action: 'arbitrary-command' }));
  assert.equal(invalidCommand.ok, false);
  const escape = await page.evaluate(() => window.campaign.command({ action: 'note', noteId: '../outside.md' }));
  assert.equal(escape.error.code, 'invalid_path');
  const prefs = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false);
  // Closing immediately after editing must flush the renderer queue before the main process exits.
  await editor.fill('Ultima modifica prima della chiusura.');
  await desktop.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
  await desktop.waitForEvent('close');
  desktop = undefined;
  assert.equal(await readFile(path.join(vault, 'Meradyl.md'), 'utf8'), 'Ultima modifica prima della chiusura.');
  desktop = await electron.launch({ args: ['.', `--user-data-dir=${path.join(temporary, 'profile')}`], cwd: process.cwd(), env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
  const reopened = await desktop.firstWindow();
  await reopened.locator('.root-folder').filter({ hasText: 'Campagna di prova' }).waitFor();
  await reopened.getByRole('navigation', { name: 'Note della campagna' }).getByRole('button', { name: 'Meradyl', exact: true }).click();
  assert.equal(await reopened.getByRole('textbox', { name: 'Contenuto Markdown' }).inputValue(), 'Ultima modifica prima della chiusura.');
  await reopened.getByRole('textbox', { name: 'Contenuto Markdown' }).fill('Versione locale da recuperare.');
  await writeFile(path.join(vault, 'Meradyl.md'), 'Versione esterna.');
  await reopened.getByRole('button', { name: 'Aggiorna file' }).click();
  await reopened.getByText('La nota è cambiata anche sul disco.', { exact: true }).waitFor();
  assert.equal(await readFile(path.join(vault, 'Meradyl.md'), 'utf8'), 'Versione esterna.');
  await desktop.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await desktop.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
  await desktop.waitForEvent('close');
  desktop = undefined;
  desktop = await electron.launch({ args: ['.', `--user-data-dir=${path.join(temporary, 'profile')}`], cwd: process.cwd(), env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
  const recovered = await desktop.firstWindow();
  await recovered.getByRole('heading', { name: 'Bozze da recuperare' }).waitFor();
  await recovered.getByRole('button', { name: 'Ripristina', exact: true }).click();
  assert.equal(await recovered.getByRole('textbox', { name: 'Contenuto Markdown' }).inputValue(), 'Versione locale da recuperare.');
  await recovered.getByRole('button', { name: 'Usa versione su disco', exact: true }).click();
  await recovered.waitForFunction(() => document.querySelector('textarea')?.value === 'Versione esterna.');
  // Only the dedicated temporary test note is sent to the real Windows recycle bin.
  await desktop.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await recovered.getByRole('button', { name: 'Cestina nota', exact: true }).click();
  await recovered.getByRole('heading', { name: 'La campagna è aperta.' }).waitFor();
  await assert.rejects(readFile(path.join(vault, 'Meradyl.md')), { code: 'ENOENT' });
  console.log('PASS: Electron startup/reopen, real save, close flush, conflict/recovery after restart, Windows system trash, isolated renderer.');
} finally {
  if (desktop) await desktop.close();
  await rm(temporary, { recursive: true, force: true });
}






