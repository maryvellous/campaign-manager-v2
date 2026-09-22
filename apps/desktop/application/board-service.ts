import { randomUUID } from 'node:crypto';
import { CampaignError, validateNoteId, validateRelativePath } from '../../../packages/core/src/index';
import { BoardRepository } from '../infrastructure/board-repository';
import { LocalStore } from '../infrastructure/local-store';
import { isBoardBoxElement, parseBoardDocument, validateBoardPath, type BoardCardElement, type BoardDocument } from './board-types';
import { projectBoardElementForPlayers, projectPreparedBoardForPlayers } from './board-privacy';

export interface BoardCampaignContext {
  campaignId: string;
  root: string;
}

export class BoardService {
  private repo?: BoardRepository;
  private campaign?: BoardCampaignContext;

  constructor(readonly store: LocalStore) {}

  bind(context: BoardCampaignContext | undefined): void {
    if (!context) { this.repo = undefined; this.campaign = undefined; return; }
    if (this.campaign?.campaignId === context.campaignId && this.campaign.root === context.root) return;
    this.campaign = context;
    this.repo = new BoardRepository(context.root, context.campaignId);
  }

  private required(): { repo: BoardRepository; campaign: BoardCampaignContext } {
    if (!this.repo || !this.campaign) throw new CampaignError('not_found', 'Apri una campagna prima di usare le board.');
    return { repo: this.repo, campaign: this.campaign };
  }

  async list() {
    const { repo, campaign } = this.required();
    return { boards: await repo.discover(), recoveries: await this.store.listBoardRecovery(campaign.campaignId) };
  }

  async create(title: string) {
    const { repo } = this.required();
    const snapshot = await repo.createBoard(title);
    return { snapshot, ...(await this.list()) };
  }

  async open(boardPath: string) {
    const { repo, campaign } = this.required();
    validateBoardPath(boardPath);
    const snapshot = await repo.readBoard(boardPath);
    const recovery = (await this.store.listBoardRecovery(campaign.campaignId)).find(item => item.draft.boardPath === boardPath);
    return { snapshot, recovery };
  }

  async protect(boardPath: string, baseRevision: string, document: BoardDocument) {
    const { campaign } = this.required();
    validateBoardPath(boardPath);
    const valid = parseBoardDocument(document);
    const key = await this.store.putBoardRecovery({
      campaignId: campaign.campaignId,
      boardPath,
      baseRevision,
      document: valid,
      capturedAt: new Date().toISOString()
    });
    return { key };
  }

  async save(boardPath: string, baseRevision: string, document: BoardDocument) {
    const { repo, campaign } = this.required();
    validateBoardPath(boardPath);
    const valid = parseBoardDocument(document);
    await this.protect(boardPath, baseRevision, valid);
    const snapshot = await repo.saveBoard(boardPath, valid, baseRevision);
    await this.store.removeBoardRecovery(campaign.campaignId, boardPath);
    return { snapshot };
  }

  async rename(boardPath: string, title: string) {
    const { repo, campaign } = this.required();
    const recovery = (await this.store.listBoardRecovery(campaign.campaignId)).find(item => item.draft.boardPath === boardPath);
    if (recovery) throw new CampaignError('conflict', 'Salva o scarta la recovery della board prima di rinominarla.');
    const snapshot = await repo.renameBoard(boardPath, title);
    return { snapshot, ...(await this.list()) };
  }

  async importImage(name: string, base64: string) {
    const { repo } = this.required();
    if (typeof name !== 'string' || !name || typeof base64 !== 'string' || !base64) throw new CampaignError('invalid_path', 'Immagine non valida.');
    return { assetPath: await repo.importImage(name, base64) };
  }

  async readAsset(assetPath: string) {
    return { dataUrl: await this.required().repo.readAsset(assetPath) };
  }

  async discardRecovery(boardPath: string) {
    const { campaign } = this.required();
    validateBoardPath(boardPath);
    await this.store.removeBoardRecovery(campaign.campaignId, boardPath);
    return this.list();
  }

  async addCard(boardPath: string, noteId: string, excerpt?: string) {
    const { repo } = this.required();
    validateBoardPath(boardPath);
    validateNoteId(noteId);
    if (excerpt !== undefined && !excerpt.trim()) throw new CampaignError('invalid_path', 'Seleziona del testo prima di portarlo sulla board.');
    const snapshot = await repo.readBoard(boardPath);
    const boxes = snapshot.document.elements.filter(isBoardBoxElement);
    const right = boxes.length ? Math.max(...boxes.map(element => element.x + element.width)) : 60;
    const top = boxes.length ? Math.min(...boxes.map(element => element.y)) : 80;
    const sourceTitle = noteId.split('/').at(-1)!.replace(/\.md$/iu, '');
    const element: BoardCardElement = {
      type: 'card',
      cardKind: excerpt === undefined ? 'note' : 'excerpt',
      elementId: randomUUID(),
      sourceNoteId: noteId,
      sourceTitle,
      ...(excerpt === undefined ? {} : { excerpt }),
      x: boxes.length ? right + 36 : 80,
      y: top + (snapshot.document.elements.filter(element => element.type === 'card').length % 5) * 24,
      width: 280,
      height: excerpt === undefined ? 120 : 180,
      z: Math.max(0, ...snapshot.document.elements.map(element => element.z)) + 1,
      locked: false,
      visibleByDefault: false
    };
    const document: BoardDocument = { ...snapshot.document, elements: [...snapshot.document.elements, element] };
    return { snapshot: await repo.saveBoard(boardPath, document, snapshot.revision), elementId: element.elementId };
  }

  async remapNoteReferences(oldPath: string, newPath: string): Promise<void> {
    const { repo, campaign } = this.required();
    validateRelativePath(oldPath);
    validateRelativePath(newPath);
    const map = (noteId: string) => noteId === oldPath || noteId.startsWith(oldPath + '/') ? newPath + noteId.slice(oldPath.length) : noteId;
    const recoveries = await this.store.listBoardRecovery(campaign.campaignId);
    const recoveryByPath = new Map(recoveries.map(item => [item.draft.boardPath, item]));
    for (const board of await repo.discover()) {
      const before = await repo.readBoard(board.path);
      let changed = false;
      const elements = before.document.elements.map(element => {
        if (element.type !== 'card') return element;
        const sourceNoteId = map(element.sourceNoteId);
        if (sourceNoteId === element.sourceNoteId) return element;
        changed = true;
        return { ...element, sourceNoteId, sourceTitle: sourceNoteId.split('/').at(-1)!.replace(/\.md$/iu, '') };
      });
      const after = changed ? await repo.saveBoard(board.path, { ...before.document, elements }, before.revision) : before;
      const recovery = recoveryByPath.get(board.path);
      if (!recovery) continue;
      let recoveryChanged = false;
      const recoveryElements = recovery.draft.document.elements.map(element => {
        if (element.type !== 'card') return element;
        const sourceNoteId = map(element.sourceNoteId);
        if (sourceNoteId === element.sourceNoteId) return element;
        recoveryChanged = true;
        return { ...element, sourceNoteId, sourceTitle: sourceNoteId.split('/').at(-1)!.replace(/\.md$/iu, '') };
      });
      if (!recoveryChanged && after.revision === before.revision) continue;
      await this.store.putBoardRecovery({
        ...recovery.draft,
        baseRevision: recovery.draft.baseRevision === before.revision ? after.revision : recovery.draft.baseRevision,
        document: recoveryChanged ? { ...recovery.draft.document, elements: recoveryElements } : recovery.draft.document,
        capturedAt: new Date().toISOString()
      });
    }
  }


  async liveProjection(boardPath: string) {
    const { repo } = this.required();
    validateBoardPath(boardPath);
    const snapshot = await repo.readBoard(boardPath);
    return {
      boardPath,
      board: {
        ...projectPreparedBoardForPlayers(snapshot.document),
        title: snapshot.title
      }
    };
  }

  async liveElement(boardPath: string, elementId: string) {
    const { repo } = this.required();
    validateBoardPath(boardPath);
    const snapshot = await repo.readBoard(boardPath);
    const element = snapshot.document.elements.find(element => element.elementId === elementId);
    if (!element) throw new CampaignError('not_found', 'Elemento board non trovato.');
    return {
      boardPath,
      boardId: snapshot.document.boardId,
      title: snapshot.title,
      element: projectBoardElementForPlayers(element)
    };
  }

  async liveElementList(boardPath: string) {
    const { repo } = this.required();
    validateBoardPath(boardPath);
    const snapshot = await repo.readBoard(boardPath);
    return {
      boardPath,
      boardId: snapshot.document.boardId,
      title: snapshot.title,
      elements: snapshot.document.elements.map(element => ({
        elementId: element.elementId,
        type: element.type,
        visibleByDefault: element.visibleByDefault === true,
        label: element.type === 'text' ? element.text.slice(0, 80)
          : element.type === 'token' ? element.name
          : element.type === 'card' ? element.sourceTitle
          : element.type === 'image' ? element.assetPath.split('/').at(-1) ?? 'Immagine'
          : 'Collegamento'
      }))
    };
  }

  async liveAsset(assetPath: string) {
    return this.required().repo.readAssetBinary(assetPath);
  }

}
