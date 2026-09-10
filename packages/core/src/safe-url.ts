import { CampaignError } from './index';
/** Only explicit clicks may launch these OS handlers. */
export function externalUrl(value: string): string {
  if ([...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) throw new CampaignError('invalid_path', 'Collegamento non consentito.');
  let url: URL; try { url = new URL(value); } catch { throw new CampaignError('invalid_path', 'Collegamento non valido.'); }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || ((url.protocol === 'http:' || url.protocol === 'https:') && (!url.hostname || url.username || url.password))) throw new CampaignError('invalid_path', 'Collegamento non consentito.');
  return url.href;
}
