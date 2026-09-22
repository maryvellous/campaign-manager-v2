import { CampaignError } from '../../../packages/core/src/index';
import { BoardRepository } from '../infrastructure/board-repository';
import { LocalStore } from '../infrastructure/local-store';
import { parseBoardDocument, validateBoardPath, type BoardDocument } from './board-types';

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
}
