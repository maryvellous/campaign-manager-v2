import { externalUrl } from '../../packages/core/src/safe-url';
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as fs from 'node:fs/promises';
import { CampaignService } from './application/campaign-service';
import { LocalStore } from './infrastructure/local-store';
import { CampaignError } from '../../packages/core/src/index';
import { ioError } from './infrastructure/campaign-repository';
import type { BoardDocument } from './infrastructure/board-repository';

let window: BrowserWindow;
let service: CampaignService;
let selectedPath: string | undefined;
let allowClose = false;
let closeRequested = false;
const page = pathToFileURL(path.join(__dirname, 'index.html')).href;
function text(value: unknown, limit = Number.MAX_SAFE_INTEGER): string {
  if (typeof value !== 'string' || value.length > limit) throw new CampaignError('invalid_path', 'Richiesta non valida.');
  return value;
}
function trusted(event: IpcMainInvokeEvent): boolean { return event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === page; }
async function exportText(content: string) {
  const result = await dialog.showSaveDialog(window, { title: 'Esporta bozza', defaultPath: 'Bozza.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
  if (!result.canceled && result.filePath) await fs.writeFile(result.filePath, content, 'utf8');
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  void app.whenReady().then(async () => {
    service = new CampaignService(new LocalStore(path.join(app.getPath('userData'), 'local')));
    window = new BrowserWindow({ width: 1200, height: 820, minWidth: 760, minHeight: 540, show: false, backgroundColor: '#1E1333', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    service.onChange = () => { if (!window.isDestroyed()) window.webContents.send('campaign:state', service.state); };
    ipcMain.handle('campaign:command', async (event, input: unknown) => {
      if (!trusted(event)) return { ok: false, error: { code: 'permission_denied', message: 'Origine non autorizzata.' } };
      return service.run(async () => {
        try {
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CampaignError('invalid_path', 'Richiesta non valida.');
          const command = input as Record<string, unknown>;
          switch (command.action) {
            case 'state': break;
            case 'links': return { ok: true, data: await service.linkDetails() };
            case 'search': return { ok: true, data: await service.searchNotes(text(command.query, 2000)) };
            case 'rebuildSearch': await service.rebuildSearch(); break;
            case 'graph': return { ok: true, data: await service.graphProjection() };
            case 'boardCreate': await service.createBoard(text(command.title, 200)); break;
            case 'boardOpen': await service.openBoard(text(command.relativePath, 300)); break;
            case 'boardRename': await service.renameBoard(text(command.title, 200)); break;
            case 'boardUpdate': if (!command.board || typeof command.board !== 'object' || Array.isArray(command.board)) throw new CampaignError('invalid_path', 'Board non valida.'); await service.updateBoard(command.board as BoardDocument); break;
            case 'boardSave': await service.saveBoard(); break;
            case 'boardImportAsset': {
              const selection = await dialog.showOpenDialog(window, { title: 'Importa immagine nella board', properties: ['openFile'], filters: [{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
              if (!selection.canceled && selection.filePaths[0]) return { ok: true, data: await service.importBoardAsset(selection.filePaths[0]), state: service.state };
              return { ok: false, state: service.state };
            }
            case 'boardAsset': return { ok: true, data: await service.readBoardAsset(text(command.relativePath, 500)) };
            case 'image': return { ok: true, data: await service.readImage(text(command.noteId, 2000), text(command.source, 2000)) };
            case 'external': await shell.openExternal(externalUrl(text(command.url, 8000))); break;
            case 'createLinkedNote': await service.createLinkedNote(text(command.target, 2000)); break;
            case 'close': {
              try {
                if (await service.prepareLeave(false)) { allowClose = true; window.close(); break; }
                const protectedBuffer = await service.prepareLeave(true).catch(() => false);
                const result = await dialog.showMessageBox(window, { type: 'warning', message: 'Ci sono modifiche non salvate.', detail: protectedBuffer ? 'Puoi chiudere conservando la bozza di recupero.' : 'Non è stato possibile proteggere la bozza. Esporta o scarta esplicitamente le modifiche prima di chiudere.', buttons: protectedBuffer ? ['Resta', 'Chiudi conservando bozza'] : ['Resta'], defaultId: 0, cancelId: 0 });
                if (protectedBuffer && result.response === 1) { allowClose = true; window.close(); }
              } finally { closeRequested = false; }
              break;
            }
            case 'choose': {
              const selection = await dialog.showOpenDialog(window, { title: command.relink ? 'Individua cartella campagna' : 'Apri cartella campagna', properties: ['openDirectory'] });
              if (!selection.canceled && selection.filePaths[0]) { selectedPath = selection.filePaths[0]; await service.open(selectedPath, false, command.preserve === true, command.relink === true); }
              break;
            }
            case 'retry': if (selectedPath) await service.open(selectedPath, false, command.preserve === true); break;
            case 'independent': if (selectedPath) await service.open(selectedPath, true, command.preserve === true); break;
            case 'recent': {
              const recent = service.state.preferences.recent.find(r => r.campaignId === text(command.campaignId, 100));
              if (!recent) throw new CampaignError('not_found', 'Campagna non trovata.');
              selectedPath = recent.path; await service.open(recent.path, false, command.preserve === true); break;
            }
            case 'note': await service.openNote(text(command.noteId, 2000), command.newTab === true); break;
            case 'newNote': await service.newNote(command.parentFolder === undefined ? undefined : text(command.parentFolder, 2000), command.newTab === true); break;
            case 'draftTitle': await service.setDraftTitle(text(command.title, 250)); break;
            case 'view': {
              const view = text(command.view, 30);
              if (!['notes', 'search', 'graph', 'board', 'compendium', 'recent', 'favorites', 'settings'].includes(view)) throw new CampaignError('invalid_path', 'Vista non valida.');
              await service.setView(view as Parameters<CampaignService['setView']>[0]); break;
            }
            case 'ui': {
              if (!command.patch || typeof command.patch !== 'object' || Array.isArray(command.patch)) throw new CampaignError('invalid_path', 'Preferenze non valide.');
              await service.setUi(command.patch as Parameters<CampaignService['setUi']>[0]); break;
            }
            case 'favorite': await service.toggleFavorite(text(command.noteId, 2000)); break;
            case 'activateTab': await service.activateTab(text(command.id, 100)); break;
            case 'closeTab': await service.closeTab(text(command.id, 100), command.preserve === true); break;
            case 'history': {
              if (command.direction !== -1 && command.direction !== 1) throw new CampaignError('invalid_path', 'Direzione non valida.');
              await service.navigateHistory(command.direction); break;
            }
            case 'reorderTab': {
              if (!Number.isInteger(command.index) || typeof command.index !== 'number') throw new CampaignError('invalid_path', 'Posizione tab non valida.');
              await service.reorderTab(text(command.id, 100), command.index); break;
            }
            case 'createFolder': await service.createFolder(text(command.id, 2000)); break;
            case 'rename': await service.renameResource(text(command.id, 2000), text(command.title, 250)); break;
            case 'move': await service.moveResource(text(command.id, 2000), text(command.parentFolder, 2000)); break;
            case 'repair': await service.retryRepair(text(command.id, 100)); break;
            case 'trashResource': {
              const id = text(command.id, 2000); const entry = service.state.entries.find(entry => entry.id === id);
              if (!entry) throw new CampaignError('not_found', 'Elemento non trovato nella campagna.');
              const result = await dialog.showMessageBox(window, { type: 'warning', message: entry.kind === 'folder' ? 'Spostare la cartella nel cestino?' : 'Spostare la nota nel cestino?', detail: entry.kind === 'folder' ? `${id}\nLa cartella e tutti i suoi contenuti verranno spostati nel cestino di Windows.` : id, buttons: ['Annulla', 'Sposta nel cestino'], defaultId: 0, cancelId: 0 });
              if (result.response === 1) await service.trashResource(id, target => shell.trashItem(target), true); break;
            }
            case 'closeCampaign': await service.closeCampaign(command.preserve === true); break;
            case 'revealRoot': {
              if (!service.state.campaign) throw new CampaignError('not_found', 'Nessuna campagna aperta.');
              const error = await shell.openPath(service.state.campaign.root);
              if (error) throw new CampaignError('io_error', 'La cartella non è disponibile in Esplora file.');
              break;
            }
            case 'edit': await service.edit(text(command.markdown)); break;
            case 'save': await service.save(); break;
            case 'refresh': await service.refresh(); break;
            case 'resolve': {
              if (command.choice !== 'disk' && command.choice !== 'local') throw new CampaignError('invalid_path', 'Scelta non valida.');
              await service.resolve(command.choice, command.revision === undefined ? undefined : text(command.revision, 100)); break;
            }
            case 'saveAs': await service.saveAs(text(command.noteId, 2000)); break;
            case 'recovery': {
              if (command.choice !== 'restore' && command.choice !== 'discard') throw new CampaignError('invalid_path', 'Scelta non valida.');
              if (command.choice === 'discard') {
                const result = await dialog.showMessageBox(window, { type: 'warning', message: 'Scartare questa bozza di recupero?', buttons: ['Annulla', 'Scarta bozza'], defaultId: 0, cancelId: 0 });
                if (result.response !== 1) break;
              }
              await service.recovery(text(command.key, 100), command.choice); break;
            }
            case 'export': {
              let content = service.state.document?.markdown;
              if (command.key) content = service.state.recoveries.find(r => r.key === text(command.key, 100))?.draft.markdown;
              if (content !== undefined) await exportText(content); break;
            }
            case 'discard': {
              const result = await dialog.showMessageBox(window, { type: 'warning', message: 'Scartare le modifiche locali?', detail: 'La bozza di recupero della nota aperta verrà rimossa. Il file sul disco resta invariato.', buttons: ['Resta', 'Scarta modifiche'], defaultId: 0, cancelId: 0 });
              if (result.response === 1) await service.discard(); break;
            }
            case 'trash': {
              const result = await dialog.showMessageBox(window, { type: 'warning', message: 'Spostare la nota nel cestino?', buttons: ['Annulla', 'Sposta nel cestino'], defaultId: 0, cancelId: 0 });
              if (result.response === 1) await service.trash(target => shell.trashItem(target)); break;
            }
            default: throw new CampaignError('invalid_path', 'Comando non disponibile.');
          }
          return { ok: true, state: service.state };
        } catch (error) { const failure = ioError(error); return { ok: false, state: service.state, error: { code: failure.code, message: failure.message } }; }
      });
    });
    window.on('close', event => {
      if (allowClose) return;
      event.preventDefault();
      if (!closeRequested) {
        closeRequested = true;
        window.webContents.send('campaign:before-close');
      }
    });
    window.on('closed', () => { void service.dispose(false); });
    await service.initialize(); selectedPath = service.state.preferences.lastPath; await window.loadFile(path.join(__dirname, 'index.html')); window.show();
  });
}
app.on('window-all-closed', () => app.quit());




