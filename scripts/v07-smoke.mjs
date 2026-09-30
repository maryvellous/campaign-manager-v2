import { Buffer } from 'node:buffer';
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'cmv2-v07-ui-'));
const vault = path.join(temporary, 'Campaign V07');
await mkdir(vault);
await writeFile(path.join(vault, 'Personaggio.md'), '# Personaggio\nUna nota di prova.');
const imagePath = path.join(temporary, 'token.png');
await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64'));

let desktop;
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
  desktop = await electron.launch({ args: ['.', `--user-data-dir=${path.join(temporary, 'profile')}`], cwd: process.cwd(), env });
  const page = await desktop.firstWindow(); const failures = []; page.on('pageerror', error => failures.push(error.message));
  const skipGuide = page.getByRole('button', { name: 'Salta guida', exact: true }); if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click();
  await desktop.evaluate(({ dialog }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }, vault);
  await page.getByRole('button', { name: 'Apri cartella…', exact: true }).first().click();

  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const boardName = page.getByRole('textbox', { name: 'Nome nuova board' });
  await boardName.fill('Scena prova'); await boardName.press('Enter');
  await page.locator('.board-title-button').filter({ hasText: 'Scena prova' }).waitFor();

  const viewport = page.locator('.board-viewport');
  const box = await viewport.boundingBox(); assert.ok(box);

  await page.getByRole('button', { name: /Testo/ }).click();
  await page.mouse.click(box.x + 80, box.y + 90);
  const textDraft = page.locator('.board-text-draft'); await textDraft.fill('Porta chiusa'); await textDraft.press('Control+Enter');
  await page.locator('.board-text-content').filter({ hasText: 'Porta chiusa' }).waitFor();

  await page.getByRole('button', { name: /Token/ }).click();
  await page.mouse.click(box.x + 520, box.y + 160);
  const tokenDraft = page.locator('.board-token-draft'); await tokenDraft.waitFor();
  await tokenDraft.getByPlaceholder('Nome token…').fill('Goblin');
  await tokenDraft.getByRole('button', { name: 'Crea token', exact: true }).click();
  await page.locator('.board-token').filter({ hasText: 'Goblin' }).waitFor();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Immagine/ }).click();
  const chooser = await chooserPromise; await chooser.setFiles(imagePath);
  await page.locator('.board-image').waitFor();

  const save = page.locator('.board-header-actions').getByRole('button', { name: /Salva/ });
  if (await save.isEnabled()) await save.click();
  await page.locator('.board-save-state').filter({ hasText: 'Salvata' }).waitFor();

  const board = JSON.parse(await readFile(path.join(vault, 'Boards', 'Scena prova.board.json'), 'utf8'));
  assert.equal(board.elements.some(element => element.type === 'text' && element.text === 'Porta chiusa'), true);
  assert.equal(board.elements.some(element => element.type === 'token' && element.name === 'Goblin'), true);
  assert.equal(board.elements.some(element => element.type === 'image'), true);

  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('heading', { name: 'Prepara il tavolo e poi aprilo ai giocatori.' }).waitFor();
  assert.equal(await page.locator('.live-steps li').count(), 4);
  assert.equal(await page.getByRole('combobox').filter({ hasText: 'Scena prova' }).count() > 0 || await page.locator('.live-start-board select').inputValue() !== '', true);
  await page.getByText('Discord Activity è un modo alternativo', { exact: false }).waitFor();

  assert.deepEqual(failures, []);
  console.log('PASS V0.7: board text/token/image UI persists and Live setup is guided with a prepared board.');
} catch (error) {
  if (desktop) { const [page] = desktop.windows(); if (page) { await mkdir('work', { recursive: true }); await page.screenshot({ path: 'work/v07-failure.png', fullPage: true }); console.log(await page.locator('body').innerText()); } }
  throw error;
} finally {
  if (desktop) await desktop.close();
  await rm(temporary, { recursive: true, force: true });
}
