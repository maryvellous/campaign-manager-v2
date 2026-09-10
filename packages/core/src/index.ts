export type ErrorCode = 'not_found' | 'permission_denied' | 'read_only' | 'invalid_path' | 'outside_campaign_root' | 'collision' | 'case_collision' | 'conflict' | 'trash_unavailable' | 'disk_full' | 'encoding_error' | 'metadata_invalid' | 'unsupported_schema' | 'io_error';
export class CampaignError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); this.name = 'CampaignError'; }
}
export interface CampaignMetadata { schemaVersion: 1; campaignId: string; name?: string; [key: string]: unknown }
export interface NoteSnapshot { noteId: string; markdown: string; revision: string }
export interface VaultEntry { id: string; kind: 'note' | 'folder' }
export type RecoveryTarget = { kind: 'existing'; noteId: string; baseRevision: string } | { kind: 'new-draft'; draftId: string; parentFolder: string; manualTitle?: string };
export interface RecoveryDraft { campaignId: string; target: RecoveryTarget; markdown: string; capturedAt: string }

export function validateRelativePath(id: string, allowRoot = false): string {
  if (typeof id !== 'string' || (!id && !allowRoot) || id.includes('\\') || id.startsWith('/') || id.includes(':')) throw new CampaignError('invalid_path', 'Usa un percorso relativo alla campagna.');
  if (!id && allowRoot) return id;
  for (const segment of id.split('/')) {
    if (!segment || segment === '.' || segment === '..' || (/[<>:"|?*]/u.test(segment) || [...segment].some(character => character.charCodeAt(0) < 32)) || /[. ]$/u.test(segment) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(segment)) throw new CampaignError('invalid_path', 'Il nome non è compatibile con Windows.');
  }
  return id;
}
export function validateNoteId(id: string): string {
  validateRelativePath(id);
  if (!/\.md$/iu.test(id)) throw new CampaignError('invalid_path', 'La nota deve essere un file Markdown.');
  return id;
}
export function parseMetadata(value: unknown): CampaignMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CampaignError('metadata_invalid', 'campaign.json non è valido.');
  const record = value as Record<string, unknown>;
  if (!Number.isInteger(record.schemaVersion)) throw new CampaignError('metadata_invalid', 'Versione metadata non valida.');
  if (record.schemaVersion !== 1) throw new CampaignError('unsupported_schema', 'Versione della campagna non supportata.');
  if (typeof record.campaignId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(record.campaignId) || (record.name !== undefined && typeof record.name !== 'string')) throw new CampaignError('metadata_invalid', 'Identità della campagna non valida.');
  return record as CampaignMetadata;
}

